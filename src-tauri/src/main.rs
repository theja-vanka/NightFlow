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

// ── Python environment setup ──────────────────────────────────────────────────

#[derive(serde::Serialize, serde::Deserialize)]
struct EnvSetupResult {
    status: String,
    message: String,
    python_version: Option<String>,
    autotimm_version: Option<String>,
}

/// Find the `uv` binary, checking PATH and common install locations.
fn find_uv() -> Option<String> {
    let candidates = ["uv".to_string()];
    let home = std::env::var("HOME").unwrap_or_default();
    let extra = [
        format!("{}/.local/bin/uv", home),
        format!("{}/.cargo/bin/uv", home),
    ];

    for path in candidates.iter().chain(extra.iter()) {
        if let Ok(output) = std::process::Command::new(path)
            .arg("--version")
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status()
            && output.success()
        {
            return Some(path.clone());
        }
    }
    None
}

/// Ensure `uv` is installed locally; if missing, install via the official script.
/// Returns the path to the `uv` binary.
async fn ensure_uv_available() -> Result<String, String> {
    if let Some(path) = find_uv() {
        return Ok(path);
    }

    let install = tokio::process::Command::new("sh")
        .args(["-c", "curl -LsSf https://astral.sh/uv/install.sh | sh"])
        .output()
        .await
        .map_err(|e| format!("Failed to run uv installer: {}", e))?;

    if !install.status.success() {
        let stderr = String::from_utf8_lossy(&install.stderr).to_string();
        return Err(format!("uv installation failed: {}", stderr));
    }

    find_uv().ok_or_else(|| "uv was installed but could not be found on PATH".to_string())
}

#[derive(serde::Serialize, serde::Deserialize)]
struct UvStatus {
    installed: bool,
    version: Option<String>,
    message: String,
}

/// Tauri command: check if uv exists locally, install if missing.
#[command]
async fn ensure_uv() -> Result<UvStatus, String> {
    let uv_bin = match ensure_uv_available().await {
        Ok(path) => path,
        Err(e) => {
            return Ok(UvStatus {
                installed: false,
                version: None,
                message: e,
            });
        }
    };

    // Get version string
    let version = tokio::process::Command::new(&uv_bin)
        .arg("--version")
        .output()
        .await
        .ok()
        .filter(|o| o.status.success())
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string());

    Ok(UvStatus {
        installed: true,
        version,
        message: "uv is available".to_string(),
    })
}

/// Tauri command: check if uv exists on remote, install if missing.
#[command]
async fn ssh_ensure_uv(ssh_command: String) -> Result<UvStatus, String> {
    let parts: Vec<String> = ssh_command
        .split_whitespace()
        .map(String::from)
        .collect();
    if parts.is_empty() {
        return Err("Empty SSH command".to_string());
    }

    let script = r#"export PATH="$HOME/.local/bin:$HOME/.cargo/bin:$PATH"; \
if command -v uv >/dev/null 2>&1; then \
  VER=$(uv --version 2>/dev/null); \
  echo "{\"installed\":true,\"version\":\"$VER\",\"message\":\"uv is available\"}"; \
else \
  INSTALL_ERR=$(curl -LsSf https://astral.sh/uv/install.sh | sh 2>&1); \
  if [ $? -ne 0 ]; then \
    echo "{\"installed\":false,\"version\":null,\"message\":\"uv installation failed\"}"; \
    exit 0; \
  fi; \
  export PATH="$HOME/.local/bin:$HOME/.cargo/bin:$PATH"; \
  VER=$(uv --version 2>/dev/null); \
  echo "{\"installed\":true,\"version\":\"$VER\",\"message\":\"uv was installed\"}"; \
fi"#;

    let mut cmd = tokio::process::Command::new(&parts[0]);
    cmd.args(["-o", "BatchMode=yes", "-o", "ConnectTimeout=10"]);
    for arg in &parts[1..] {
        cmd.arg(arg);
    }
    cmd.arg(script);
    cmd.kill_on_drop(true);

    match tokio::time::timeout(std::time::Duration::from_secs(60), cmd.output()).await {
        Ok(Ok(output)) => {
            let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if stdout.is_empty() || !output.status.success() {
                let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
                return Ok(UvStatus {
                    installed: false,
                    version: None,
                    message: format!("SSH uv check failed: {}", stderr),
                });
            }
            serde_json::from_str::<UvStatus>(&stdout).map_err(|e| {
                format!("Failed to parse uv status: {} (raw: {})", e, stdout)
            })
        }
        Ok(Err(e)) => Err(e.to_string()),
        Err(_) => Ok(UvStatus {
            installed: false,
            version: None,
            message: "SSH uv check timed out".to_string(),
        }),
    }
}

/// Query Python and autotimm versions from an existing venv.
async fn get_venv_versions(venv_path: &std::path::Path) -> (Option<String>, Option<String>) {
    let python = venv_path.join("bin").join("python");

    let py_ver = tokio::process::Command::new(&python)
        .args(["--version"])
        .output()
        .await
        .ok()
        .filter(|o| o.status.success())
        .map(|o| {
            String::from_utf8_lossy(&o.stdout)
                .trim()
                .trim_start_matches("Python ")
                .to_string()
        });

    let at_ver = tokio::process::Command::new(&python)
        .args(["-c", "import autotimm; print(autotimm.__version__)"])
        .output()
        .await
        .ok()
        .filter(|o| o.status.success())
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string());

    (py_ver, at_ver)
}

