use tauri::command;

use crate::env::python_cmd;
use crate::home_dir;

#[command]
pub async fn get_system_metrics(ssh_command: Option<String>) -> Result<String, String> {
    let python_script = r#"
import json, os, subprocess, sys, shutil

res = {}
if hasattr(os, 'cpu_count'):
    res['cpu_cores'] = os.cpu_count()

# Memory
try:
    if sys.platform == 'darwin':
        mem_total = int(subprocess.check_output(['sysctl', '-n', 'hw.memsize']).strip())
        vm = subprocess.check_output(['vm_stat']).decode('utf-8')
        pages = {}
        for line in vm.split('\n'):
            if ':' in line:
                key, val = line.split(':', 1)
                val = val.strip().rstrip('.')
                if val.isdigit():
                    pages[key.strip()] = int(val)
        ps = int(subprocess.check_output(['sysctl', '-n', 'vm.pagesize']).strip())
        # Match Activity Monitor: Used = App Memory + Wired + Compressed
        anonymous = pages.get('Anonymous pages', 0)
        stored = pages.get('Pages stored in compressor', 0)
        wired = pages.get('Pages wired down', 0)
        app_mem = (anonymous - stored) * ps
        wired_mem = wired * ps
        compressed_mem = stored * ps
        mem_used = app_mem + wired_mem + compressed_mem
        res['mem_total'] = mem_total
        res['mem_used'] = max(0, min(mem_used, mem_total))
    elif sys.platform == 'win32':
        import ctypes
        class MEMORYSTATUSEX(ctypes.Structure):
            _fields_ = [
                ('dwLength', ctypes.c_ulong),
                ('dwMemoryLoad', ctypes.c_ulong),
                ('ullTotalPhys', ctypes.c_ulonglong),
                ('ullAvailPhys', ctypes.c_ulonglong),
                ('ullTotalPageFile', ctypes.c_ulonglong),
                ('ullAvailPageFile', ctypes.c_ulonglong),
                ('ullTotalVirtual', ctypes.c_ulonglong),
                ('ullAvailVirtual', ctypes.c_ulonglong),
                ('ullAvailExtendedVirtual', ctypes.c_ulonglong),
            ]
        mem = MEMORYSTATUSEX()
        mem.dwLength = ctypes.sizeof(MEMORYSTATUSEX)
        ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(mem))
        res['mem_total'] = mem.ullTotalPhys
        res['mem_used'] = mem.ullTotalPhys - mem.ullAvailPhys
    else:
        with open('/proc/meminfo', 'r') as f:
            lines = f.readlines()
        mem_total = 0
        mem_free = 0
        mem_avail = 0
        for line in lines:
            if line.startswith('MemTotal:'):
                mem_total = int(line.split()[1]) * 1024
            elif line.startswith('MemFree:'):
                mem_free = int(line.split()[1]) * 1024
            elif line.startswith('MemAvailable:'):
                mem_avail = int(line.split()[1]) * 1024
        if mem_total > 0:
            res['mem_total'] = mem_total
            res['mem_used'] = mem_total - (mem_avail if mem_avail > 0 else mem_free)
except Exception:
    pass

# Disk (cross-platform using shutil)
try:
    disk_path = 'C:\\' if sys.platform == 'win32' else '/'
    usage = shutil.disk_usage(disk_path)
    res['disk_total'] = usage.total
    res['disk_used'] = usage.used
except Exception:
    pass

# GPU
try:
    gpu_out = subprocess.check_output(
        ['nvidia-smi', '--query-gpu=index,name,utilization.gpu,memory.total,memory.used,temperature.gpu', '--format=csv,noheader,nounits'],
        stderr=subprocess.STDOUT, text=True
    )
    gpus = []
    for line in gpu_out.strip().split('\n'):
        if not line: continue
        parts = [p.strip() for p in line.split(',')]
        if len(parts) >= 6:
            gpus.append({
                'index': int(parts[0]),
                'name': parts[1],
                'utilization': float(parts[2]) if parts[2].isdigit() else 0,
                'mem_total': float(parts[3]),
                'mem_used': float(parts[4]),
                'temperature': float(parts[5]) if parts[5].isdigit() else 0
            })
    res['gpus'] = gpus
except Exception:
    res['gpus'] = []

# CPU Load
try:
    if hasattr(os, 'getloadavg'):
        res['loadavg'] = os.getloadavg()
    else:
        try:
            import psutil
            cpu_pct = psutil.cpu_percent(interval=0.5)
            res['loadavg'] = [cpu_pct / 100.0 * os.cpu_count(), 0, 0]
        except ImportError:
            pass
except Exception:
    pass

print(json.dumps(res))
"#;

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
        let hex: String = python_script.bytes().map(|b| format!("{:02x}", b)).collect();
        let remote_cmd = format!(
            "python3 -c \"exec(bytes.fromhex('{}').decode())\"",
            hex
        );
        cmd.arg(remote_cmd);

        let output = cmd.output().await.map_err(|e| e.to_string())?;
        if output.status.success() {
            Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
        } else {
            Err(String::from_utf8_lossy(&output.stderr).to_string())
        }
    } else {
        let output = tokio::process::Command::new(python_cmd())
            .arg("-c")
            .arg(python_script)
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
                    r#"cd "{run_logs_dir}" && {python} -c "
import tensorrt as trt, sys
logger = trt.Logger(trt.Logger.WARNING)
builder = trt.Builder(logger)
network = builder.create_network(1 << int(trt.NetworkDefinitionCreationFlag.EXPLICIT_BATCH))
parser = trt.OnnxParser(network, logger)
if not parser.parse_from_file('{model_pt_path}'):
    for i in range(parser.num_errors):
        print(parser.get_error(i), file=sys.stderr)
    sys.exit(1)
config = builder.create_builder_config()
config.set_memory_pool_limit(trt.MemoryPoolType.WORKSPACE, 1 << 30)
engine = builder.build_serialized_network(network, config)
with open('{trt_path}', 'wb') as f:
    f.write(engine)
print('{trt_path}')
""#
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
                // Write a temporary Python script to avoid shell quoting issues on Windows
                let trt_script_path = run_logs_dir_path.join("_trt_convert.py");
                let trt_script_content = format!(
                    "import tensorrt as trt\nimport sys\nlogger = trt.Logger(trt.Logger.WARNING)\nbuilder = trt.Builder(logger)\nnetwork = builder.create_network(1 << int(trt.NetworkDefinitionCreationFlag.EXPLICIT_BATCH))\nparser = trt.OnnxParser(network, logger)\nif not parser.parse_from_file(r\"{onnx}\"):\n    for i in range(parser.num_errors):\n        print(parser.get_error(i), file=sys.stderr)\n    sys.exit(1)\nconfig = builder.create_builder_config()\nconfig.set_memory_pool_limit(trt.MemoryPoolType.WORKSPACE, 1 << 30)\nengine = builder.build_serialized_network(network, config)\nwith open(r\"{engine}\", \"wb\") as f:\n    f.write(engine)\nprint(r\"{engine}\")\n",
                    onnx = model_pt_path, engine = trt_path
                );
                std::fs::write(&trt_script_path, &trt_script_content)
                    .map_err(|e| format!("Failed to write TensorRT conversion script: {e}"))?;

                let trt_output = tokio::process::Command::new(&python)
                    .arg(trt_script_path.to_string_lossy().to_string())
                    .current_dir(&run_logs_dir)
                    .output()
                    .await
                    .map_err(|e| format!("TensorRT conversion failed: {e}"))?;

                // Clean up temp script
                let _ = std::fs::remove_file(&trt_script_path);

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
