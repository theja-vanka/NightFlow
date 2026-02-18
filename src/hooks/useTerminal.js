import { useRef, useEffect, useState } from "preact/hooks";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { theme } from "../state/theme.js";
import { setSshConnected, setSshConnecting, terminalKey } from "../state/dashboard.js";

// ── Themes ────────────────────────────────────────────────────────────────────

const darkTheme = {
  background: "#0f0f1a", foreground: "#d4d4d8", cursor: "#7dd3fc",
  cursorAccent: "#0f0f1a", selectionBackground: "#7dd3fc33", selectionForeground: "#ffffff",
  black: "#18181b", red: "#f87171", green: "#4ade80", yellow: "#facc15",
  blue: "#60a5fa", magenta: "#c084fc", cyan: "#22d3ee", white: "#d4d4d8",
  brightBlack: "#52525b", brightRed: "#fca5a5", brightGreen: "#86efac",
  brightYellow: "#fde68a", brightBlue: "#93c5fd", brightMagenta: "#d8b4fe",
  brightCyan: "#67e8f9", brightWhite: "#fafafa",
};

const lightTheme = {
  background: "#f5f5f5", foreground: "#1a1a1a", cursor: "#0369a1",
  cursorAccent: "#f5f5f5", selectionBackground: "#0369a133", selectionForeground: "#000000",
  black: "#1a1a1a", red: "#dc2626", green: "#16a34a", yellow: "#ca8a04",
  blue: "#2563eb", magenta: "#9333ea", cyan: "#0891b2", white: "#d4d4d4",
  brightBlack: "#737373", brightRed: "#ef4444", brightGreen: "#22c55e",
  brightYellow: "#eab308", brightBlue: "#3b82f6", brightMagenta: "#a855f7",
  brightCyan: "#06b6d4", brightWhite: "#fafafa",
};

const getTermTheme = () => (theme.value === "dark" ? darkTheme : lightTheme);

// ── Per-session terminal registry (persists across navigation) ────────────────
//
// _sessions: Map<projectId, session>
//   session = { term, fit, info, alive, sshCommand, isProject, projectPath,
//               onData, onResize, unlistenOutput, unlistenExit,
//               onAliveChange, onDimsChange, onStatusChange,
//               _termKey,
//               _sshStatus, _sshMessage, _sshTimeout }

const _sessions = new Map();

// Detach all terminal elements from container except the one we're about to show.
// Uses removeChild (not innerHTML="") so the detached elements stay valid for re-attachment.
function _detachOtherSessions(container, keepElement) {
  Array.from(container.children).forEach((child) => {
    if (child !== keepElement) container.removeChild(child);
  });
}

function _destroySession(projectId) {
  const s = _sessions.get(projectId);
  if (!s) return;
  s.onData?.dispose();
  s.onResize?.dispose();
  s.unlistenOutput?.();
  s.unlistenExit?.();
  s.term.dispose();
  if (s._sshTimeout) clearTimeout(s._sshTimeout);
  _sessions.delete(projectId);
}

function _setSessionStatus(s, status, message) {
  s._sshStatus = status;
  s._sshMessage = message;
  s.onStatusChange?.({ status, message });
}

