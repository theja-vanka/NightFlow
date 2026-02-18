import { signal, computed } from "@preact/signals";
import { invoke } from "@tauri-apps/api/core";
import { projectRuns, loadRuns } from "./experiments.js";
import { currentProject, currentProjectId } from "./projects.js";
import { navigate, currentPage } from "./router.js";

// ── Per-project SSH state ─────────────────────────────────────────────────────
// Each project maintains its own independent connection state.

const _defaultState = () => ({
  connected: false,
  connecting: false,
  connectedAt: null,
  shouldAutoConnect: false,
  synced: false,
  syncing: false,
  error: null,
});

const _projectState = signal({}); // { [projectId]: ProjectState }

function _getState(projectId) {
  return _projectState.value[projectId] ?? _defaultState();
}

function _setState(projectId, updates) {
  const current = _getState(projectId);
  _projectState.value = {
    ..._projectState.value,
    [projectId]: { ...current, ...updates },
  };
}

// ── Computed signals (always reflect the active project) ──────────────────────

export const sshConnected = computed(() => _getState(currentProjectId.value).connected);
export const sshConnecting = computed(() => _getState(currentProjectId.value).connecting);
export const sshConnectedAt = computed(() => _getState(currentProjectId.value).connectedAt);
export const shouldAutoConnect = computed(() => _getState(currentProjectId.value).shouldAutoConnect);
export const dashboardSynced = computed(() => _getState(currentProjectId.value).synced);
export const dashboardSyncing = computed(() => _getState(currentProjectId.value).syncing);
export const sshConnectionError = computed(() => _getState(currentProjectId.value).error);

// ── Incremented to force useTerminal to tear down and reinitialize a session ──

export const terminalKey = signal(0);
export function bumpTerminalKey() { terminalKey.value++; }

// ── Stats (unchanged) ─────────────────────────────────────────────────────────

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

// ── SSH state setters ─────────────────────────────────────────────────────────

export function setSshConnected(connected, projectId = currentProjectId.value) {
  _setState(projectId, {
    connected,
    connectedAt: connected ? new Date().toISOString() : null,
    // Clear synced when disconnecting
    ...(!connected && { synced: false }),
  });
  // Navigate away from terminal if the active project disconnects
  if (!connected && projectId === currentProjectId.value && currentPage.value === "terminal") {
    navigate("dashboard");
  }
}

export function setSshConnecting(val, projectId = currentProjectId.value) {
  _setState(projectId, { connecting: val });
}

// ── SSH info computed ─────────────────────────────────────────────────────────

export const sshInfo = computed(() => {
  const project = currentProject.value;
  if (!project || !project.sshCommand) return null;
  const cmd = project.sshCommand.trim();
  if (cmd.toLowerCase() === "localhost") {
    return {
      command: "localhost",
      host: "localhost",
      connected: sshConnected.value,
      connectedAt: sshConnectedAt.value,
    };
  }
  const parts = cmd.split(/\s+/);
  const target = parts.find((p) => p.includes("@")) || parts[parts.length - 1];
  return {
    command: project.sshCommand,
    host: target,
    connected: sshConnected.value,
    connectedAt: sshConnectedAt.value,
  };
});

// ── Dataset path status ───────────────────────────────────────────────────────

export const datasetPathStatus = signal({
  folderPath: null, trainPath: null, valPath: null, testPath: null,
});

// ── Error helpers ─────────────────────────────────────────────────────────────

export function clearSshConnectionError(projectId = currentProjectId.value) {
  _setState(projectId, { error: null });
}

// ── Connect / disconnect ──────────────────────────────────────────────────────

export async function toggleSshConnection() {
  const projectId = currentProjectId.value;
  if (!projectId) return;

  if (sshConnected.value) {
    // Disconnect: kill this project's terminal session
    setSshConnecting(true, projectId);
    try {
      await invoke("kill_terminal", { sessionId: projectId });
    } catch (err) {
      console.error("Error killing terminal:", err);
    }
    setSshConnected(false, projectId);
    _setState(projectId, { shouldAutoConnect: false, connecting: false });
  } else {
    // Connect
    _setState(projectId, { error: null });

    const project = currentProject.value;
    if (!project) return;

    const rawSsh = project.sshCommand;
    const isSSH = rawSsh && rawSsh.trim() && rawSsh.trim().toLowerCase() !== "localhost";

    // Kill any existing session for this project first
    try { await invoke("kill_terminal", { sessionId: projectId }); } catch (_) {}

    if (isSSH) {
      setSshConnecting(true, projectId);
      _setState(projectId, { shouldAutoConnect: true });

      // 1. Verify SSH connectivity (fast, no output parsing)
      try {
        await invoke("test_ssh", { sshCommand: rawSsh.trim() });
      } catch (err) {
        setSshConnected(false, projectId);
        setSshConnecting(false, projectId);
        _setState(projectId, { error: { message: `${err}` } });
        return;
      }

      // 2. Spawn the interactive PTY session for this project
      try {
        await invoke("spawn_terminal", { sessionId: projectId, sshCommand: rawSsh.trim() });
      } catch (err) {
        setSshConnected(false, projectId);
        setSshConnecting(false, projectId);
        _setState(projectId, { error: { message: `Failed to start SSH: ${err}` } });
        return;
      }

      // 3. Mark connected — test_ssh already verified reachability
      setSshConnected(true, projectId);
      setSshConnecting(false, projectId);
    } else {
      // Local: mark connected immediately
      setSshConnected(true, projectId);
    }

    // Bump key so useTerminal reinitializes for this project
    bumpTerminalKey();
  }
}

// ── Dashboard sync ────────────────────────────────────────────────────────────

export async function syncDashboard() {
  const projectId = currentProjectId.value;
  _setState(projectId, { syncing: true });
  const minDelay = new Promise((r) => setTimeout(r, 800));
  try {
    const project = currentProject.value;
    if (project?.projectPath) {
      const rawSsh = project.sshCommand;
      const isSSH = rawSsh && rawSsh.trim() && rawSsh.trim().toLowerCase() !== "localhost";

      try {
        if (isSSH) {
          await invoke("ssh_mkdir", { sshCommand: rawSsh.trim(), path: project.projectPath });
        } else {
          await invoke("ensure_project_dir", { path: project.projectPath });
        }
      } catch (dirErr) {
        console.warn("[syncDashboard] Could not ensure project directory:", dirErr);
      }

      const status = { folderPath: null, trainPath: null, valPath: null, testPath: null };
      const pathsToCheck = [];
      if (project.folderPath) pathsToCheck.push({ key: "folderPath", path: project.folderPath });
      if (project.trainPath) pathsToCheck.push({ key: "trainPath", path: project.trainPath });
      if (project.valPath) pathsToCheck.push({ key: "valPath", path: project.valPath });
      if (project.testPath) pathsToCheck.push({ key: "testPath", path: project.testPath });

      if (pathsToCheck.length > 0) {
        await Promise.all(
          pathsToCheck.map(async ({ key, path }) => {
            try {
              status[key] = isSSH
                ? await invoke("ssh_check_path", { sshCommand: rawSsh.trim(), path })
                : await invoke("check_path_exists", { path });
            } catch {
              status[key] = null;
            }
          })
        );
      }
      datasetPathStatus.value = status;
    }

    await Promise.all([loadRuns(), minDelay]);
    _setState(projectId, { synced: true });
  } catch (err) {
    console.error("[syncDashboard] error:", err);
  } finally {
    _setState(projectId, { syncing: false });
  }
}