#[command]
async fn setup_python_env(project_path: String) -> Result<EnvSetupResult, String> {
    let expanded = expand_tilde(&project_path);
    let venv_path = std::path::PathBuf::from(&expanded).join(".venv");

    // 1. If a project-local .venv exists, use it — install autotimm if missing
    if venv_path.exists() {
        let (python_version, autotimm_version) = get_venv_versions(&venv_path).await;
        if autotimm_version.is_none() {
            let uv_bin = find_uv().unwrap_or_else(|| "uv".to_string());
            let _ = tokio::process::Command::new(&uv_bin)
                .args(["pip", "install", "autotimm[tensorboard]", "--python", ".venv/bin/python"])
                .current_dir(&expanded)
                .output()
                .await;
            let (python_version, autotimm_version) = get_venv_versions(&venv_path).await;
            return Ok(EnvSetupResult {
                status: "exists".to_string(),
                message: "Using project .venv".to_string(),
                python_version,
                autotimm_version,
            });
        }
        return Ok(EnvSetupResult {
            status: "exists".to_string(),
            message: "Using project .venv".to_string(),
            python_version,
            autotimm_version,
        });
    }

    // 2. Check if the system/active Python already has autotimm installed
    let sys_check = tokio::process::Command::new("python3")
        .args(["-c", "import autotimm; print(autotimm.__version__)"])
        .output()
        .await;
    if let Ok(ref out) = sys_check
        && out.status.success()
    {
        let at_ver = String::from_utf8_lossy(&out.stdout).trim().to_string();
        let py_ver = tokio::process::Command::new("python3")
            .args(["--version"])
            .output()
            .await
            .ok()
            .filter(|o| o.status.success())
            .map(|o| String::from_utf8_lossy(&o.stdout).trim().trim_start_matches("Python ").to_string());
        return Ok(EnvSetupResult {
            status: "system".to_string(),
            message: "Using system Python environment".to_string(),
            python_version: py_ver,
            autotimm_version: Some(at_ver),
        });
    }

    // 3. No existing env — create a .venv with uv using Python 3.12
    let uv_bin = find_uv().unwrap_or_else(|| "uv".to_string());

    // Ensure Python 3.12 is installed via uv (with timeout to prevent hanging)
    let _ = tokio::time::timeout(
        std::time::Duration::from_secs(120),
        tokio::process::Command::new(&uv_bin)
            .args(["python", "install", "3.12"])
            .output(),
    )
    .await;

    let uv_args = vec!["venv".to_string(), ".venv".to_string(), "--python".to_string(), "3.12".to_string()];

    // Clean up any leftover partial .venv from previous failed attempts
    if venv_path.exists() {
        let _ = std::fs::remove_dir_all(&venv_path);
    }

    let venv_output = tokio::process::Command::new(&uv_bin)
        .args(&uv_args)
        .current_dir(&expanded)
        .output()
        .await
        .map_err(|e| format!("Failed to run uv venv: {}", e))?;

    if !venv_output.status.success() {
        let stderr = String::from_utf8_lossy(&venv_output.stderr).to_string();
        let _ = std::fs::remove_dir_all(&venv_path);
        return Ok(EnvSetupResult {
            status: "error".to_string(),
            message: format!("Failed to create venv: {}", stderr),
            python_version: None,
            autotimm_version: None,
        });
    }

    // Install autotimm[tensorboard] using uv pip
    let install_output = tokio::process::Command::new(&uv_bin)
        .args(["pip", "install", "autotimm[tensorboard]", "--python", ".venv/bin/python"])
        .current_dir(&expanded)
        .output()
        .await
        .map_err(|e| format!("Failed to run pip install: {}", e))?;

    if !install_output.status.success() {
        let stderr = String::from_utf8_lossy(&install_output.stderr).to_string();
        return Ok(EnvSetupResult {
            status: "error".to_string(),
            message: format!("Failed to install dependencies: {}", stderr),
            python_version: None,
            autotimm_version: None,
        });
    }

    let (python_version, autotimm_version) = get_venv_versions(&venv_path).await;
    Ok(EnvSetupResult {
        status: "created".to_string(),
        message: "Virtual environment created and dependencies installed".to_string(),
        python_version,
        autotimm_version,
    })
}