function _handleSshOutput(s, projectId, out) {
  const low = out.toLowerCase();
  if (s._sshStatus !== "connecting") return;

  const success =
    low.includes("welcome") ||
    low.includes("last login") ||
    /[$#]\s*$/.test(low);

  if (success) {
    if (s._sshTimeout) { clearTimeout(s._sshTimeout); s._sshTimeout = null; }
    _setSessionStatus(s, "connected", "SSH connection established");
    setSshConnected(true, projectId);
    setSshConnecting(false, projectId);
    if (s.projectPath) {
      setTimeout(() => {
        invoke("pty_write", { sessionId: projectId, data: `cd ${s.projectPath}\r` });
      }, 300);
    }
    setTimeout(() => {
      if (s._sshStatus === "connected") _setSessionStatus(s, "idle", "");
    }, 3000);
    return;
  }

  const failure =
    low.includes("connection refused") || low.includes("connection timed out") ||
    low.includes("connection closed") || low.includes("connection reset") ||
    low.includes("permission denied") || low.includes("authentication failed") ||
    low.includes("publickey") || low.includes("no such identity") ||
    low.includes("identity file") || low.includes("key_load_public") ||
    low.includes("host key verification failed") || low.includes("no route to host") ||
    low.includes("network is unreachable") || low.includes("could not resolve hostname") ||
    low.includes("operation timed out") || low.includes("broken pipe");

  if (failure) {
    if (s._sshTimeout) { clearTimeout(s._sshTimeout); s._sshTimeout = null; }
    _setSessionStatus(s, "failed", "SSH connection failed");
    setSshConnected(false, projectId);
    setSshConnecting(false, projectId);
    setTimeout(() => { if (s._sshStatus === "failed") _setSessionStatus(s, "idle", ""); }, 5000);
  }
}

async function _initSession(container, projectId, sshCommand, isProject, projectPath) {
  const term = new Terminal({
    fontSize: 13,
    fontFamily: '"Hack Nerd Font Mono", "SF Mono", "Fira Code", "Cascadia Code", "Menlo", "Consolas", monospace',
    cursorBlink: false,
    cursorStyle: "block",
    scrollback: 10000,
    allowProposedApi: true,
    macOptionIsMeta: true,
    theme: getTermTheme(),
  });

  const fit = new FitAddon();
  term.loadAddon(fit);
  term.loadAddon(new WebLinksAddon());
  term.open(container);
  try { term.loadAddon(new WebglAddon()); } catch (_) { /* ignore WebGL errors */ }
  fit.fit();

  const s = {
    term, fit,
    info: null, alive: true,
    sshCommand, isProject, projectPath,
    onData: null, onResize: null,
    unlistenOutput: null, unlistenExit: null,
    onAliveChange: null, onDimsChange: null, onStatusChange: null,
    _termKey: terminalKey.value,
    _sshStatus: "idle", _sshMessage: "", _sshTimeout: null,
  };

  // Listen only to output events for this session
  s.unlistenOutput = await listen("pty-output", (event) => {
    const { session_id, data } = event.payload;
    if (session_id !== projectId) return;
    term.write(data);
    if (sshCommand && isProject) _handleSshOutput(s, projectId, data);
  });

  s.unlistenExit = await listen("pty-exit", (event) => {
    const { session_id } = event.payload;
    if (session_id !== projectId) return;
    s.alive = false;
    if (isProject) setSshConnected(false, projectId);
    s.onAliveChange?.(false);
    term.writeln("\r\n\x1b[2m[Process exited — press Restart to relaunch]\x1b[0m");
  });

  try {
    const ptyAlive = await invoke("is_terminal_alive", { sessionId: projectId }).catch(() => false);

    if (!ptyAlive) {
      // Spawn a fresh PTY for this project
      if (sshCommand && isProject) {
        _setSessionStatus(s, "connecting", `Connecting to ${sshCommand}...`);
        s._sshTimeout = setTimeout(() => {
          if (s._sshStatus === "connecting") {
            _setSessionStatus(s, "failed", "SSH connection timed out");
            setSshConnected(false, projectId);
            setSshConnecting(false, projectId);
            term.writeln("\r\n\x1b[31m[SSH connection timed out after 30 seconds]\x1b[0m");
            setTimeout(() => { if (s._sshStatus === "failed") _setSessionStatus(s, "idle", ""); }, 5000);
          }
        }, 30000);
      }
      const args = { sessionId: projectId, rows: term.rows, cols: term.cols };
      if (sshCommand) args.sshCommand = sshCommand;
      if (!sshCommand && projectPath) args.cwd = projectPath;
      await invoke("spawn_terminal", args);
      if (isProject && !sshCommand) setSshConnected(true, projectId);
      if (!sshCommand) setSshConnecting(false, projectId);
    } else if (sshCommand) {
      // PTY already running (spawned by dashboard connect) — send \r for a fresh prompt
      setTimeout(() => invoke("pty_write", { sessionId: projectId, data: "\r" }), 150);
    }
  } catch (err) {
    term.writeln(`\r\n\x1b[31mFailed to spawn terminal: ${err}\x1b[0m`);
    if (sshCommand && isProject) {
      if (s._sshTimeout) { clearTimeout(s._sshTimeout); s._sshTimeout = null; }
      _setSessionStatus(s, "failed", "Failed to spawn terminal");
      setSshConnected(false, projectId);
    }
    setSshConnecting(false, projectId);
  }

  s.info = await invoke("get_terminal_info", { sessionId: projectId }).catch(() => null);
  s.onData = term.onData((data) => invoke("pty_write", { sessionId: projectId, data }));
  s.onResize = term.onResize(({ cols, rows }) => {
    s.onDimsChange?.({ cols, rows });
    invoke("pty_resize", { sessionId: projectId, rows, cols });
  });

  return s;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useTerminal({
  projectId = null,
  sshCommand = null,
  isProject = false,
  projectPath = null,
  enabled = true,
} = {}) {
  const containerRef = useRef(null);
  const [dims, setDims] = useState({ cols: 0, rows: 0 });
  const [alive, setAlive] = useState(true);
  const [info, setInfo] = useState(null);
  const [sshStatus, setSshStatus] = useState("idle");
  const [sshMessage, setSshMessageState] = useState("");

  // Sync theme changes to all live terminals
  useEffect(() => {
    for (const s of _sessions.values()) {
      s.term.options.theme = getTermTheme();
    }
  }, [theme.value]);

  // Terminal lifecycle
  useEffect(() => {
    if (!enabled || !projectId) return;
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;

    (async () => {
      const existing = _sessions.get(projectId);

      // Reinit if the terminal key changed (forced reconnect)
      if (existing && existing._termKey !== terminalKey.value) {
        await invoke("kill_terminal", { sessionId: projectId });
        _destroySession(projectId);
        _detachOtherSessions(container, null);
      }

      if (!_sessions.has(projectId)) {
        // Remove any other project's terminal element from the container before opening a new one
        _detachOtherSessions(container, null);
        const s = await _initSession(container, projectId, sshCommand, isProject, projectPath);
        _sessions.set(projectId, s);
        s._termKey = terminalKey.value;
        if (cancelled) return;

        s.onAliveChange = (v) => setAlive(v);
        s.onDimsChange = (d) => setDims(d);
        s.onStatusChange = ({ status, message }) => {
          setSshStatus(status);
          setSshMessageState(message);
        };
        setInfo(s.info);
        setAlive(s.alive);
        setDims({ cols: s.term.cols, rows: s.term.rows });
        setSshStatus(s._sshStatus);
        setSshMessageState(s._sshMessage);
        s.term.focus();
      } else {
        // Swap in this project's terminal, detaching any other session's element first
        const s = _sessions.get(projectId);
        _detachOtherSessions(container, s.term.element);
        if (s.term.element?.parentElement !== container) {
          container.appendChild(s.term.element);
        }
        s.fit.fit();
        if (!cancelled) {
          s.onAliveChange = (v) => setAlive(v);
          s.onDimsChange = (d) => setDims(d);
          s.onStatusChange = ({ status, message }) => {
            setSshStatus(status);
            setSshMessageState(message);
          };
          setInfo(s.info);
          setAlive(s.alive);
          setDims({ cols: s.term.cols, rows: s.term.rows });
          setSshStatus(s._sshStatus);
          setSshMessageState(s._sshMessage);
          s.term.focus();
        }
      }
    })();

    const obs = new ResizeObserver(() => {
      const s = _sessions.get(projectId);
      if (s?.fit) s.fit.fit();
    });
    obs.observe(container);

    return () => {
      cancelled = true;
      obs.disconnect();
      const s = _sessions.get(projectId);
      if (s) {
        s.onAliveChange = null;
        s.onDimsChange = null;
        s.onStatusChange = null;
      }
    };
  }, [projectId, sshCommand, enabled, terminalKey.value]);

  async function clear() {
    const s = _sessions.get(projectId);
    s?.term?.clear();
    s?.term?.focus();
  }

  async function kill() {
    const s = _sessions.get(projectId);
    if (s?._sshTimeout) { clearTimeout(s._sshTimeout); s._sshTimeout = null; }
    await invoke("kill_terminal", { sessionId: projectId });
    if (s) {
      if (s.isProject) setSshConnected(false, projectId);
      s.alive = false;
      s.term.writeln("\r\n\x1b[2m[Terminal killed]\x1b[0m");
      _destroySession(projectId);
    }
    setAlive(false);
    setSshStatus("idle");
    setSshMessageState("");
    setSshConnecting(false, projectId);
  }

  async function restart() {
    const s = _sessions.get(projectId);
    if (s?._sshTimeout) { clearTimeout(s._sshTimeout); s._sshTimeout = null; }
    setSshStatus("idle");
    setSshMessageState("");
    setSshConnecting(false, projectId);
    await invoke("kill_terminal", { sessionId: projectId });
    _destroySession(projectId);
    const container = containerRef.current;
    if (!container) return;
    _detachOtherSessions(container, null);
    const newS = await _initSession(container, projectId, sshCommand, isProject, projectPath);
    _sessions.set(projectId, newS);
    newS._termKey = terminalKey.value;
    newS.onAliveChange = (v) => setAlive(v);
    newS.onDimsChange = (d) => setDims(d);
    newS.onStatusChange = ({ status, message }) => {
      setSshStatus(status);
      setSshMessageState(message);
    };
    setInfo(newS.info);
    setAlive(newS.alive);
    setDims({ cols: newS.term.cols, rows: newS.term.rows });
    setSshStatus(newS._sshStatus);
    setSshMessageState(newS._sshMessage);
    newS.term.focus();
  }

  function focus() {
    _sessions.get(projectId)?.term?.focus();
  }

  return { containerRef, dims, alive, info, sshStatus, sshMessage, clear, kill, restart, focus };
}
