#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};
use tauri::{command, window::Color, Emitter, Manager, State};

// ── Per-session data ──────────────────────────────────────────────────────────

struct SessionData {
    writer: Option<Box<dyn Write + Send>>,
    master: Option<Box<dyn MasterPty + Send>>,
    alive: Arc<AtomicBool>,
    ssh_command: Option<String>,
}

struct PtyState {
    sessions: Mutex<HashMap<String, SessionData>>,
}

// ── Tauri event payloads ──────────────────────────────────────────────────────

#[derive(serde::Serialize, Clone)]
struct PtyOutput {
    session_id: String,
    data: String,
}

#[derive(serde::Serialize, Clone)]
struct PtyExit {
    session_id: String,
}

// ── Misc commands ─────────────────────────────────────────────────────────────

#[command]
fn greet(name: &str) -> String {
    format!("Hello, {}! Welcome to NightForge.", name)
}

#[command]
fn close_splash(app: tauri::AppHandle) {
    if let Some(splash) = app.get_webview_window("splashscreen") {
        let _ = splash.close();
    }
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.show();
    }
}

fn expand_tilde(path: &str) -> String {
    if !path.starts_with('~') {
        return path.to_string();
    }
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .ok();
    if let Some(home_dir) = home {
        return path.replacen('~', &home_dir, 1);
    }
    #[cfg(target_os = "windows")]
    if let (Ok(drive), Ok(homepath)) = (std::env::var("HOMEDRIVE"), std::env::var("HOMEPATH")) {
        return path.replacen('~', &format!("{}{}", drive, homepath), 1);
    }
    path.to_string()
}

// ── PTY commands ──────────────────────────────────────────────────────────────

#[command]
fn spawn_terminal(
    app: tauri::AppHandle,
    state: State<'_, PtyState>,
    session_id: String,
    rows: Option<u16>,
    cols: Option<u16>,
    ssh_command: Option<String>,
    cwd: Option<String>,
) -> Result<(), String> {
    // Skip if this session is already alive
    {
        let sessions = state.sessions.lock().unwrap();
        if sessions
            .get(&session_id)
            .map(|s| s.alive.load(Ordering::SeqCst))
            .unwrap_or(false)
        {
            return Ok(());
        }
    }

    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows: rows.unwrap_or(24),
            cols: cols.unwrap_or(80),
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())?;

    let cmd = if let Some(ref ssh_cmd) = ssh_command {
        let parts: Vec<&str> = ssh_cmd.split_whitespace().collect();
        if parts.is_empty() {
            return Err("Empty SSH command".to_string());
        }
        let mut cmd = CommandBuilder::new(parts[0]);
        for arg in &parts[1..] {
            cmd.arg(arg);
        }
        cmd.env("TERM", "xterm-256color");
        cmd.env("COLORTERM", "truecolor");
        cmd
    } else {
        let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
        let mut cmd = CommandBuilder::new(&shell);
        cmd.arg("-l");
        cmd.env("TERM", "xterm-256color");
        cmd.env("COLORTERM", "truecolor");
        if let Some(ref dir) = cwd {
            let expanded = expand_tilde(dir);
            if !expanded.is_empty() {
                cmd.cwd(&expanded);
            }
        }
        cmd
    };

    let mut child = pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| e.to_string())?;
    drop(pair.slave);

    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;
    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let alive_flag = Arc::new(AtomicBool::new(true));

    {
        let mut sessions = state.sessions.lock().unwrap();
        sessions.insert(
            session_id.clone(),
            SessionData {
                writer: Some(writer),
                master: Some(pair.master),
                alive: Arc::clone(&alive_flag),
                ssh_command,
            },
        );
    }

    // Reader thread — streams PTY output to the frontend
    let sid_r = session_id.clone();
    let alive_r = Arc::clone(&alive_flag);
    let app_r = app.clone();
    std::thread::spawn(move || {
        let mut buf = [0u8; 8192];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    let data = String::from_utf8_lossy(&buf[..n]).to_string();
                    let _ = app_r.emit(
                        "pty-output",
                        PtyOutput {
                            session_id: sid_r.clone(),
                            data,
                        },
                    );
                }
                Err(_) => break,
            }
        }
        alive_r.store(false, Ordering::SeqCst);
        let _ = app_r.emit("pty-exit", PtyExit { session_id: sid_r });
    });

    // Child-wait thread — fires pty-exit when the process exits
    let sid_c = session_id.clone();
    let app_c = app.clone();
    std::thread::spawn(move || {
        let _ = child.wait();
        alive_flag.store(false, Ordering::SeqCst);
        let _ = app_c.emit("pty-exit", PtyExit { session_id: sid_c });
    });

    Ok(())
}