#[command]
async fn ssh_setup_python_env(
    ssh_command: String,
    project_path: String,
) -> Result<EnvSetupResult, String> {
    let parts: Vec<String> = ssh_command
        .split_whitespace()
        .map(String::from)
        .collect();
    if parts.is_empty() {
        return Err("Empty SSH command".to_string());
    }

    let remote_path = if let Some(stripped) = project_path.strip_prefix("~/") {
        format!("$HOME/{}", stripped)
    } else if project_path == "~" {
        "$HOME".to_string()
    } else {
        project_path.clone()
    };

    let script = format!(
        r#"export PATH="$HOME/.local/bin:$HOME/.cargo/bin:$PATH"
cd "{path}" || exit 1
ej() {{ printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g; s/\t/\\t/g' | tr '\n' ' '; }}
jout() {{
  local s="$1" m="$2" pv="$3" av="$4"
  m=$(ej "$m")
  [ -n "$pv" ] && pv="\"$pv\"" || pv=null
  [ -n "$av" ] && av="\"$av\"" || av=null
  printf '{{"status":"%s","message":"%s","python_version":%s,"autotimm_version":%s}}\n' "$s" "$m" "$pv" "$av"
}}
if [ -d .venv ]; then
  PV=$(.venv/bin/python --version 2>/dev/null | sed 's/Python //')
  AV=$(.venv/bin/python -c "import autotimm; print(autotimm.__version__)" 2>/dev/null)
  if [ -z "$AV" ]; then
    uv pip install 'autotimm[tensorboard]' --python .venv/bin/python >/dev/null 2>&1
    AV=$(.venv/bin/python -c "import autotimm; print(autotimm.__version__)" 2>/dev/null)
  fi
  jout exists "Using project .venv" "$PV" "$AV"
elif SYS_AV=$(python3 -c "import autotimm; print(autotimm.__version__)" 2>/dev/null); then
  SYS_PV=$(python3 --version 2>/dev/null | sed 's/Python //')
  jout system "Using system Python environment" "$SYS_PV" "$SYS_AV"
else
  rm -rf .venv 2>/dev/null
  uv python install 3.12 >/dev/null 2>&1
  VENV_ERR=$(uv venv .venv --python 3.12 2>&1)
  if [ $? -ne 0 ]; then
    rm -rf .venv 2>/dev/null
    jout error "Failed to create venv: $VENV_ERR" "" ""
    exit 0
  fi
  PIP_ERR=$(uv pip install 'autotimm[tensorboard]' --python .venv/bin/python 2>&1)
  if [ $? -ne 0 ]; then
    jout error "Failed to install dependencies: $PIP_ERR" "" ""
    exit 0
  fi
  PV=$(.venv/bin/python --version 2>/dev/null | sed 's/Python //')
  AV=$(.venv/bin/python -c "import autotimm; print(autotimm.__version__)" 2>/dev/null)
  jout created "Virtual environment created and dependencies installed" "$PV" "$AV"
fi"#,
        path = remote_path.replace('"', "\\\"")
    );

    let mut cmd = tokio::process::Command::new(&parts[0]);
    cmd.args(["-o", "BatchMode=yes", "-o", "ConnectTimeout=10"]);
    for arg in &parts[1..] {
        cmd.arg(arg);
    }
    cmd.arg(script);
    cmd.kill_on_drop(true);

    match tokio::time::timeout(std::time::Duration::from_secs(300), cmd.output()).await {
        Ok(Ok(output)) => {
            let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if stdout.is_empty() || !output.status.success() {
                let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
                return Ok(EnvSetupResult {
                    status: "error".to_string(),
                    message: format!("SSH env setup failed: {}", stderr),
                    python_version: None,
                    autotimm_version: None,
                });
            }
            serde_json::from_str::<EnvSetupResult>(&stdout).map_err(|e| {
                format!("Failed to parse env setup output: {} (raw: {})", e, stdout)
            })
        }
        Ok(Err(e)) => Err(e.to_string()),
        Err(_) => Ok(EnvSetupResult {
            status: "error".to_string(),
            message: "SSH env setup timed out (300s)".to_string(),
            python_version: None,
            autotimm_version: None,
        }),
    }
}

// ── Training subprocess ──────────────────────────────────────────────────────

const TRAINING_META_FILE: &str = ".nightforge_training.json";
const TRAINING_LOG_FILE: &str = "training_events.jsonl";

/// Managed state for training processes (keyed by project/session id).
struct TrainingState {
    processes: Mutex<HashMap<String, TrainingProcess>>,
}

struct TrainingProcess {
    child: Option<tokio::process::Child>,
    alive: Arc<AtomicBool>,
    _log_file: String,
}

/// Metadata persisted to disk so we can reconnect after an app crash.
#[derive(serde::Serialize, serde::Deserialize, Clone)]
struct TrainingMeta {
    pid: u32,
    session_id: String,
    run_id: String,
    log_file: String,
    command: String,
    started_at: f64,
}

#[derive(serde::Serialize, Clone)]
struct TrainingEvent {
    session_id: String,
    data: serde_json::Value,
}

#[derive(serde::Serialize, Clone)]
struct TrainingLog {
    session_id: String,
    data: String,
}

/// Check whether a PID is still alive (Unix: kill(pid, 0)).
fn is_pid_alive(pid: u32) -> bool {
    #[cfg(unix)]
    {
        unsafe { libc::kill(pid as i32, 0) == 0 }
    }
    #[cfg(not(unix))]
    {
        // On non-unix fallback: assume alive (safe — log file will tell us)
        let _ = pid;
        true
    }
}

fn meta_path(project_dir: &str) -> std::path::PathBuf {
    std::path::PathBuf::from(expand_tilde(project_dir)).join(TRAINING_META_FILE)
}

fn log_path(project_dir: &str) -> std::path::PathBuf {
    std::path::PathBuf::from(expand_tilde(project_dir)).join(TRAINING_LOG_FILE)
}

fn write_training_meta(project_dir: &str, meta: &TrainingMeta) -> Result<(), String> {
    let path = meta_path(project_dir);
    let json = serde_json::to_string_pretty(meta).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| format!("Failed to write training meta: {}", e))
}

fn read_training_meta(project_dir: &str) -> Option<TrainingMeta> {
    let path = meta_path(project_dir);
    let data = std::fs::read_to_string(&path).ok()?;
    serde_json::from_str(&data).ok()
}

fn remove_training_meta(project_dir: &str) {
    let _ = std::fs::remove_file(meta_path(project_dir));
}

/// Spawn a training process.  Stdout is parsed line-by-line as NDJSON and
/// emitted as `training-event` Tauri events.  Stderr is forwarded as
/// `training-log` events so the terminal can display loguru output.
///
/// The process is **not** killed when the app exits — it writes to a durable
/// log file so the app can reconnect on restart.
#[command]
async fn start_training(
    app: tauri::AppHandle,
    state: State<'_, TrainingState>,
    session_id: String,
    run_id: String,
    command: String,
    cwd: Option<String>,
) -> Result<(), String> {
    // Don't allow two training processes for the same session
    {
        let procs = state.processes.lock().unwrap();
        if procs
            .get(&session_id)
            .map(|p| p.alive.load(Ordering::SeqCst))
            .unwrap_or(false)
        {
            return Err("Training already running for this session".into());
        }
    }

    let parts: Vec<String> = command.split_whitespace().map(String::from).collect();
    if parts.is_empty() {
        return Err("Empty training command".into());
    }

    let resolved_cwd = cwd
        .as_deref()
        .map(expand_tilde)
        .unwrap_or_else(|| ".".to_string());

    // Ensure the log file path is absolute
    let log_file_path = log_path(&resolved_cwd);
    let log_file_str = log_file_path.to_string_lossy().to_string();

    // Inject --trainer.json_progress=true and --trainer.json_progress_log_file
    // into the command if not already present, so Python writes durable events.
    let mut final_parts = parts.clone();
    if !final_parts.iter().any(|a| a.contains("json_progress=")) {
        final_parts.push("--trainer.json_progress=true".into());
    }
    if !final_parts.iter().any(|a| a.contains("json_progress_log_file")) {
        final_parts.push(format!("--trainer.json_progress_log_file={}", log_file_str));
    }
    // Enable TensorBoard logger so training writes tfevents files that
    // NightForge can scan for dashboard charts.
    if !final_parts.iter().any(|a| a.contains("trainer.logger")) {
        final_parts.push("--trainer.logger=true".into());
    }

    let executable = expand_tilde(&final_parts[0]);
    let mut cmd = tokio::process::Command::new(&executable);
    for arg in &final_parts[1..] {
        cmd.arg(arg);
    }
    cmd.current_dir(&resolved_cwd);
    cmd.stdout(std::process::Stdio::piped());
    cmd.stderr(std::process::Stdio::piped());
    // Do NOT kill_on_drop — let training survive app restarts
    cmd.kill_on_drop(false);

    // On Unix, start in a new process group so it isn't killed when the
    // parent (Tauri) exits.
    #[cfg(unix)]
    unsafe {
        cmd.pre_exec(|| {
            libc::setsid();
            Ok(())
        });
    }

    let mut child = cmd.spawn().map_err(|e| e.to_string())?;
    let pid = child.id().unwrap_or(0);

    let stdout = child.stdout.take().ok_or("Failed to capture stdout")?;
    let stderr = child.stderr.take().ok_or("Failed to capture stderr")?;

    let alive = Arc::new(AtomicBool::new(true));

    // Write durable metadata so we can reconnect after a crash
    let meta = TrainingMeta {
        pid,
        session_id: session_id.clone(),
        run_id: run_id.clone(),
        log_file: log_file_str.clone(),
        command: command.clone(),
        started_at: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs_f64(),
    };
    write_training_meta(&resolved_cwd, &meta)?;

    {
        let mut procs = state.processes.lock().unwrap();
        procs.insert(
            session_id.clone(),
            TrainingProcess {
                child: Some(child),
                alive: Arc::clone(&alive),
                _log_file: log_file_str.clone(),
            },
        );
    }

    // Stdout reader — parse NDJSON lines → training-event
    let sid_out = session_id.clone();
    let alive_out = Arc::clone(&alive);
    let app_out = app.clone();
    let cwd_out = resolved_cwd.clone();
    tokio::spawn(async move {
        use tokio::io::{AsyncBufReadExt, BufReader};
        let mut lines = BufReader::new(stdout).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&line) {
                let _ = app_out.emit(
                    "training-event",
                    TrainingEvent {
                        session_id: sid_out.clone(),
                        data: json,
                    },
                );
            }
        }
        alive_out.store(false, Ordering::SeqCst);
        // Clean up meta file when training finishes normally
        remove_training_meta(&cwd_out);
    });

    // Stderr reader — forward log lines → training-log
    let sid_err = session_id.clone();
    let app_err = app.clone();
    tokio::spawn(async move {
        use tokio::io::{AsyncBufReadExt, BufReader};
        let mut lines = BufReader::new(stderr).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            let _ = app_err.emit(
                "training-log",
                TrainingLog {
                    session_id: sid_err.clone(),
                    data: line,
                },
            );
        }
    });

    Ok(())
}

