#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{command, window::Color, Manager};

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

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            if let Some(splash) = app.get_webview_window("splashscreen") {
                let _ = splash.set_background_color(Some(Color(0, 0, 0, 0)));
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![greet, close_splash])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
