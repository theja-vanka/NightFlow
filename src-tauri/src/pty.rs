use portable_pty::{CommandBuilder, MasterPty, PtySize, native_pty_system};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::{
    Arc, Mutex,
    atomic::{AtomicBool, Ordering},
};
use tauri::{Emitter, State, command};

use crate::expand_tilde;
use crate::{default_shell, home_dir};

// ── Per-session data ──────────────────────────────────────────────────────────

pub struct SessionData {
    writer: Option<Box<dyn Write + Send>>,
    master: Option<Box<dyn MasterPty + Send>>,
    alive: Arc<AtomicBool>,
    ssh_command: Option<String>,
}

pub struct PtyState {
    pub sessions: Mutex<HashMap<String, SessionData>>,
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

// ── PTY commands ──────────────────────────────────────────────────────────────

#[command]
pub fn spawn_terminal(
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
        let shell = default_shell();
        let mut cmd = CommandBuilder::new(&shell);
        // Don't pass -l on Windows (not valid for cmd.exe/powershell)
        if !cfg!(windows) {
            cmd.arg("-l");
        }
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

    let mut child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
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
pub fn pty_write(session_id: String, data: String, state: State<'_, PtyState>) -> Result<(), String> {
    let mut sessions = state.sessions.lock().unwrap();
    if let Some(session) = sessions.get_mut(&session_id)
        && let Some(ref mut writer) = session.writer
    {
        writer
            .write_all(data.as_bytes())
            .map_err(|e| e.to_string())?;
        writer.flush().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[command]
pub fn pty_resize(
    session_id: String,
    rows: u16,
    cols: u16,
    state: State<'_, PtyState>,
) -> Result<(), String> {
    let sessions = state.sessions.lock().unwrap();
    if let Some(session) = sessions.get(&session_id)
        && let Some(ref master) = session.master
    {
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
pub fn kill_terminal(session_id: String, state: State<'_, PtyState>) -> Result<(), String> {
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
pub fn is_terminal_alive(session_id: String, state: State<'_, PtyState>) -> bool {
    let sessions = state.sessions.lock().unwrap();
    sessions
        .get(&session_id)
        .map(|s| s.alive.load(Ordering::SeqCst))
        .unwrap_or(false)
}

#[command]
pub fn get_terminal_info(
    session_id: String,
    state: State<'_, PtyState>,
) -> std::collections::HashMap<String, String> {
    let mut info = std::collections::HashMap::new();
    let shell = default_shell();
    let shell_name = std::path::Path::new(&shell)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| shell.clone());
    info.insert("shell".into(), shell_name);
    info.insert("shellPath".into(), shell);
    // USER on Unix, USERNAME on Windows
    let user_var = if cfg!(windows) { "USERNAME" } else { "USER" };
    if let Ok(user) = std::env::var(user_var) {
        info.insert("user".into(), user);
    }
    if let Ok(hostname) = hostname::get() {
        info.insert("hostname".into(), hostname.to_string_lossy().to_string());
    }
    if let Some(home) = home_dir() {
        info.insert("home".into(), home);
    }
    info.insert("pid".into(), std::process::id().to_string());

    let sessions = state.sessions.lock().unwrap();
    if let Some(session) = sessions.get(&session_id)
        && let Some(ref ssh_cmd) = session.ssh_command
    {
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