#[command]
async fn stop_training(
    state: State<'_, TrainingState>,
    session_id: String,
    project_path: Option<String>,
) -> Result<(), String> {
    let mut child_to_kill = None;
    {
        let mut procs = state.processes.lock().unwrap();
        if let Some(proc) = procs.get_mut(&session_id) {
            proc.alive.store(false, Ordering::SeqCst);
            child_to_kill = proc.child.take();
        }
        procs.remove(&session_id);
    }
    if let Some(mut child) = child_to_kill {
        let _ = child.kill().await;
    }
    // Also try to kill by PID from meta file (for reconnected sessions)
    if let Some(ref dir) = project_path {
        let expanded = expand_tilde(dir);
        if let Some(meta) = read_training_meta(&expanded)
            && is_pid_alive(meta.pid)
        {
            #[cfg(unix)]
            unsafe {
                libc::kill(meta.pid as i32, libc::SIGTERM);
            }
        }
        remove_training_meta(&expanded);
    }
    Ok(())
}

#[command]
fn is_training_alive(
    session_id: String,
    state: State<'_, TrainingState>,
) -> bool {
    let procs = state.processes.lock().unwrap();
    procs
        .get(&session_id)
        .map(|p| p.alive.load(Ordering::SeqCst))
        .unwrap_or(false)
}

