use tauri::command;

#[command]
pub async fn get_system_metrics(ssh_command: Option<String>) -> Result<String, String> {
    let python_script = r#"
import json, os, subprocess, sys

res = {}
if hasattr(os, 'cpu_count'):
    res['cpu_cores'] = os.cpu_count()

# Memory
try:
    if sys.platform == 'darwin':
        mem_total = int(subprocess.check_output(['sysctl', '-n', 'hw.memsize']).strip())
        vm_stat = subprocess.check_output(['vm_stat']).decode('utf-8').split('\n')
        pages_active = 0
        page_size = 4096
        for line in vm_stat:
            if 'Pages active:' in line: pages_active = int(line.split(':')[1].strip().strip('.'))
        res['mem_total'] = mem_total
        res['mem_used'] = pages_active * page_size
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

# Disk
try:
    st = os.statvfs('/')
    res['disk_total'] = st.f_blocks * st.f_frsize
    res['disk_used'] = (st.f_blocks - st.f_bfree) * st.f_frsize
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
    res['loadavg'] = os.getloadavg()
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
        cmd.arg("python3");
        cmd.arg("-c");
        cmd.arg(python_script);

        let output = cmd.output().await.map_err(|e| e.to_string())?;
        if output.status.success() {
            Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
        } else {
            Err(String::from_utf8_lossy(&output.stderr).to_string())
        }
    } else {
        let output = tokio::process::Command::new("python3")
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
    ssh_command: Option<String>,
) -> Result<DownloadModelResult, String> {
    let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".to_string());
    let downloads = format!("{}/Downloads", home);

    let _ = std::fs::create_dir_all(&downloads);

    let pp = project_path.trim_end_matches('/');
    let ckpt_dir = format!("{pp}/logs/{run_id}/checkpoints");

    if let Some(ssh_cmd) = ssh_command {
        let parts: Vec<String> = ssh_cmd.split_whitespace().map(String::from).collect();
        if parts.len() < 2 {
            return Err("Invalid SSH command".to_string());
        }

        let find_script = format!(
            r#"find "{ckpt_dir}" -name "*.ckpt" -type f 2>/dev/null | head -1"#
        );
        let find_output = tokio::process::Command::new(&parts[0])
            .args(&parts[1..])
            .arg(&find_script)
            .output()
            .await
            .map_err(|e| format!("SSH failed: {e}"))?;

        let remote_path = String::from_utf8_lossy(&find_output.stdout).trim().to_string();
        if remote_path.is_empty() {
            return Err("No checkpoint file found. Training may not have saved a model yet.".to_string());
        }

        let dest_name = format!("{}.ckpt", run_name);
        let dest = format!("{downloads}/{dest_name}");

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

        let scp_source = format!("{host_part}:{remote_path}");
        scp_args.push(scp_source);
        scp_args.push(dest.clone());

        let scp_output = tokio::process::Command::new("scp")
            .args(&scp_args)
            .output()
            .await
            .map_err(|e| format!("scp failed: {e}"))?;

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

        match best_ckpt {
            Some(src) => {
                let dest_name = format!("{}.ckpt", run_name);
                let dest = format!("{downloads}/{dest_name}");
                std::fs::copy(&src, &dest)
                    .map_err(|e| format!("Copy failed: {e}"))?;
                Ok(DownloadModelResult {
                    success: true,
                    path: dest,
                    message: format!("Saved to ~/Downloads/{dest_name}"),
                })
            }
            None => Err("No checkpoint file found. Training may not have saved a model yet.".to_string()),
        }
    }
}
