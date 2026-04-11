use tauri::command;

use crate::home_dir;
use crate::TokioCommandNoWindow;

#[derive(serde::Serialize)]
pub struct SshKeyInfo {
    pub name: String,
    pub key_type: String,
    pub fingerprint: String,
}

#[command]
pub fn list_ssh_keys() -> Result<Vec<SshKeyInfo>, String> {
    let home = home_dir().ok_or("Could not determine home directory")?;
    let ssh_dir = std::path::PathBuf::from(&home).join(".ssh");

    if !ssh_dir.exists() {
        return Ok(Vec::new());
    }

    let entries = std::fs::read_dir(&ssh_dir).map_err(|e| e.to_string())?;
    let mut keys = Vec::new();

    for entry in entries.flatten() {
        let path = entry.path();
        let name = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_string();

        // Only look at .pub files
        if !name.ends_with(".pub") {
            continue;
        }

        // Read the public key file
        let content = match std::fs::read_to_string(&path) {
            Ok(c) => c,
            Err(_) => continue,
        };

        let parts: Vec<&str> = content.trim().splitn(3, ' ').collect();
        let key_type = parts.first().unwrap_or(&"unknown").to_string();

        // Generate a simple fingerprint (last 16 chars of the key)
        let fingerprint = if let Some(key_data) = parts.get(1) {
            if key_data.len() > 20 {
                format!("...{}", &key_data[key_data.len() - 16..])
            } else {
                key_data.to_string()
            }
        } else {
            "unknown".to_string()
        };

        keys.push(SshKeyInfo {
            name: name.trim_end_matches(".pub").to_string(),
            key_type,
            fingerprint,
        });
    }

    keys.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(keys)
}

#[command]
pub async fn test_ssh(ssh_command: String) -> Result<String, String> {
    let parts: Vec<String> = ssh_command.split_whitespace().map(String::from).collect();
    if parts.is_empty() {
        return Err("Empty SSH command".to_string());
    }
    let mut cmd = tokio::process::Command::new(&parts[0]);
    cmd.no_window();
    cmd.args(["-o", "BatchMode=yes", "-o", "ConnectTimeout=5"]);
    for arg in &parts[1..] {
        cmd.arg(arg);
    }
    cmd.arg("exit");
    cmd.kill_on_drop(true);

    match tokio::time::timeout(std::time::Duration::from_secs(10), cmd.output()).await {
        Ok(Ok(output)) => {
            if output.status.success() {
                Ok("Connected successfully".to_string())
            } else {
                let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
                Err(if stderr.is_empty() {
                    "Connection failed".to_string()
                } else {
                    stderr
                })
            }
        }
        Ok(Err(e)) => Err(e.to_string()),
        Err(_) => Err("Connection timed out".to_string()),
    }
}

#[command]
pub async fn ssh_mkdir(ssh_command: String, path: String) -> Result<String, String> {
    let parts: Vec<String> = ssh_command.split_whitespace().map(String::from).collect();
    if parts.is_empty() {
        return Err("Empty SSH command".to_string());
    }
    let mut cmd = tokio::process::Command::new(&parts[0]);
    cmd.no_window();
    cmd.args(["-o", "BatchMode=yes", "-o", "ConnectTimeout=5"]);
    for arg in &parts[1..] {
        cmd.arg(arg);
    }
    let remote_path = if let Some(stripped) = path.strip_prefix("~/") {
        format!("$HOME/{}", stripped)
    } else if path == "~" {
        "$HOME".to_string()
    } else {
        path.clone()
    };
    cmd.arg(format!("mkdir -p \"{}\"", remote_path.replace('"', "\\\"")));
    cmd.kill_on_drop(true);

    match tokio::time::timeout(std::time::Duration::from_secs(10), cmd.output()).await {
        Ok(Ok(output)) => {
            if output.status.success() {
                Ok("Directory ensured on remote".to_string())
            } else {
                let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
                Err(if stderr.is_empty() {
                    "Failed to create remote directory".to_string()
                } else {
                    stderr
                })
            }
        }
        Ok(Err(e)) => Err(e.to_string()),
        Err(_) => Err("SSH mkdir timed out".to_string()),
    }
}

#[command]
pub async fn ssh_check_path(ssh_command: String, path: String) -> Result<bool, String> {
    let parts: Vec<String> = ssh_command.split_whitespace().map(String::from).collect();
    if parts.is_empty() {
        return Err("Empty SSH command".to_string());
    }
    let remote_path = if let Some(stripped) = path.strip_prefix("~/") {
        format!("$HOME/{}", stripped)
    } else if path == "~" {
        "$HOME".to_string()
    } else {
        path.clone()
    };
    let mut cmd = tokio::process::Command::new(&parts[0]);
    cmd.no_window();
    cmd.args(["-o", "BatchMode=yes", "-o", "ConnectTimeout=5"]);
    for arg in &parts[1..] {
        cmd.arg(arg);
    }
    cmd.arg(format!("test -e \"{}\"", remote_path.replace('"', "\\\"")));
    cmd.kill_on_drop(true);

    match tokio::time::timeout(std::time::Duration::from_secs(10), cmd.output()).await {
        Ok(Ok(output)) => Ok(output.status.success()),
        Ok(Err(e)) => Err(e.to_string()),
        Err(_) => Err("SSH check path timed out".to_string()),
    }
}

#[command]
pub async fn ssh_write_file(ssh_command: String, path: String, contents: String) -> Result<(), String> {
    let parts: Vec<String> = ssh_command.split_whitespace().map(String::from).collect();
    if parts.is_empty() {
        return Err("Empty SSH command".to_string());
    }
    let remote_path = if let Some(stripped) = path.strip_prefix("~/") {
        format!("$HOME/{}", stripped)
    } else if path == "~" {
        "$HOME".to_string()
    } else {
        path.clone()
    };
    let mut cmd = tokio::process::Command::new(&parts[0]);
    cmd.no_window();
    cmd.args(["-o", "BatchMode=yes", "-o", "ConnectTimeout=10"]);
    for arg in &parts[1..] {
        cmd.arg(arg);
    }
    cmd.arg(format!("cat > \"{}\"", remote_path.replace('"', "\\\"")));
    cmd.stdin(std::process::Stdio::piped());
    cmd.kill_on_drop(true);

    let mut child = cmd.spawn().map_err(|e| e.to_string())?;
    if let Some(mut stdin) = child.stdin.take() {
        use tokio::io::AsyncWriteExt;
        stdin
            .write_all(contents.as_bytes())
            .await
            .map_err(|e| e.to_string())?;
        drop(stdin);
    }

    match tokio::time::timeout(std::time::Duration::from_secs(15), child.wait()).await {
        Ok(Ok(status)) => {
            if status.success() {
                Ok(())
            } else {
                Err("Failed to write file on remote".to_string())
            }
        }
        Ok(Err(e)) => Err(e.to_string()),
        Err(_) => Err("SSH write_file timed out".to_string()),
    }
}
