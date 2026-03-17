use tauri::command;

use crate::env::python_cmd;
use crate::home_dir;

#[command]
pub async fn get_system_metrics(ssh_command: Option<String>) -> Result<String, String> {
    let python_module = "autotimm.flow.system_metrics";

    if let Some(cmd_str) = ssh_command {
        let parts: Vec<String> = cmd_str.split_whitespace().map(String::from).collect();
        if parts.is_empty() {
            return Err("Empty SSH command".to_string());
        }
        let mut cmd = tokio::process::Command::new(&parts[0]);
        cmd.args(["-o", "BatchMode=yes", "-o", "ConnectTimeout=5"]);
        for arg in &parts[1..] {
            cmd.arg(arg);
        }
        cmd.arg(format!("python3 -m {}", python_module));

        let output = cmd.output().await.map_err(|e| e.to_string())?;
        if output.status.success() {
            Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
        } else {
            Err(String::from_utf8_lossy(&output.stderr).to_string())
        }
    } else {
        let output = tokio::process::Command::new(python_cmd())
            .arg("-m")
            .arg(python_module)
            .output()
            .await
            .map_err(|e| e.to_string())?;
        if output.status.success() {
            Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
        } else {
            Err(String::from_utf8_lossy(&output.stderr).to_string())
        }
    }
}

#[derive(serde::Serialize)]
pub struct DownloadModelResult {
    success: bool,
    path: String,
    message: String,
}

