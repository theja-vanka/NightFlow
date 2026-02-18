import { signal, computed } from "@preact/signals";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { projectRuns } from "./experiments.js";
import { currentProject } from "./projects.js";
import { navigate, currentPage } from "./router.js";
// Incremented to force useTerminal to tear down and reinitialize the PTY session
export const terminalKey = signal(0);
export function bumpTerminalKey() { terminalKey.value++; }

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

// SSH connection error state
export const sshConnectionError = signal(null); // { message: string } or null

// Global SSH connection monitoring
let sshConnectionTimeout = null;
let globalPtyOutputListener = null;

// Set up global PTY output listener to monitor SSH connections
async function setupGlobalSshMonitoring() {
  if (globalPtyOutputListener) return; // Already set up

  globalPtyOutputListener = await listen("pty-output", (event) => {
    // Only monitor if we're in a connecting state
    if (!sshConnecting.value) return;

    const output = event.payload;
    const lowerOutput = output.toLowerCase();

    // SSH connection success indicators
    if (lowerOutput.includes("welcome") ||
        lowerOutput.includes("last login") ||
        lowerOutput.match(/[\$#]\s*$/)) {
      // Clear timeout on success
      if (sshConnectionTimeout) {
        clearTimeout(sshConnectionTimeout);
        sshConnectionTimeout = null;
      }
      setSshConnected(true);
      sshConnecting.value = false;
      // Clear any error on successful connection
      sshConnectionError.value = null;
      return;
    }

    // SSH connection failure indicators
    if (lowerOutput.includes("connection refused") ||
        lowerOutput.includes("connection timed out") ||
        lowerOutput.includes("connection closed") ||
        lowerOutput.includes("connection reset") ||
        lowerOutput.includes("permission denied") ||
        lowerOutput.includes("authentication failed") ||
        lowerOutput.includes("publickey") ||
        lowerOutput.includes("no such identity") ||
        lowerOutput.includes("host key verification failed") ||
        lowerOutput.includes("no route to host") ||
        lowerOutput.includes("network is unreachable") ||
        lowerOutput.includes("could not resolve hostname") ||
        lowerOutput.includes("operation timed out") ||
        lowerOutput.includes("broken pipe")) {
      // Clear timeout on failure
      if (sshConnectionTimeout) {
        clearTimeout(sshConnectionTimeout);
        sshConnectionTimeout = null;
      }
      setSshConnected(false);
      sshConnecting.value = false;

      // Set error message for popup
      let errorMsg = "SSH connection failed";
      if (lowerOutput.includes("connection refused")) errorMsg = "Connection refused - server is not accepting connections";
      else if (lowerOutput.includes("connection timed out")) errorMsg = "Connection timed out - server is not responding";
      else if (lowerOutput.includes("permission denied")) errorMsg = "Permission denied - check your credentials";
      else if (lowerOutput.includes("authentication failed")) errorMsg = "Authentication failed - invalid credentials";
      else if (lowerOutput.includes("host key verification failed")) errorMsg = "Host key verification failed - check your known_hosts file";
      else if (lowerOutput.includes("no route to host")) errorMsg = "No route to host - check network connectivity";
      else if (lowerOutput.includes("could not resolve hostname")) errorMsg = "Could not resolve hostname - check the server address";

      sshConnectionError.value = { message: errorMsg };

      // Kill the terminal process on failure to ensure clean state
      invoke("kill_terminal").catch(() => {});
    }
  });
}

// Initialize global monitoring on module load
setupGlobalSshMonitoring();

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
    // If user is on terminal view when disconnected, redirect to dashboard
    if (currentPage.value === "terminal") {
      navigate("dashboard");
    }
  }
}

export function clearSshConnectionError() {
  sshConnectionError.value = null;
}

export async function toggleSshConnection() {
  if (sshConnected.value) {
    // Disconnect: kill the terminal and reset state
    sshConnecting.value = true;
    // Clear any pending timeout
    if (sshConnectionTimeout) {
      clearTimeout(sshConnectionTimeout);
      sshConnectionTimeout = null;
    }
    try {
      await invoke("kill_terminal");
    } catch (err) {
      console.error("Error killing terminal:", err);
    }
    setSshConnected(false);
    shouldAutoConnect.value = false;
    sshConnecting.value = false;
  } else {
    // Connect: signal useTerminal to spawn a fresh session
    sshConnectionError.value = null;

    const project = currentProject.value;
    if (!project) return;

    const rawSsh = project.sshCommand;
    const isSSH = rawSsh && rawSsh.trim() && rawSsh.trim().toLowerCase() !== "localhost";

    // Kill any existing PTY first
    try { await invoke("kill_terminal"); } catch (_) {}

    if (isSSH) {
      sshConnecting.value = true;
      shouldAutoConnect.value = true;

      // 1. Verify SSH connectivity first (fast, reliable, no output parsing)
      try {
        await invoke("test_ssh", { sshCommand: rawSsh.trim() });
      } catch (err) {
        setSshConnected(false);
        sshConnecting.value = false;
        sshConnectionError.value = { message: `${err}` };
        return;
      }

      // 2. SSH is reachable — spawn the interactive PTY session
      try {
        await invoke("spawn_terminal", { sshCommand: rawSsh.trim() });
      } catch (err) {
        setSshConnected(false);
        sshConnecting.value = false;
        sshConnectionError.value = { message: `Failed to start SSH: ${err}` };
        return;
      }

      // 3. Mark connected — no fragile output parsing needed
      setSshConnected(true);
      sshConnecting.value = false;
    } else {
      // Local: mark connected immediately; useTerminal spawns when terminal tab is opened
      setSshConnected(true);
    }

    // Bump key so useTerminal tears down any stale _p and reattaches when navigated to
    bumpTerminalKey();
  }
}