#[command]
fn pty_write(
    session_id: String,
    data: String,
    state: State<'_, PtyState>,
) -> Result<(), String> {
    let mut sessions = state.sessions.lock().unwrap();
    if let Some(session) = sessions.get_mut(&session_id)
        && let Some(ref mut writer) = session.writer {
        writer.write_all(data.as_bytes()).map_err(|e| e.to_string())?;
        writer.flush().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[command]
fn pty_resize(
    session_id: String,
    rows: u16,
    cols: u16,
    state: State<'_, PtyState>,
) -> Result<(), String> {
    let sessions = state.sessions.lock().unwrap();
    if let Some(session) = sessions.get(&session_id)
        && let Some(ref master) = session.master {
        master
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[command]
fn kill_terminal(session_id: String, state: State<'_, PtyState>) -> Result<(), String> {
    let mut sessions = state.sessions.lock().unwrap();
    if let Some(session) = sessions.get_mut(&session_id) {
        session.alive.store(false, Ordering::SeqCst);
        session.writer = None;
        session.master = None;
    }
    sessions.remove(&session_id);
    Ok(())
}

#[command]
fn is_terminal_alive(session_id: String, state: State<'_, PtyState>) -> bool {
    let sessions = state.sessions.lock().unwrap();
    sessions
        .get(&session_id)
        .map(|s| s.alive.load(Ordering::SeqCst))
        .unwrap_or(false)
}

#[command]
fn get_terminal_info(
    session_id: String,
    state: State<'_, PtyState>,
) -> std::collections::HashMap<String, String> {
    let mut info = std::collections::HashMap::new();
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
    let shell_name = shell.rsplit('/').next().unwrap_or(&shell).to_string();
    info.insert("shell".into(), shell_name);
    info.insert("shellPath".into(), shell);
    if let Ok(user) = std::env::var("USER") {
        info.insert("user".into(), user);
    }
    if let Ok(hostname) = hostname::get() {
        info.insert("hostname".into(), hostname.to_string_lossy().to_string());
    }
    if let Ok(home) = std::env::var("HOME") {
        info.insert("home".into(), home);
    }
    info.insert("pid".into(), std::process::id().to_string());

    let sessions = state.sessions.lock().unwrap();
    if let Some(session) = sessions.get(&session_id)
        && let Some(ref ssh_cmd) = session.ssh_command {
        info.insert("isSSH".into(), "true".into());
        info.insert("sshCommand".into(), ssh_cmd.clone());
        let parts: Vec<&str> = ssh_cmd.split_whitespace().collect();
        if let Some(target) = parts.iter().find(|p| p.contains('@')) {
            info.insert("sshTarget".into(), target.to_string());
        } else if let Some(last) = parts.last() {
            info.insert("sshTarget".into(), last.to_string());
        }
    }
    info
}

// ── SSH helpers ───────────────────────────────────────────────────────────────

#[command]
async fn test_ssh(ssh_command: String) -> Result<String, String> {
    let parts: Vec<String> = ssh_command
        .split_whitespace()
        .map(String::from)
        .collect();
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
async fn ssh_mkdir(ssh_command: String, path: String) -> Result<String, String> {
    let parts: Vec<String> = ssh_command
        .split_whitespace()
        .map(String::from)
        .collect();
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
async fn ssh_check_path(ssh_command: String, path: String) -> Result<bool, String> {
    let parts: Vec<String> = ssh_command
        .split_whitespace()
        .map(String::from)
        .collect();
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

// ── Path / filesystem helpers ─────────────────────────────────────────────────

#[command]
fn get_cwd() -> String {
    std::env::current_dir()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default()
}

#[command]
fn check_path_exists(path: String) -> Result<bool, String> {
    use std::path::PathBuf;
    let expanded = expand_tilde(&path);
    if expanded.is_empty() {
        return Ok(false);
    }
    Ok(PathBuf::from(&expanded).exists())
}

#[command]
fn ensure_project_dir(path: String) -> Result<String, String> {
    use std::fs;
    use std::path::PathBuf;

    let expanded = expand_tilde(&path);
    if expanded.is_empty() {
        return Err("Project path is empty".to_string());
    }
    let path_obj = PathBuf::from(&expanded);
    if path_obj.exists() {
        if path_obj.is_dir() {
            return Ok("Directory already exists".to_string());
        } else {
            return Err("Path exists but is not a directory".to_string());
        }
    }
    if let Ok(()) = fs::create_dir_all(&path_obj) {
        return Ok("Directory created".to_string());
    }

    #[cfg(target_os = "macos")]
    {
        let script = format!(
            "do shell script \"mkdir -p '{}'\" with administrator privileges",
            expanded.replace('\'', "'\\''")
        );
        let output = std::process::Command::new("osascript")
            .arg("-e")
            .arg(&script)
            .output()
            .map_err(|e| format!("Failed to request admin privileges: {}", e))?;
        if output.status.success() {
            return Ok("Directory created (elevated)".to_string());
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();
            return Err(format!(
                "Failed to create directory with admin privileges: {}",
                stderr
            ));
        }
    }

    #[cfg(target_os = "linux")]
    {
        let output = std::process::Command::new("pkexec")
            .arg("mkdir")
            .arg("-p")
            .arg(&expanded)
            .output()
            .map_err(|e| format!("Failed to request admin privileges: {}", e))?;
        if output.status.success() {
            return Ok("Directory created (elevated)".to_string());
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();
            return Err(format!(
                "Failed to create directory with admin privileges: {}",
                stderr
            ));
        }
    }

    #[cfg(target_os = "windows")]
    {
        let output = std::process::Command::new("powershell")
            .args([
                "-Command",
                &format!(
                    "New-Item -ItemType Directory -Force -Path '{}'",
                    expanded.replace('\'', "''")
                ),
            ])
            .output()
            .map_err(|e| format!("Failed to create directory: {}", e))?;
        if output.status.success() {
            return Ok("Directory created".to_string());
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();
            return Err(format!("Failed to create directory: {}", stderr));
        }
    }

    #[allow(unreachable_code)]
    Err("Unsupported platform for elevated directory creation".to_string())
}

#[derive(serde::Serialize)]
struct PathValidationResult {
    valid: bool,
    error: Option<String>,
}

#[command]
fn validate_folder_path(path: String) -> PathValidationResult {
    use std::path::Path;
    let path_obj = Path::new(&path);
    if !path_obj.exists() {
        return PathValidationResult {
            valid: false,
            error: Some("Path does not exist".to_string()),
        };
    }
    if !path_obj.is_dir() {
        return PathValidationResult {
            valid: false,
            error: Some("Path is not a directory".to_string()),
        };
    }
    PathValidationResult {
        valid: true,
        error: None,
    }
}

#[command]
fn validate_file_path(path: String, expected_extension: Option<String>) -> PathValidationResult {
    use std::path::Path;
    let path_obj = Path::new(&path);
    if !path_obj.exists() {
        return PathValidationResult {
            valid: false,
            error: Some("File does not exist".to_string()),
        };
    }
    if !path_obj.is_file() {
        return PathValidationResult {
            valid: false,
            error: Some("Path is not a file".to_string()),
        };
    }
    if let Some(ext) = expected_extension {
        if let Some(file_ext) = path_obj.extension() {
            if file_ext.to_string_lossy().to_lowercase() != ext.to_lowercase() {
                return PathValidationResult {
                    valid: false,
                    error: Some(format!("File must have .{} extension", ext)),
                };
            }
        } else {
            return PathValidationResult {
                valid: false,
                error: Some(format!("File must have .{} extension", ext)),
            };
        }
    }
    PathValidationResult {
        valid: true,
        error: None,
    }
}

// ── Entry point ───────────────────────────────────────────────────────────────

fn main() {
    tauri::Builder::default()
        .manage(PtyState {
            sessions: Mutex::new(HashMap::new()),
        })
        .setup(|app| {
            if let Some(splash) = app.get_webview_window("splashscreen") {
                let _ = splash.set_background_color(Some(Color(0, 0, 0, 0)));
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            close_splash,
            spawn_terminal,
            pty_write,
            pty_resize,
            kill_terminal,
            is_terminal_alive,
            get_terminal_info,
            test_ssh,
            ssh_mkdir,
            get_cwd,
            check_path_exists,
            ssh_check_path,
            ensure_project_dir,
            validate_folder_path,
            validate_file_path,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