/// Check if an orphaned training session exists for a project directory.
/// Returns the metadata if found AND the process is still alive, or a
/// completed/dead status if the meta exists but process is gone.
#[derive(serde::Serialize)]
struct OrphanedSession {
    found: bool,
    alive: bool,
    meta: Option<TrainingMeta>,
}

#[command]
fn check_training_session(project_path: String) -> OrphanedSession {
    let expanded = expand_tilde(&project_path);
    match read_training_meta(&expanded) {
        Some(meta) => {
            let alive = is_pid_alive(meta.pid);
            OrphanedSession {
                found: true,
                alive,
                meta: Some(meta),
            }
        }
        None => OrphanedSession {
            found: false,
            alive: false,
            meta: None,
        },
    }
}

/// Read the NDJSON log file and emit events newer than `after_timestamp`.
/// Used to replay missed events after a reconnect.
#[command]
async fn replay_training_log(
    app: tauri::AppHandle,
    session_id: String,
    log_file: String,
    after_timestamp: f64,
) -> Result<u32, String> {
    let expanded = expand_tilde(&log_file);
    let content = std::fs::read_to_string(&expanded)
        .map_err(|e| format!("Failed to read log file: {}", e))?;
    let mut replayed = 0u32;
    for line in content.lines() {
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(line) {
            let ts = json.get("timestamp").and_then(|v| v.as_f64()).unwrap_or(0.0);
            if ts > after_timestamp {
                let _ = app.emit(
                    "training-event",
                    TrainingEvent {
                        session_id: session_id.clone(),
                        data: json,
                    },
                );
                replayed += 1;
            }
        }
    }
    Ok(replayed)
}

