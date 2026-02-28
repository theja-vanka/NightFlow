#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod env;
mod fs;
mod pty;
mod runs;
mod ssh;
mod system;
mod training;

use std::collections::HashMap;
use std::sync::Mutex;
use tauri::{Manager, command, window::Color};

// ── Shared utility ───────────────────────────────────────────────────────────

pub fn expand_tilde(path: &str) -> String {
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

// ── Misc commands ────────────────────────────────────────────────────────────

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
            env::ensure_uv,
            env::ssh_ensure_uv,
            env::check_conda,
            env::ssh_check_conda,
            env::setup_python_env,
            env::ssh_setup_python_env,
            fs::ensure_project_dir,
            fs::validate_folder_path,
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
            system::get_system_metrics,
            system::download_model,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
