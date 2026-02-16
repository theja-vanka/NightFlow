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
export const sshConnecting = signal(false);
export const sshConnectedAt = signal(null);
export const shouldAutoConnect = signal(false);

export const sshInfo = computed(() => {
  const project = currentProject.value;
  if (!project || !project.sshCommand) return null;

  const cmd = project.sshCommand.trim();

  // Handle localhost specially
  if (cmd.toLowerCase() === "localhost") {
    return {
      command: "localhost",
      host: "localhost",
      connected: sshConnected.value,
      connectedAt: sshConnectedAt.value,
    };
  }

  // Parse host from ssh command (e.g. "ssh user@host" → "user@host")
  const parts = cmd.split(/\s+/);
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
    // Disconnect: kill the terminal and reset state
    sshConnecting.value = true;
    try {
      await invoke("kill_terminal");
    } catch (err) {
      console.error("Error killing terminal:", err);
    }
    setSshConnected(false);
    shouldAutoConnect.value = false;
    sshConnecting.value = false;
  } else {
    // Connect: spawn terminal in background
    sshConnecting.value = true;
    shouldAutoConnect.value = true;

    try {
      const project = currentProject.value;
      if (!project) {
        sshConnecting.value = false;
        return;
      }

      const rawSsh = project.sshCommand;
      const sshCommand = rawSsh && rawSsh.trim() && rawSsh.trim().toLowerCase() !== "localhost"
        ? rawSsh.trim()
        : null;

      const spawnArgs = { rows: 24, cols: 80 };
      if (sshCommand) spawnArgs.sshCommand = sshCommand;

      await invoke("spawn_terminal", spawnArgs);
      setSshConnected(true);
      sshConnecting.value = false;
    } catch (err) {
      console.error("Failed to spawn terminal:", err);
      sshConnecting.value = false;
      shouldAutoConnect.value = false;
    }
  }
}