/// Poll the NDJSON log file for new lines, emitting them as training events.
/// Runs until the training PID dies or is cancelled.  Returns when done.
#[command]
async fn watch_training_log(
    app: tauri::AppHandle,
    session_id: String,
    log_file: String,
    pid: u32,
) -> Result<(), String> {
    use std::io::{BufRead, Seek, SeekFrom};

    let expanded = expand_tilde(&log_file);
    let path = std::path::PathBuf::from(&expanded);

    // Start from end of file (replay already handled earlier)
    let mut offset = std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0);

    loop {
        tokio::time::sleep(std::time::Duration::from_secs(1)).await;

        // Check if process is still alive
        if !is_pid_alive(pid) {
            // Read any final lines
            if let Ok(mut f) = std::fs::File::open(&path)
                && f.seek(SeekFrom::Start(offset)).is_ok()
            {
                let reader = std::io::BufReader::new(&mut f);
                for line in reader.lines().map_while(Result::ok) {
                    if let Ok(json) = serde_json::from_str::<serde_json::Value>(&line) {
                        let _ = app.emit(
                            "training-event",
                            TrainingEvent {
                                session_id: session_id.clone(),
                                data: json,
                            },
                        );
                    }
                }
            }
            // Clean up meta file
            if let Some(parent) = path.parent() {
                remove_training_meta(&parent.to_string_lossy());
            }
            break;
        }

        // Read new lines from current offset
        let current_size = std::fs::metadata(&path).map(|m| m.len()).unwrap_or(offset);
        if current_size > offset {
            if let Ok(mut f) = std::fs::File::open(&path)
                && f.seek(SeekFrom::Start(offset)).is_ok()
            {
                let reader = std::io::BufReader::new(&mut f);
                for line in reader.lines().map_while(Result::ok) {
                    if let Ok(json) = serde_json::from_str::<serde_json::Value>(&line) {
                        let _ = app.emit(
                            "training-event",
                            TrainingEvent {
                                session_id: session_id.clone(),
                                data: json,
                            },
                        );
                    }
                }
            }
            offset = current_size;
        }
    }
    Ok(())
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

// ── TensorBoard log scanning ──────────────────────────────────────────────────

#[derive(serde::Serialize, serde::Deserialize, Clone)]
struct TbScalar {
    step: i64,
    value: f32,
    wall_time: f64,
}

#[derive(serde::Serialize, serde::Deserialize, Clone)]
struct TbRun {
    version: String,
    scalars: HashMap<String, Vec<TbScalar>>,
}

fn masked_crc32c(data: &[u8]) -> u32 {
    let crc = crc32c::crc32c(data);
    crc.rotate_right(15).wrapping_add(0xa282_ead8)
}

fn read_varint(data: &[u8], pos: &mut usize) -> Option<u64> {
    let mut result: u64 = 0;
    let mut shift = 0u32;
    loop {
        if *pos >= data.len() {
            return None;
        }
        let b = data[*pos] as u64;
        *pos += 1;
        result |= (b & 0x7F) << shift;
        if b & 0x80 == 0 {
            return Some(result);
        }
        shift += 7;
        if shift >= 64 {
            return None;
        }
    }
}

/// Minimal protobuf parser for TensorBoard Event records.
/// Extracts wall_time (field 1, fixed64/double), step (field 2, varint),
/// and Summary.Value entries (tag + simple_value).
type EventData = (f64, i64, Vec<(String, f32)>);