#[command]
pub async fn download_model(
    project_path: String,
    run_id: String,
    run_name: String,
    task_class: Option<String>,
    ssh_command: Option<String>,
    export_format: Option<String>,
) -> Result<DownloadModelResult, String> {
    let home = home_dir().unwrap_or_else(|| if cfg!(windows) { std::env::var("TEMP").unwrap_or_else(|_| r"C:\Temp".to_string()) } else { "/tmp".to_string() });
    let downloads_path = std::path::PathBuf::from(&home).join("Downloads");
    let downloads = downloads_path.to_string_lossy().to_string();

    let _ = std::fs::create_dir_all(&downloads);

    let fmt = export_format.unwrap_or_else(|| "torchscript".to_string());
    let (model_ext, export_module) = match fmt.as_str() {
        "onnx" => (".onnx", "autotimm.export.export_onnx"),
        "tensorrt" => (".onnx", "autotimm.export.export_onnx"), // export ONNX first, then convert to TRT
        _ => (".pt", "autotimm.export.export_jit"),
    };

    let pp = project_path.trim_end_matches('/').trim_end_matches('\\');
    let pp_path = std::path::PathBuf::from(&pp);
    let run_logs_dir_path = pp_path.join("logs").join(&run_id);
    let run_logs_dir = run_logs_dir_path.to_string_lossy().to_string();
    let ckpt_dir = run_logs_dir_path.join("checkpoints").to_string_lossy().to_string();
    let model_file_name = format!("model{}", model_ext);
    let model_pt_path = run_logs_dir_path.join(&model_file_name).to_string_lossy().to_string();
    let hparams_path = run_logs_dir_path.join("hparams.yaml").to_string_lossy().to_string();
    let tc = task_class.unwrap_or_else(|| "ImageClassifier".to_string());

    let final_ext = if fmt == "tensorrt" { ".engine" } else { model_ext };
    let dest_name = format!("{}{}", run_name, final_ext);
    let dest = downloads_path.join(&dest_name).to_string_lossy().to_string();

    if let Some(ssh_cmd) = ssh_command {
        let parts: Vec<String> = ssh_cmd.split_whitespace().map(String::from).collect();
        if parts.len() < 2 {
            return Err("Invalid SSH command".to_string());
        }

        // Check if model.pt already exists remotely
        let check_script = format!(
            r#"test -f "{model_pt_path}" && echo "EXISTS" || echo "MISSING""#
        );
        let check_output = tokio::process::Command::new(&parts[0])
            .args(&parts[1..])
            .arg(&check_script)
            .output()
            .await
            .map_err(|e| format!("SSH failed: {e}"))?;
        let check_result = String::from_utf8_lossy(&check_output.stdout).trim().to_string();

        if check_result != "EXISTS" {
            // Find checkpoint remotely
            let find_script = format!(
                r#"find "{ckpt_dir}" -name "*.ckpt" -type f 2>/dev/null | head -1"#
            );
            let find_output = tokio::process::Command::new(&parts[0])
                .args(&parts[1..])
                .arg(&find_script)
                .output()
                .await
                .map_err(|e| format!("SSH failed: {e}"))?;

            let remote_ckpt = String::from_utf8_lossy(&find_output.stdout).trim().to_string();
            if remote_ckpt.is_empty() {
                return Err("No checkpoint file found. Training may not have saved a model yet.".to_string());
            }

            // Resolve python (prefer venv)
            let venv_python_path = crate::env::venv_python(&std::path::PathBuf::from(&pp).join(".venv"));
            let venv_python = venv_python_path.to_string_lossy().to_string();
            let python_check = format!(
                "if [ -x \"{venv_python}\" ]; then echo \"{venv_python}\"; else echo python3; fi"
            );
            let py_output = tokio::process::Command::new(&parts[0])
                .args(&parts[1..])
                .arg(&python_check)
                .output()
                .await
                .map_err(|e| format!("SSH python check failed: {e}"))?;
            let python = String::from_utf8_lossy(&py_output.stdout).trim().to_string();

            // Run export remotely
            let export_cmd = format!(
                "cd \"{run_logs_dir}\" && {python} -m {export_module} --checkpoint \"{remote_ckpt}\" --output \"{model_pt_path}\" --task-class \"{tc}\" --hparams-yaml \"{hparams_path}\""
            );

            let export_output = tokio::process::Command::new(&parts[0])
                .args(&parts[1..])
                .arg(&export_cmd)
                .output()
                .await
                .map_err(|e| format!("SSH export failed: {e}"))?;

            if !export_output.status.success() {
                let stderr = String::from_utf8_lossy(&export_output.stderr);
                return Err(format!("{} conversion failed: {stderr}", if fmt == "onnx" || fmt == "tensorrt" { "ONNX" } else { "TorchScript" }));
            }

            // If TensorRT, convert ONNX to TRT engine remotely
            if fmt == "tensorrt" {
                let trt_path = model_pt_path.replace(".onnx", ".engine");
                let trt_cmd = format!(
                    "cd \"{run_logs_dir}\" && {python} -m autotimm.flow.tensorrt_convert --onnx \"{model_pt_path}\" --output \"{trt_path}\""
                );

                let trt_output = tokio::process::Command::new(&parts[0])
                    .args(&parts[1..])
                    .arg(&trt_cmd)
                    .output()
                    .await
                    .map_err(|e| format!("SSH TensorRT conversion failed: {e}"))?;

                if !trt_output.status.success() {
                    let stderr = String::from_utf8_lossy(&trt_output.stderr);
                    return Err(format!("TensorRT conversion failed: {stderr}. Ensure TensorRT is installed on the remote machine."));
                }
            }
        }

        // SCP the model.pt file to Downloads
        let mut scp_args: Vec<String> = Vec::new();
        let mut host_part = String::new();
        let mut i = 1;
        while i < parts.len() {
            if parts[i] == "-p" || parts[i] == "-i" || parts[i] == "-o" {
                scp_args.push(parts[i].clone());
                if i + 1 < parts.len() {
                    if parts[i] == "-p" {
                        scp_args.pop();
                        scp_args.push("-P".to_string());
                    }
                    scp_args.push(parts[i + 1].clone());
                    i += 2;
                } else {
                    i += 1;
                }
            } else {
                host_part = parts[i].clone();
                i += 1;
            }
        }

        let remote_file = if fmt == "tensorrt" { model_pt_path.replace(".onnx", ".engine") } else { model_pt_path.clone() };
        let scp_source = format!("{host_part}:{remote_file}");
        scp_args.push(scp_source);
        scp_args.push(dest.clone());

        let scp_bin = if cfg!(windows) { "scp.exe" } else { "scp" };
        let scp_output = tokio::process::Command::new(scp_bin)
            .args(&scp_args)
            .output()
            .await
            .map_err(|e| {
                if cfg!(windows) {
                    format!("scp failed: {e}. On Windows, ensure OpenSSH is installed (Settings > Apps > Optional Features > OpenSSH Client).")
                } else {
                    format!("scp failed: {e}")
                }
            })?;

        if !scp_output.status.success() {
            let stderr = String::from_utf8_lossy(&scp_output.stderr);
            return Err(format!("scp failed: {stderr}"));
        }

        Ok(DownloadModelResult {
            success: true,
            path: dest,
            message: format!("Saved to ~/Downloads/{dest_name}"),
        })
    } else {
        let model_pt = std::path::Path::new(&model_pt_path);

        if !model_pt.exists() {
            // Find .ckpt file
            let ckpt_path = std::path::Path::new(&ckpt_dir);
            let mut best_ckpt: Option<std::path::PathBuf> = None;

            if let Ok(entries) = std::fs::read_dir(ckpt_path) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if let Some(name) = path.file_name().and_then(|n| n.to_str())
                        && name.ends_with(".ckpt")
                    {
                        best_ckpt = Some(path);
                    }
                }
            }

            let ckpt_src = best_ckpt.ok_or("No checkpoint file found. Training may not have saved a model yet.".to_string())?;
            let ckpt_src_str = ckpt_src.to_string_lossy().to_string();

            // Build hparams arg if the file exists
            let hparams_file = std::path::Path::new(&hparams_path);
            let mut args = vec![
                "-m".to_string(),
                export_module.to_string(),
                "--checkpoint".to_string(), ckpt_src_str,
                "--output".to_string(), model_pt_path.clone(),
                "--task-class".to_string(), tc,
            ];
            if hparams_file.exists() {
                args.push("--hparams-yaml".to_string());
                args.push(hparams_path);
            }

            let venv_python = crate::env::venv_python(&std::path::PathBuf::from(&pp).join(".venv"));
            let python = if venv_python.exists() {
                venv_python.to_string_lossy().to_string()
            } else {
                python_cmd().to_string()
            };

            let export_output = tokio::process::Command::new(&python)
                .args(&args)
                .current_dir(&run_logs_dir)
                .output()
                .await
                .map_err(|e| format!("{} export failed: {e}", if fmt == "onnx" || fmt == "tensorrt" { "ONNX" } else { "TorchScript" }))?;

            if !export_output.status.success() {
                let stderr = String::from_utf8_lossy(&export_output.stderr);
                return Err(format!("{} conversion failed: {stderr}", if fmt == "onnx" || fmt == "tensorrt" { "ONNX" } else { "TorchScript" }));
            }

            // If TensorRT, convert ONNX to TRT engine locally
            if fmt == "tensorrt" {
                let trt_path = model_pt_path.replace(".onnx", ".engine");

                let trt_output = tokio::process::Command::new(&python)
                    .args(["-m", "autotimm.flow.tensorrt_convert", "--onnx", &model_pt_path, "--output", &trt_path])
                    .current_dir(&run_logs_dir)
                    .output()
                    .await
                    .map_err(|e| format!("TensorRT conversion failed: {e}"))?;

                if !trt_output.status.success() {
                    let stderr = String::from_utf8_lossy(&trt_output.stderr);
                    return Err(format!("TensorRT conversion failed: {stderr}. Ensure TensorRT is installed (pip install tensorrt)."));
                }
            }
        }

        // Copy exported model to Downloads
        let src_path = if fmt == "tensorrt" { model_pt_path.replace(".onnx", ".engine") } else { model_pt_path.clone() };
        std::fs::copy(&src_path, &dest)
            .map_err(|e| format!("Copy failed: {e}"))?;

        Ok(DownloadModelResult {
            success: true,
            path: dest,
            message: format!("Saved to ~/Downloads/{dest_name}"),
        })
    }
}

