#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod env;
mod fs;
mod interpretation;
mod pty;
mod runs;
mod ssh;
mod system;
mod training;

use std::collections::HashMap;
use std::sync::Mutex;
use tauri::{Manager, command, window::Color};

// ── Shared utility ───────────────────────────────────────────────────────────

/// Cross-platform home directory: HOME (Unix), USERPROFILE (Windows),
/// or HOMEDRIVE+HOMEPATH (Windows fallback).
pub fn home_dir() -> Option<String> {
    std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .ok()
        .or({
            #[cfg(target_os = "windows")]
            if let (Ok(drive), Ok(path)) =
                (std::env::var("HOMEDRIVE"), std::env::var("HOMEPATH"))
            {
                return Some(format!("{}{}", drive, path));
            }
            None
        })
}

/// Cross-platform default shell: SHELL on Unix, COMSPEC on Windows.
pub fn default_shell() -> String {
    if cfg!(windows) {
        std::env::var("COMSPEC").unwrap_or_else(|_| "cmd.exe".to_string())
    } else {
        std::env::var("SHELL").unwrap_or_else(|_| {
            if cfg!(target_os = "macos") {
                "/bin/zsh".to_string()
            } else {
                "/bin/bash".to_string()
            }
        })
    }
}

pub fn expand_tilde(path: &str) -> String {
    if !path.starts_with('~') {
        return path.to_string();
    }
    if let Some(home) = home_dir() {
        return path.replacen('~', &home, 1);
    }
    path.to_string()
}

// ── Misc commands ────────────────────────────────────────────────────────────

#[command]
fn get_platform() -> String {
    if cfg!(windows) {
        "windows".to_string()
    } else if cfg!(target_os = "macos") {
        "macos".to_string()
    } else {
        "linux".to_string()
    }
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

// ── Entry point ──────────────────────────────────────────────────────────────

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .manage(pty::PtyState {
            sessions: Mutex::new(HashMap::new()),
        })
        .manage(training::TrainingState {
            processes: Mutex::new(HashMap::new()),
        })
        .setup(|app| {
            if let Some(splash) = app.get_webview_window("splashscreen") {
                let _ = splash.set_background_color(Some(Color(0, 0, 0, 0)));
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            close_splash,
            get_platform,
            pty::spawn_terminal,
            pty::pty_write,
            pty::pty_resize,
            pty::kill_terminal,
            pty::is_terminal_alive,
            pty::get_terminal_info,
            fs::write_file,
            ssh::ssh_write_file,
            ssh::test_ssh,
            ssh::ssh_mkdir,
            fs::get_cwd,
            fs::check_path_exists,
            ssh::ssh_check_path,
            ssh::list_ssh_keys,
            env::ensure_uv,
            env::ssh_ensure_uv,
            env::check_conda,
            env::ssh_check_conda,
            env::setup_python_env,
            env::ssh_setup_python_env,
            fs::ensure_project_dir,
            fs::validate_folder_path,
            fs::browse_dataset,
            fs::validate_file_path,
            training::start_training,
            training::stop_training,
            training::is_training_alive,
            training::check_training_session,
            training::replay_training_log,
            training::read_training_log,
            training::watch_training_log,
            runs::list_run_folders,
            runs::parse_run_jsonl,
            runs::parse_csv_run,
            runs::parse_hparams_yaml,
            runs::parse_model_info,
            system::get_system_metrics,
            system::download_model,
            interpretation::save_interpretation_image,
            interpretation::run_interpretation,
            interpretation::export_jit_model,
            interpretation::preview_augmentation,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
