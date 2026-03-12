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

const SPLIT_NAMES: &[&str] = &["train", "test", "val", "valid", "validation", "training", "testing"];

fn normalize_split_name(name: &str) -> &'static str {
    match name.to_lowercase().as_str() {
        "train" | "training" => "train",
        "val" | "valid" | "validation" => "val",
        "test" | "testing" => "test",
        _ => "train",
    }
}

#[command]
pub fn detect_dataset_splits(path: String) -> Result<Vec<String>, String> {
    let expanded = expand_tilde(&path);
    let resolved = std::path::PathBuf::from(&expanded);

    if !resolved.is_dir() {
        return Ok(vec![]);
    }

    let top_entries: Vec<_> = std::fs::read_dir(&resolved)
        .map_err(|e| e.to_string())?
        .flatten()
        .filter(|e| e.path().is_dir() && !e.file_name().to_string_lossy().starts_with('.'))
        .collect();

    let is_split_based = top_entries.iter().any(|e| {
        let name = e.file_name().to_string_lossy().to_lowercase();
        SPLIT_NAMES.contains(&name.as_str())
    }) && top_entries.iter().all(|e| {
        let sub = match std::fs::read_dir(e.path()) {
            Ok(f) => f,
            Err(_) => return false,
        };
        sub.flatten().any(|se| se.path().is_dir())
    });

    if !is_split_based {
        return Ok(vec![]);
    }

    // Collect and normalize split names, preserving order: train, val, test
    let mut splits = Vec::new();
    let order = ["train", "val", "test"];
    let mut found: std::collections::HashSet<String> = std::collections::HashSet::new();
    for entry in &top_entries {
        let raw = entry.file_name().to_string_lossy().to_lowercase();
        if SPLIT_NAMES.contains(&raw.as_str()) {
            let normalized = normalize_split_name(&raw).to_string();
            if found.insert(normalized.clone()) {
                splits.push(normalized);
            }
        }
    }
    // Sort by canonical order
    splits.sort_by_key(|s| order.iter().position(|o| o == s).unwrap_or(99));
    Ok(splits)
}

#[derive(serde::Serialize)]
pub struct DatasetImage {
    pub path: String,
    pub label: String,
}

#[derive(serde::Serialize)]
pub struct DatasetBrowseResult {
    pub images: Vec<DatasetImage>,
    pub total: usize,
    pub class_counts: std::collections::HashMap<String, usize>,
}