fn parse_event(data: &[u8]) -> Option<EventData> {
    let mut pos = 0;
    let mut wall_time: f64 = 0.0;
    let mut step: i64 = 0;
    let mut summary_bytes: Option<&[u8]> = None;

    while pos < data.len() {
        let tag_wire = read_varint(data, &mut pos)?;
        let field = (tag_wire >> 3) as u32;
        let wire_type = (tag_wire & 0x07) as u32;

        match (field, wire_type) {
            (1, 1) => {
                // wall_time: fixed64 (f64)
                if pos + 8 > data.len() {
                    return None;
                }
                wall_time = f64::from_le_bytes(data[pos..pos + 8].try_into().ok()?);
                pos += 8;
            }
            (2, 0) => {
                // step: varint
                step = read_varint(data, &mut pos)? as i64;
            }
            (5, 2) => {
                // summary: length-delimited
                let len = read_varint(data, &mut pos)? as usize;
                if pos + len > data.len() {
                    return None;
                }
                summary_bytes = Some(&data[pos..pos + len]);
                pos += len;
            }
            (_, 0) => {
                read_varint(data, &mut pos)?;
            }
            (_, 1) => {
                pos += 8;
                if pos > data.len() {
                    return None;
                }
            }
            (_, 2) => {
                let len = read_varint(data, &mut pos)? as usize;
                pos += len;
                if pos > data.len() {
                    return None;
                }
            }
            (_, 5) => {
                pos += 4;
                if pos > data.len() {
                    return None;
                }
            }
            _ => return None,
        }
    }

    let mut values = Vec::new();
    if let Some(summary) = summary_bytes {
        // Parse Summary: repeated Value (field 1, length-delimited)
        let mut sp = 0;
        while sp < summary.len() {
            let tw = match read_varint(summary, &mut sp) {
                Some(v) => v,
                None => break,
            };
            let f = (tw >> 3) as u32;
            let wt = (tw & 0x07) as u32;
            if f == 1 && wt == 2 {
                let vlen = match read_varint(summary, &mut sp) {
                    Some(v) => v as usize,
                    None => break,
                };
                if sp + vlen > summary.len() {
                    break;
                }
                let value_bytes = &summary[sp..sp + vlen];
                sp += vlen;
                // Parse Value: tag (field 1, string) + simple_value (field 2, fixed32/f32)
                let mut vp = 0;
                let mut tag = String::new();
                let mut simple_value: Option<f32> = None;
                while vp < value_bytes.len() {
                    let vtw = match read_varint(value_bytes, &mut vp) {
                        Some(v) => v,
                        None => break,
                    };
                    let vf = (vtw >> 3) as u32;
                    let vwt = (vtw & 0x07) as u32;
                    match (vf, vwt) {
                        (1, 2) => {
                            let slen = match read_varint(value_bytes, &mut vp) {
                                Some(v) => v as usize,
                                None => break,
                            };
                            if vp + slen > value_bytes.len() {
                                break;
                            }
                            tag = String::from_utf8_lossy(&value_bytes[vp..vp + slen])
                                .to_string();
                            vp += slen;
                        }
                        (2, 5) => {
                            if vp + 4 > value_bytes.len() {
                                break;
                            }
                            simple_value = Some(f32::from_le_bytes(
                                value_bytes[vp..vp + 4].try_into().unwrap(),
                            ));
                            vp += 4;
                        }
                        (_, 0) => {
                            if read_varint(value_bytes, &mut vp).is_none() {
                                break;
                            }
                        }
                        (_, 1) => {
                            vp += 8;
                        }
                        (_, 2) => {
                            let skip = match read_varint(value_bytes, &mut vp) {
                                Some(v) => v as usize,
                                None => break,
                            };
                            vp += skip;
                        }
                        (_, 5) => {
                            vp += 4;
                        }
                        _ => break,
                    }
                }
                if !tag.is_empty()
                    && let Some(sv) = simple_value
                {
                    values.push((tag, sv));
                }
            } else {
                // skip unknown field
                match wt {
                    0 => {
                        if read_varint(summary, &mut sp).is_none() {
                            break;
                        }
                    }
                    1 => sp += 8,
                    2 => {
                        let skip = match read_varint(summary, &mut sp) {
                            Some(v) => v as usize,
                            None => break,
                        };
                        sp += skip;
                    }
                    5 => sp += 4,
                    _ => break,
                }
            }
        }
    }

    if values.is_empty() && wall_time == 0.0 {
        return None;
    }
    Some((wall_time, step, values))
}

fn parse_tfevents_file(
    path: &std::path::Path,
) -> HashMap<String, Vec<TbScalar>> {
    let mut scalars: HashMap<String, Vec<TbScalar>> = HashMap::new();
    let data = match std::fs::read(path) {
        Ok(d) => d,
        Err(_) => return scalars,
    };
    let mut pos = 0;
    while pos + 12 <= data.len() {
        // Record framing: u64 length + u32 masked CRC of length bytes
        let len_bytes = &data[pos..pos + 8];
        let data_len = u64::from_le_bytes(len_bytes.try_into().unwrap()) as usize;
        let len_crc = u32::from_le_bytes(data[pos + 8..pos + 12].try_into().unwrap());

        if masked_crc32c(len_bytes) != len_crc {
            break;
        }
        pos += 12;

        if pos + data_len + 4 > data.len() {
            break;
        }
        let record = &data[pos..pos + data_len];
        let data_crc = u32::from_le_bytes(
            data[pos + data_len..pos + data_len + 4].try_into().unwrap(),
        );
        if masked_crc32c(record) != data_crc {
            pos += data_len + 4;
            continue;
        }
        pos += data_len + 4;

        if let Some((wall_time, step, values)) = parse_event(record) {
            for (tag, value) in values {
                scalars.entry(tag).or_default().push(TbScalar {
                    step,
                    value,
                    wall_time,
                });
            }
        }
    }

    // Sort each tag's scalars by step
    for v in scalars.values_mut() {
        v.sort_by_key(|s| s.step);
    }
    scalars
}

