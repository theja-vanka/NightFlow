use tauri::command;

use crate::expand_tilde;

#[command]
pub fn write_file(path: String, contents: String) -> Result<(), String> {
    let expanded = expand_tilde(&path);
    std::fs::write(&expanded, contents).map_err(|e| e.to_string())
}

#[command]
pub fn get_cwd() -> String {
    std::env::current_dir()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default()
}

#[command]
pub fn check_path_exists(path: String) -> Result<bool, String> {
    use std::path::PathBuf;
    let expanded = expand_tilde(&path);
    if expanded.is_empty() {
        return Ok(false);
    }
    Ok(PathBuf::from(&expanded).exists())
}

#[command]
pub fn ensure_project_dir(path: String) -> Result<String, String> {
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
pub struct PathValidationResult {
    valid: bool,
    error: Option<String>,
}

#[command]
pub fn validate_folder_path(path: String) -> PathValidationResult {
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
pub fn validate_file_path(path: String, expected_extension: Option<String>) -> PathValidationResult {
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