#[derive(serde::Serialize)]
pub struct PushToHubResult {
    pub success: bool,
    pub url: String,
    pub message: String,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
pub struct PushToHubParams {
    pub project_path: String,
    pub run_id: String,
    #[serde(default)]
    pub run_name: String,
    pub repo_id: String,
    pub hf_token: String,
    pub task_class: Option<String>,
    pub task_type: Option<String>,
    pub backbone: Option<String>,
    pub num_classes: Option<u32>,
    pub image_size: Option<u32>,
    pub best_acc: Option<f64>,
    pub test_acc: Option<f64>,
    pub ssh_command: Option<String>,
    pub private: Option<bool>,
    pub model_name: Option<String>,
    pub description: Option<String>,
    pub license: Option<String>,
    pub tags: Option<String>,
}

#[command]
pub async fn push_to_hub(params: PushToHubParams) -> Result<PushToHubResult, String> {
    let pp = params.project_path.trim_end_matches('/').trim_end_matches('\\');
    let pp_path = std::path::PathBuf::from(pp);
    let run_logs_dir_path = pp_path.join("logs").join(&params.run_id);
    let ckpt_dir = run_logs_dir_path.join("checkpoints");
    let hparams_path = run_logs_dir_path.join("hparams.yaml");

    let tt = params.task_type.unwrap_or_else(|| "Classification".to_string());
    let bb = params.backbone.unwrap_or_else(|| "unknown".to_string());
    let nc = params.num_classes.unwrap_or(10);
    let isize = params.image_size.unwrap_or(224);
    let is_private = params.private.unwrap_or(false);

    let acc_str = params.best_acc.map_or("N/A".to_string(), |v| format!("{:.4}", v));
    let test_acc_str = params.test_acc.map_or("N/A".to_string(), |v| format!("{:.4}", v));
    let mn = params.model_name.unwrap_or_else(|| format!("{bb} — {tt}"));
    let desc = params.description.unwrap_or_default();
    let lic = params.license.unwrap_or_else(|| "apache-2.0".to_string());
    let user_tags = params.tags.unwrap_or_default();

    // Build a JSON config to pass to the Python script via env var
    let config = serde_json::json!({
        "repo_id": params.repo_id,
        "token": params.hf_token,
        "ckpt_dir": ckpt_dir.to_string_lossy(),
        "hparams_path": hparams_path.to_string_lossy(),
        "task_type": tt,
        "backbone": bb,
        "num_classes": nc,
        "image_size": isize,
        "acc_str": acc_str,
        "test_acc_str": test_acc_str,
        "is_private": is_private,
        "model_name": mn,
        "description": desc,
        "license": lic,
        "tags": user_tags,
    });
    let config_json = config.to_string();

    let push_module = "autotimm.flow.push_to_hub";

    // For SSH: pass config via HF_PUSH_CFG env var in the remote command
    // For local: pass it via the HF_PUSH_CFG environment variable
    let output = if let Some(ssh_cmd) = params.ssh_command {
        let parts: Vec<String> = ssh_cmd.split_whitespace().map(String::from).collect();
        if parts.len() < 2 {
            return Err("Invalid SSH command".to_string());
        }
        let escaped_json = config_json.replace('\\', "\\\\").replace('"', "\\\"");
        let remote_cmd = format!(
            "HF_PUSH_CFG=\"{}\" python3 -m {}",
            escaped_json, push_module,
        );
        tokio::process::Command::new(&parts[0])
            .args(&parts[1..])
            .arg(remote_cmd)
            .output()
            .await
            .map_err(|e| format!("SSH failed: {e}"))?
    } else {
        let venv_python = crate::env::venv_python(&pp_path.join(".venv"));
        let python = if venv_python.exists() {
            venv_python.to_string_lossy().to_string()
        } else {
            python_cmd().to_string()
        };
        tokio::process::Command::new(&python)
            .arg("-m")
            .arg(push_module)
            .env("HF_PUSH_CFG", &config_json)
            .current_dir(&run_logs_dir_path)
            .output()
            .await
            .map_err(|e| format!("Push to Hub failed: {e}"))?
    };

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        return Err(format!("Push to Hub failed: {stderr}"));
    }

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let parsed: serde_json::Value = serde_json::from_str(&stdout)
        .map_err(|e| format!("Failed to parse output: {e}\nOutput: {stdout}"))?;

    if let Some(err) = parsed.get("error").and_then(|v| v.as_str()) {
        return Err(err.to_string());
    }

    let url = parsed.get("url").and_then(|v| v.as_str()).unwrap_or("").to_string();

    Ok(PushToHubResult {
        success: true,
        url: url.clone(),
        message: format!("Model pushed to {url}"),
    })
}
