#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use std::io::{Read, Write};
use std::sync::Mutex;
use tauri::{command, window::Color, Emitter, Manager, State};

struct PtyState {
    writer: Mutex<Option<Box<dyn Write + Send>>>,
    master: Mutex<Option<Box<dyn MasterPty + Send>>>,
    alive: Mutex<bool>,
    ssh_command: Mutex<Option<String>>,
}

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

#[command]
fn spawn_terminal(
    app: tauri::AppHandle,
    state: State<'_, PtyState>,
    rows: Option<u16>,
    cols: Option<u16>,
    ssh_command: Option<String>,
) -> Result<(), String> {
    // If already running, skip
    if *state.alive.lock().unwrap() {
        return Ok(());
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
        // Parse the SSH command string and spawn it in the PTY
        let parts: Vec<&str> = ssh_cmd.trim().split_whitespace().collect();
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
        cmd
    };

    // Store the SSH command for later queries
    *state.ssh_command.lock().unwrap() = ssh_command;

    let mut child = pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| e.to_string())?;

    // Drop slave — we only talk via the master
    drop(pair.slave);

    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;
    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;

    // Store writer and master (for resize)
    *state.writer.lock().unwrap() = Some(writer);
    *state.master.lock().unwrap() = Some(pair.master);
    *state.alive.lock().unwrap() = true;

    let app_clone = app.clone();

    // Spawn reader thread
    std::thread::spawn(move || {
        let mut buf = [0u8; 8192];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    let data = String::from_utf8_lossy(&buf[..n]).to_string();
                    let _ = app.emit("pty-output", data);
                }
                Err(_) => break,
            }
        }
        let _ = app.emit("pty-exit", ());
    });

    // Spawn thread to wait for child exit
    std::thread::spawn(move || {
        let _ = child.wait();
        let _ = app_clone.emit("pty-exit", ());
    });

    Ok(())
}

#[command]
fn pty_write(data: String, state: State<'_, PtyState>) -> Result<(), String> {
    if let Some(ref mut writer) = *state.writer.lock().unwrap() {
        writer
            .write_all(data.as_bytes())
            .map_err(|e| e.to_string())?;
        writer.flush().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[command]
fn pty_resize(rows: u16, cols: u16, state: State<'_, PtyState>) -> Result<(), String> {
    if let Some(ref master) = *state.master.lock().unwrap() {
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
fn kill_terminal(state: State<'_, PtyState>) -> Result<(), String> {
    *state.writer.lock().unwrap() = None;
    *state.master.lock().unwrap() = None;
    *state.alive.lock().unwrap() = false;
    *state.ssh_command.lock().unwrap() = None;
    Ok(())
}

#[command]
fn is_terminal_alive(state: State<'_, PtyState>) -> bool {
    *state.alive.lock().unwrap()
}

#[command]
fn get_terminal_info(state: State<'_, PtyState>) -> std::collections::HashMap<String, String> {
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

    // Include SSH session info if active
    if let Some(ref ssh_cmd) = *state.ssh_command.lock().unwrap() {
        info.insert("isSSH".into(), "true".into());
        info.insert("sshCommand".into(), ssh_cmd.clone());
        // Extract target (user@host) from the command
        let parts: Vec<&str> = ssh_cmd.trim().split_whitespace().collect();
        if let Some(target) = parts.iter().find(|p| p.contains('@')) {
            info.insert("sshTarget".into(), target.to_string());
        } else if let Some(last) = parts.last() {
            info.insert("sshTarget".into(), last.to_string());
        }
    }
    info
}

fn main() {
    tauri::Builder::default()
        .manage(PtyState {
            writer: Mutex::new(None),
            master: Mutex::new(None),
            alive: Mutex::new(false),
            ssh_command: Mutex::new(None),
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
