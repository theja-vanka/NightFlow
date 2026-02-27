import { useState, useEffect } from "preact/hooks";
import { invoke } from "@tauri-apps/api/core";
import { currentProject } from "../state/projects.js";
import { sshConnected } from "../state/dashboard.js";

// Returns a color that transitions from the base color through amber to red
// based on usage percentage thresholds
function getUsageColor(percentage, baseColor) {
    if (percentage >= 90) return "#ef4444"; // red — critical
    if (percentage >= 75) return "#f97316"; // orange — high
    if (percentage >= 60) return "#f59e0b"; // amber — elevated
    return baseColor;
}

// Distinct base color per metric type
const METRIC_COLORS = {
    cpu: "#3b82f6",      // blue
    memory: "#8b5cf6",   // violet
    disk: "#f59e0b",     // amber
    gpuCompute: "#10b981", // emerald
    gpuVram: "#06b6d4",  // cyan
    gpuTemp: "#ef4444",  // red
};

function ProgressBar({ label, valueStr, percentage, colorPrimary, dynamic = false }) {
    const color = dynamic ? getUsageColor(percentage, colorPrimary) : colorPrimary;
    return (
        <div class="metrics-progress-item">
            <div class="metrics-progress-header">
                <span class="metrics-progress-label" style={{ color }}>{label}</span>
                <span class="metrics-progress-value">{valueStr}</span>
            </div>
            <div class="metrics-progress-track">
                <div
                    class="metrics-progress-fill"
                    style={{
                        width: `${Math.max(0, Math.min(100, percentage))}%`,
                        backgroundColor: color
                    }}
                />
            </div>
        </div>
    );
}

export function SystemMetricsPanel() {
    const [metrics, setMetrics] = useState(null);
    const [error, setError] = useState(null);
    const connected = sshConnected.value;
    const project = currentProject.value;

    useEffect(() => {
        let mounted = true;
        let timer;

        async function fetchMetrics() {
            if (!connected || !project) return;
            try {
                const cmd = project.sshCommand?.trim().toLowerCase() === "localhost" ? null : project.sshCommand;
                const resStr = await invoke("get_system_metrics", { sshCommand: cmd });
                if (mounted) {
                    setMetrics(JSON.parse(resStr));
                    setError(null);
                }
            } catch (err) {
                if (mounted) setError(String(err));
            }

            if (mounted) {
                timer = setTimeout(fetchMetrics, 5000); // Poll every 5s
            }
        }

        if (connected) {
            fetchMetrics();
        } else {
            setMetrics(null);
            setError(null);
        }

        return () => {
            mounted = false;
            clearTimeout(timer);
        };
    }, [connected, project]);

    if (!connected) return null;

    if (error) {
        return (
            <div class="system-metrics-panel metrics-error">
                <span class="metrics-error-icon">⚠️</span>
                <span class="metrics-error-text">Failed to fetch system metrics: {error}</span>
            </div>
        );
    }

    if (!metrics) {
        return (
            <div class="system-metrics-panel metrics-loading">
                <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2.5"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    class="ssh-btn-spinner"
                >
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
                <span class="metrics-loading-text">Loading system metrics...</span>
            </div>
        );
    }

    // Formatting helpers
    const formatGB = (bytes) => (bytes / (1024 ** 3)).toFixed(1);
    const formatPct = (val) => val.toFixed(1) + "%";

    // Calculate specific metrics
    let cpuStr = "—";
    let cpuPct = 0;
    if (metrics.loadavg && metrics.cpu_cores) {
        const load = metrics.loadavg[0];
        cpuStr = `Load: ${load.toFixed(2)} (${metrics.cpu_cores} cores)`;
        cpuPct = Math.min(100, (load / metrics.cpu_cores) * 100);
    } else if (metrics.cpu_cores) {
        cpuStr = `${metrics.cpu_cores} cores`;
    }

    let memStr = "—";
    let memPct = 0;
    if (metrics.mem_total && metrics.mem_used) {
        memStr = `${formatGB(metrics.mem_used)} / ${formatGB(metrics.mem_total)} GB`;
        memPct = (metrics.mem_used / metrics.mem_total) * 100;
    }

    let diskStr = "—";
    let diskPct = 0;
    if (metrics.disk_total && metrics.disk_used) {
        diskStr = `${formatGB(metrics.disk_used)} / ${formatGB(metrics.disk_total)} GB`;
        diskPct = (metrics.disk_used / metrics.disk_total) * 100;
    }

    return (
        <div class="system-metrics-panel">
            <div class="metrics-header">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="4" y="4" width="16" height="16" rx="2" ry="2" />
                    <rect x="9" y="9" width="6" height="6" />
                    <line x1="9" y1="1" x2="9" y2="4" />
                    <line x1="15" y1="1" x2="15" y2="4" />
                    <line x1="9" y1="20" x2="9" y2="23" />
                    <line x1="15" y1="20" x2="15" y2="23" />
                    <line x1="20" y1="9" x2="23" y2="9" />
                    <line x1="20" y1="14" x2="23" y2="14" />
                    <line x1="1" y1="9" x2="4" y2="9" />
                    <line x1="1" y1="14" x2="4" y2="14" />
                </svg>
                <span>System Metrics</span>
            </div>

            <div class="metrics-grid">
                <div class="metrics-main">
                    <ProgressBar label="CPU" valueStr={cpuStr} percentage={cpuPct} colorPrimary={METRIC_COLORS.cpu} dynamic />
                    <ProgressBar label="Memory" valueStr={memStr} percentage={memPct} colorPrimary={METRIC_COLORS.memory} dynamic />
                    <ProgressBar label="Disk (Root)" valueStr={diskStr} percentage={diskPct} colorPrimary={METRIC_COLORS.disk} dynamic />
                </div>

                {metrics.gpus && metrics.gpus.length > 0 && (
                    <div class="metrics-gpus">
                        {metrics.gpus.map((gpu) => (
                            <div class="metrics-gpu-card" key={gpu.index}>
                                <div class="metrics-gpu-header">
                                    <span class="metrics-gpu-name">GPU {gpu.index}: {gpu.name}</span>
                                    <span class="metrics-gpu-temp" style={{
                                        color: gpu.temperature >= 85 ? "#ef4444"
                                            : gpu.temperature >= 70 ? "#f97316"
                                            : gpu.temperature >= 55 ? "#f59e0b"
                                            : "var(--text-muted)"
                                    }}>{gpu.temperature}°C</span>
                                </div>
                                <ProgressBar
                                    label="Compute"
                                    valueStr={formatPct(gpu.utilization)}
                                    percentage={gpu.utilization}
                                    colorPrimary={METRIC_COLORS.gpuCompute}
                                    dynamic
                                />
                                <ProgressBar
                                    label="VRAM"
                                    valueStr={`${(gpu.mem_used / 1024).toFixed(1)} / ${(gpu.mem_total / 1024).toFixed(1)} GB`}
                                    percentage={(gpu.mem_used / gpu.mem_total) * 100}
                                    colorPrimary={METRIC_COLORS.gpuVram}
                                    dynamic
                                />
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
