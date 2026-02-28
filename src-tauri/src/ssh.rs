use tauri::command;

#[command]
pub async fn test_ssh(ssh_command: String) -> Result<String, String> {
    let parts: Vec<String> = ssh_command.split_whitespace().map(String::from).collect();
    if parts.is_empty() {
        return Err("Empty SSH command".to_string());
    }
    let mut cmd = tokio::process::Command::new(&parts[0]);
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