#[command]
fn scan_tensorboard_logs(project_path: String) -> Vec<TbRun> {
    let expanded = expand_tilde(&project_path);
    let base = std::path::PathBuf::from(&expanded).join("lightning_logs");
    let mut runs = Vec::new();

    let entries = match std::fs::read_dir(&base) {
        Ok(e) => e,
        Err(_) => return runs,
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let dir_name = match path.file_name().and_then(|n| n.to_str()) {
            Some(n) if n.starts_with("version_") => n.to_string(),
            _ => continue,
        };

        let mut all_scalars: HashMap<String, Vec<TbScalar>> = HashMap::new();
        if let Ok(files) = std::fs::read_dir(&path) {
            for file in files.flatten() {
                let fname = file.file_name();
                let fname_str = fname.to_string_lossy();
                if fname_str.starts_with("events.out.tfevents.") {
                    let file_scalars = parse_tfevents_file(&file.path());
                    for (tag, mut vals) in file_scalars {
                        all_scalars.entry(tag).or_default().append(&mut vals);
                    }
                }
            }
        }

        // Re-sort after merging multiple files
        for v in all_scalars.values_mut() {
            v.sort_by_key(|s| s.step);
        }

        if !all_scalars.is_empty() {
            runs.push(TbRun {
                version: dir_name,
                scalars: all_scalars,
            });
        }
    }

    runs.sort_by(|a, b| a.version.cmp(&b.version));
    runs
}

#[command]
async fn ssh_scan_tensorboard_logs(
    ssh_command: String,
    project_path: String,
) -> Result<Vec<TbRun>, String> {
    let parts: Vec<String> = ssh_command
        .split_whitespace()
        .map(String::from)
        .collect();
    if parts.is_empty() {
        return Err("Empty SSH command".to_string());
    }

    let remote_path = if let Some(stripped) = project_path.strip_prefix("~/") {
        format!("$HOME/{}", stripped)
    } else if project_path == "~" {
        "$HOME".to_string()
    } else {
        project_path.clone()
    };

    let python_script = format!(
        r#"import json,os,glob;
try:
 from tensorboard.backend.event_processing.event_accumulator import EventAccumulator
except ImportError:
 print('[]');exit()
base=os.path.join('{}','lightning_logs')
if not os.path.isdir(base):
 print('[]');exit()
runs=[]
for vd in sorted(glob.glob(os.path.join(base,'version_*'))):
 if not os.path.isdir(vd):continue
 ea=EventAccumulator(vd);ea.Reload()
 sc={{}}
 for tag in ea.Tags().get('scalars',[]):
  sc[tag]=[{{'step':e.step,'value':e.value,'wall_time':e.wall_time}} for e in ea.Scalars(tag)]
 if sc:runs.append({{'version':os.path.basename(vd),'scalars':sc}})
print(json.dumps(runs))"#,
        remote_path.replace('\'', "'\\''")
    );

    let mut cmd = tokio::process::Command::new(&parts[0]);
    cmd.args(["-o", "BatchMode=yes", "-o", "ConnectTimeout=10"]);
    for arg in &parts[1..] {
        cmd.arg(arg);
    }
    cmd.arg(format!("python3 -c '{}'", python_script.replace('\'', "'\\''")));
    cmd.kill_on_drop(true);

    match tokio::time::timeout(std::time::Duration::from_secs(30), cmd.output()).await {
        Ok(Ok(output)) => {
            let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if stdout.is_empty() || !output.status.success() {
                return Ok(Vec::new());
            }
            serde_json::from_str::<Vec<TbRun>>(&stdout).map_err(|e| {
                format!("Failed to parse TensorBoard scan output: {}", e)
            })
        }
        Ok(Err(e)) => Err(e.to_string()),
        Err(_) => Ok(Vec::new()), // Timeout — don't block sync
    }
}

// ── Entry point ───────────────────────────────────────────────────────────────

fn main() {
    tauri::Builder::default()
        .manage(PtyState {
            sessions: Mutex::new(HashMap::new()),
        })
        .manage(TrainingState {
            processes: Mutex::new(HashMap::new()),
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
            ensure_uv,
            ssh_ensure_uv,
            setup_python_env,
            ssh_setup_python_env,
            ensure_project_dir,
            validate_folder_path,
            validate_file_path,
            start_training,
            stop_training,
            is_training_alive,
            check_training_session,
            replay_training_log,
            watch_training_log,
            scan_tensorboard_logs,
            ssh_scan_tensorboard_logs,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