#[allow(clippy::too_many_arguments)]
#[command]
pub fn browse_dataset(
    path: String,
    format: String,
    limit: usize,
    offset: usize,
    class_filter: Option<Vec<String>>,
    image_folder: Option<String>,
    search: Option<String>,
    split: Option<String>,
) -> Result<DatasetBrowseResult, String> {
    let expanded = expand_tilde(&path);
    let resolved_path = std::path::PathBuf::from(&expanded);

    if !resolved_path.exists() {
        return Err(format!("Path does not exist: {}", expanded));
    }

    let image_exts = ["jpg", "jpeg", "png", "bmp", "webp", "tiff", "gif"];
    let mut all_images: Vec<DatasetImage> = Vec::new();
    let mut class_counts: std::collections::HashMap<String, usize> = std::collections::HashMap::new();

    if format == "Folder" && resolved_path.is_dir() {
        // Collect image files from a class directory
        let mut collect_class = |class_dir: &std::path::Path, class_name: &str| {
            let files = match std::fs::read_dir(class_dir) {
                Ok(f) => f,
                Err(_) => return,
            };
            let mut count = 0usize;
            for file_entry in files.flatten() {
                let file_path = file_entry.path();
                if !file_path.is_file() { continue; }
                let ext = file_path.extension()
                    .and_then(|e| e.to_str())
                    .unwrap_or("")
                    .to_lowercase();
                if !image_exts.contains(&ext.as_str()) { continue; }

                count += 1;
                all_images.push(DatasetImage {
                    path: file_path.to_string_lossy().to_string(),
                    label: class_name.to_string(),
                });
            }
            *class_counts.entry(class_name.to_string()).or_insert(0) += count;
        };

        // Detect structure: check if top-level subdirs contain images directly
        // or contain further subdirs (split-based: train/test/val → class → images)
        let top_entries: Vec<_> = std::fs::read_dir(&resolved_path)
            .map_err(|e| e.to_string())?
            .flatten()
            .filter(|e| {
                let p = e.path();
                p.is_dir() && !e.file_name().to_string_lossy().starts_with('.')
            })
            .collect();

        // Peek into the first subdir to determine structure
        let is_split_based = top_entries.iter().any(|e| {
            let name = e.file_name().to_string_lossy().to_lowercase();
            matches!(name.as_str(), "train" | "test" | "val" | "valid" | "validation" | "training" | "testing")
        }) && top_entries.iter().all(|e| {
            // Check that subdirs contain further subdirs (not images directly)
            let sub_entries = match std::fs::read_dir(e.path()) {
                Ok(f) => f,
                Err(_) => return false,
            };
            sub_entries.flatten().any(|se| se.path().is_dir())
        });

        if is_split_based {
            // dataset/train/class_a/img.jpg structure
            // Filter to requested split if provided
            let filtered_entries: Vec<_> = if let Some(ref requested_split) = split {
                top_entries.into_iter().filter(|e| {
                    let raw = e.file_name().to_string_lossy().to_lowercase();
                    if SPLIT_NAMES.contains(&raw.as_str()) {
                        normalize_split_name(&raw) == requested_split.as_str()
                    } else {
                        false
                    }
                }).collect()
            } else {
                top_entries
            };
            for split_entry in filtered_entries {
                let split_path = split_entry.path();
                let class_entries = match std::fs::read_dir(&split_path) {
                    Ok(f) => f,
                    Err(_) => continue,
                };
                for class_entry in class_entries.flatten() {
                    let class_path = class_entry.path();
                    if !class_path.is_dir() { continue; }
                    let class_name = class_path.file_name()
                        .and_then(|n| n.to_str())
                        .unwrap_or("unknown")
                        .to_string();
                    if class_name.starts_with('.') { continue; }
                    collect_class(&class_path, &class_name);
                }
            }
        } else {
            // dataset/class_a/img.jpg structure (flat ImageFolder)
            for entry in top_entries {
                let class_path = entry.path();
                let class_name = class_path.file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("unknown")
                    .to_string();
                collect_class(&class_path, &class_name);
            }
        }
    } else if format == "CSV" && resolved_path.is_file() {
        // Parse CSV: first column = image path, second column = label
        // If image_folder is provided, prepend it to relative image paths
        let image_dir = image_folder
            .as_deref()
            .map(|f| std::path::PathBuf::from(expand_tilde(f)));

        let mut rdr = csv::Reader::from_path(&resolved_path)
            .map_err(|e| format!("Failed to read CSV: {}", e))?;

        let headers = rdr.headers()
            .map_err(|e| format!("Failed to read CSV headers: {}", e))?
            .clone();

        if headers.len() < 2 {
            return Err("CSV must have at least 2 columns (image path and label)".to_string());
        }

        // Find image and label columns by common names, fall back to positional
        let image_col_names = ["image_path", "image", "file", "filename", "filepath", "path", "img"];
        let label_col_names = ["label", "class", "category", "target", "class_name"];

        let image_col_idx = headers.iter().position(|h| {
            image_col_names.contains(&h.to_lowercase().as_str())
        }).unwrap_or(0);

        let label_col_idx = headers.iter().position(|h| {
            label_col_names.contains(&h.to_lowercase().as_str())
        }).unwrap_or(if image_col_idx == 0 { 1 } else { 0 });

        for result in rdr.records() {
            let record = result.map_err(|e| format!("CSV parse error: {}", e))?;
            let img_raw = record.get(image_col_idx).unwrap_or("").to_string();
            let label = record.get(label_col_idx).unwrap_or("unknown").to_string();

            if img_raw.is_empty() { continue; }

            let img_path_buf = std::path::PathBuf::from(&img_raw);
            let full_path = if img_path_buf.is_absolute() {
                img_path_buf
            } else if let Some(ref dir) = image_dir {
                dir.join(&img_raw)
            } else {
                // Relative to the CSV file's parent directory
                resolved_path.parent().unwrap_or(std::path::Path::new(".")).join(&img_raw)
            };

            // Only include if the file looks like an image
            let ext = full_path.extension()
                .and_then(|e| e.to_str())
                .unwrap_or("")
                .to_lowercase();
            if !image_exts.contains(&ext.as_str()) { continue; }

            *class_counts.entry(label.clone()).or_insert(0) += 1;
            all_images.push(DatasetImage {
                path: full_path.to_string_lossy().to_string(),
                label,
            });
        }
    } else if format == "JSONL" && resolved_path.is_file() {
        // Parse JSONL: each line is a JSON object with image and label fields
        // If image_folder is provided, prepend it to relative image paths
        let image_dir = image_folder
            .as_deref()
            .map(|f| std::path::PathBuf::from(expand_tilde(f)));

        let contents = std::fs::read_to_string(&resolved_path)
            .map_err(|e| format!("Failed to read JSONL file: {}", e))?;

        let image_keys = ["image_path", "image", "file", "filename", "filepath", "path", "img"];
        let label_keys = ["label", "class", "category", "target", "class_name"];

        for line in contents.lines() {
            let line = line.trim();
            if line.is_empty() { continue; }

            let obj: serde_json::Value = serde_json::from_str(line)
                .map_err(|e| format!("JSONL parse error: {}", e))?;

            let obj_map = match obj.as_object() {
                Some(m) => m,
                None => continue,
            };

            // Find image path
            let img_raw = image_keys.iter()
                .find_map(|k| obj_map.get(*k).and_then(|v| v.as_str()))
                .unwrap_or("")
                .to_string();

            // Find label
            let label = label_keys.iter()
                .find_map(|k| obj_map.get(*k).and_then(|v| v.as_str()))
                .unwrap_or("unknown")
                .to_string();

            if img_raw.is_empty() { continue; }

            let img_path_buf = std::path::PathBuf::from(&img_raw);
            let full_path = if img_path_buf.is_absolute() {
                img_path_buf
            } else if let Some(ref dir) = image_dir {
                dir.join(&img_raw)
            } else {
                // Relative to the JSONL file's parent directory
                resolved_path.parent().unwrap_or(std::path::Path::new(".")).join(&img_raw)
            };

            // Only include if the file looks like an image
            let ext = full_path.extension()
                .and_then(|e| e.to_str())
                .unwrap_or("")
                .to_lowercase();
            if !image_exts.contains(&ext.as_str()) { continue; }

            *class_counts.entry(label.clone()).or_insert(0) += 1;
            all_images.push(DatasetImage {
                path: full_path.to_string_lossy().to_string(),
                label,
            });
        }
    } else {
        return Err(format!("Unsupported format '{}' or invalid path", format));
    }

    // Sort by label then path for stable ordering
    all_images.sort_by(|a, b| a.label.cmp(&b.label).then(a.path.cmp(&b.path)));

    // Apply class filter if provided
    if let Some(ref filters) = class_filter
        && !filters.is_empty()
    {
        all_images.retain(|img| filters.contains(&img.label));
    }

    // Apply search filter if provided (matches filename or label, case-insensitive)
    if let Some(ref query) = search {
        let q = query.to_lowercase();
        if !q.is_empty() {
            all_images.retain(|img| {
                let filename = img.path.replace('\\', "/");
                let filename = filename.rsplit('/').next().unwrap_or("");
                filename.to_lowercase().contains(&q) || img.label.to_lowercase().contains(&q)
            });
        }
    }

    let total = all_images.len();

    // Apply pagination
    let paginated: Vec<DatasetImage> = all_images
        .into_iter()
        .skip(offset)
        .take(limit)
        .collect();

    Ok(DatasetBrowseResult {
        images: paginated,
        total,
        class_counts,
    })
}
