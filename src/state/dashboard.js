import { signal, computed } from "@preact/signals";
import { projectRuns } from "./experiments.js";
import { currentProject } from "./projects.js";

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

export const sshConnected = signal(false);
export const sshConnecting = signal(false);
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
    connecting: sshConnecting.value,
    connectedAt: sshConnectedAt.value,
  };
});

export function toggleSshConnection() {
  if (sshConnecting.value) return;
  sshConnecting.value = true;

  if (sshConnected.value) {
    // Disconnecting
    setTimeout(() => {
      sshConnected.value = false;
      sshConnectedAt.value = null;
      sshConnecting.value = false;
    }, 1500);
  } else {
    // Connecting
    setTimeout(() => {
      sshConnected.value = true;
      sshConnectedAt.value = new Date().toISOString();
      sshConnecting.value = false;
    }, 2000);
  }
}

// Mock: auto-connect projects that have an SSH command
const project = currentProject.value;
if (project?.sshCommand) {
  sshConnected.value = true;
  sshConnectedAt.value = new Date(Date.now() - 47 * 60000).toISOString();
}
