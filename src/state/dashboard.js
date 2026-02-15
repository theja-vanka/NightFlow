import { signal, computed } from "@preact/signals";
import { invoke } from "@tauri-apps/api/core";
import { projectRuns } from "./experiments.js";
import { currentProject } from "./projects.js";
import { navigate } from "./router.js";

export const stats = computed(() => {
  const r = projectRuns.value;
  const completed = r.filter((x) => x.status === "completed");
  const running = r.filter((x) => x.status === "running");
  const failed = r.filter((x) => x.status === "failed");
  const queued = r.filter((x) => x.status === "queued");

  const bestAcc = completed.length
    ? Math.max(...completed.map((x) => x.bestAcc ?? 0))
    : null;
  const avgLoss = completed.length
    ? +(completed.reduce((s, x) => s + (x.valLoss ?? 0), 0) / completed.length).toFixed(4)
    : null;

  return {
    totalRuns: r.length,
    completed: completed.length,
    running: running.length,
    failed: failed.length,
    queued: queued.length,
    bestAcc,
    avgLoss,
  };
});

// ── SSH connection state ──
// Real state: driven by whether the terminal PTY is alive with an SSH command

export const sshConnected = signal(false);
export const sshConnectedAt = signal(null);

export const sshInfo = computed(() => {
  const project = currentProject.value;
  if (!project || !project.sshCommand) return null;

  // Parse host from ssh command (e.g. "ssh user@host" → "user@host")
  const parts = project.sshCommand.trim().split(/\s+/);
  const target = parts.find((p) => p.includes("@")) || parts[parts.length - 1];

  return {
    command: project.sshCommand,
    host: target,
    connected: sshConnected.value,
    connectedAt: sshConnectedAt.value,
  };
});

export function setSshConnected(connected) {
  sshConnected.value = connected;
  if (connected) {
    sshConnectedAt.value = new Date().toISOString();
  } else {
    sshConnectedAt.value = null;
  }
}

export async function toggleSshConnection() {
  if (sshConnected.value) {
    // Disconnect: kill the terminal
    await invoke("kill_terminal");
    setSshConnected(false);
  } else {
    // Connect: navigate to terminal page — it will auto-spawn SSH
    navigate("terminal");
  }
}
