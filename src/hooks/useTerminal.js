import { useRef, useEffect, useState } from "preact/hooks";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { signal } from "@preact/signals";
import { theme } from "../state/theme.js";
import { setSshConnected, sshConnecting, terminalKey } from "../state/dashboard.js";

// ── Themes ───────────────────────────────────────────────────────────────────

const darkTheme = {
  background: "#0f0f1a",
  foreground: "#d4d4d8",
  cursor: "#7dd3fc",
  cursorAccent: "#0f0f1a",
  selectionBackground: "#7dd3fc33",
  selectionForeground: "#ffffff",
  black: "#18181b",
  red: "#f87171",
  green: "#4ade80",
  yellow: "#facc15",
  blue: "#60a5fa",
  magenta: "#c084fc",
  cyan: "#22d3ee",
  white: "#d4d4d8",
  brightBlack: "#52525b",
  brightRed: "#fca5a5",
  brightGreen: "#86efac",
  brightYellow: "#fde68a",
  brightBlue: "#93c5fd",
  brightMagenta: "#d8b4fe",
  brightCyan: "#67e8f9",
  brightWhite: "#fafafa",
};

const lightTheme = {
  background: "#f5f5f5",
  foreground: "#1a1a1a",
  cursor: "#0369a1",
  cursorAccent: "#f5f5f5",
  selectionBackground: "#0369a133",
  selectionForeground: "#000000",
  black: "#1a1a1a",
  red: "#dc2626",
  green: "#16a34a",
  yellow: "#ca8a04",
  blue: "#2563eb",
  magenta: "#9333ea",
  cyan: "#0891b2",
  white: "#d4d4d4",
  brightBlack: "#737373",
  brightRed: "#ef4444",
  brightGreen: "#22c55e",
  brightYellow: "#eab308",
  brightBlue: "#3b82f6",
  brightMagenta: "#a855f7",
  brightCyan: "#06b6d4",
  brightWhite: "#fafafa",
};

const getTermTheme = () => (theme.value === "dark" ? darkTheme : lightTheme);

// ── SSH connection signals (shared, survive navigation) ───────────────────────

export const sshConnectionStatus = signal("idle"); // idle | connecting | connected | failed
export const sshConnectionMessage = signal("");

let _sshTimeout = null;

function _setSshStatus(status, message) {
  sshConnectionStatus.value = status;
  sshConnectionMessage.value = message;
}

// ── Persistent terminal (survives navigation) ─────────────────────────────────

let _p = null; // { term, fit, info, alive, sshCommand, isProject, onData, onResize, unlistenOutput, unlistenExit, onAliveChange, onDimsChange }

function _destroy() {
  if (!_p) return;
  _p.onData?.dispose();
  _p.onResize?.dispose();
  _p.unlistenOutput?.();
  _p.unlistenExit?.();
  _p.term.dispose();
  _p = null;
}

function _handleSshOutput(out) {
  const low = out.toLowerCase();
  const status = sshConnectionStatus.value;

  // Only process output when a terminal-initiated connection is in progress.
  // Dashboard-initiated connections are handled by the global listener in dashboard.js.
  if (status !== "connecting") return;

  const success =
    low.includes("welcome") ||
    low.includes("last login") ||
    /[$#]\s*$/.test(low);

  if (success) {
    if (_sshTimeout) { clearTimeout(_sshTimeout); _sshTimeout = null; }
    _setSshStatus("connected", "SSH connection established");
    setSshConnected(true);
    sshConnecting.value = false;
    // Navigate to project path on the remote host
    if (_p?.projectPath) {
      setTimeout(() => {
        invoke("pty_write", { data: `cd ${_p.projectPath}\r` });
      }, 300);
    }
    setTimeout(() => {
      if (sshConnectionStatus.value === "connected") sshConnectionStatus.value = "idle";
    }, 3000);
    return;
  }

  const failure =
    low.includes("connection refused") ||
    low.includes("connection timed out") ||
    low.includes("connection closed") ||
    low.includes("connection reset") ||
    low.includes("permission denied") ||
    low.includes("authentication failed") ||
    low.includes("publickey") ||
    low.includes("no such identity") ||
    low.includes("identity file") ||
    low.includes("key_load_public") ||
    low.includes("host key verification failed") ||
    low.includes("no route to host") ||
    low.includes("network is unreachable") ||
    low.includes("could not resolve hostname") ||
    low.includes("operation timed out") ||
    low.includes("broken pipe");

  if (failure) {
    if (_sshTimeout) { clearTimeout(_sshTimeout); _sshTimeout = null; }
    _setSshStatus("failed", "SSH connection failed");
    setSshConnected(false);
    sshConnecting.value = false;
    setTimeout(() => { sshConnectionStatus.value = "idle"; }, 5000);
  }
}

async function _init(container, sshCommand, isProject, projectPath) {
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
  try { term.loadAddon(new WebglAddon()); } catch (_) {}
  fit.fit();

  const p = {
    term, fit,
    info: null, alive: true,
    sshCommand, isProject, projectPath,
    onData: null, onResize: null,
    unlistenOutput: null, unlistenExit: null,
    onAliveChange: null, onDimsChange: null,
  };

  p.unlistenOutput = await listen("pty-output", (event) => {
    const out = event.payload;
    term.write(out);
    if (sshCommand && isProject) _handleSshOutput(out);
  });

  p.unlistenExit = await listen("pty-exit", () => {
    p.alive = false;
    if (isProject) setSshConnected(false);
    p.onAliveChange?.(false);
    term.writeln("\r\n\x1b[2m[Process exited — press Restart to relaunch]\x1b[0m");
  });

  try {
    const ptyAlive = await invoke("is_terminal_alive").catch(() => false);

    if (!ptyAlive) {
      // No PTY running — spawn one
      if (sshCommand && isProject) {
        _setSshStatus("connecting", `Connecting to ${sshCommand}...`);
        if (_sshTimeout) clearTimeout(_sshTimeout);
        _sshTimeout = setTimeout(() => {
          if (sshConnectionStatus.value === "connecting") {
            _setSshStatus("failed", "SSH connection timed out");
            setSshConnected(false);
            sshConnecting.value = false;
            term.writeln("\r\n\x1b[31m[SSH connection timed out after 30 seconds]\x1b[0m");
            setTimeout(() => { sshConnectionStatus.value = "idle"; }, 5000);
          }
        }, 30000);
      }

      const args = { rows: term.rows, cols: term.cols };
      if (sshCommand) args.sshCommand = sshCommand;
      if (!sshCommand && projectPath) args.cwd = projectPath;
      await invoke("spawn_terminal", args);
      if (isProject && !sshCommand) setSshConnected(true);
      if (!sshCommand) sshConnecting.value = false;
    }
    // else: PTY already running (spawned by dashboard or a previous session) — just attach
  } catch (err) {
    term.writeln(`\r\n\x1b[31mFailed to spawn terminal: ${err}\x1b[0m`);
    if (sshCommand && isProject) {
      if (_sshTimeout) { clearTimeout(_sshTimeout); _sshTimeout = null; }
      _setSshStatus("failed", "Failed to spawn terminal");
      setSshConnected(false);
    }
    sshConnecting.value = false;
  }

  p.info = await invoke("get_terminal_info").catch(() => null);
  p.onData = term.onData((data) => invoke("pty_write", { data }));
  p.onResize = term.onResize(({ cols, rows }) => {
    p.onDimsChange?.({ cols, rows });
    invoke("pty_resize", { rows, cols });
  });

  return p;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useTerminal({ sshCommand = null, isProject = false, projectPath = null, enabled = true } = {}) {
  const containerRef = useRef(null);
  const [dims, setDims] = useState({ cols: 0, rows: 0 });
  const [alive, setAlive] = useState(true);
  const [info, setInfo] = useState(null);

  // Sync theme changes to live terminal
  useEffect(() => {
    if (_p?.term) _p.term.options.theme = getTermTheme();
  }, [theme.value]);

  // Terminal lifecycle
  useEffect(() => {
    if (!enabled) return;
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;

    (async () => {
      // Tear down if: SSH command changed, or a reconnect was triggered (key mismatch)
      const needsReinit = _p && (
        _p.sshCommand !== sshCommand ||
        _p._termKey !== terminalKey.value
      );
      if (needsReinit) {
        await invoke("kill_terminal");
        _destroy();
        container.innerHTML = "";
      }

      if (!_p) {
        const p = await _init(container, sshCommand, isProject, projectPath);
        _p = p;
        if (_p) _p._termKey = terminalKey.value;
        if (cancelled) return;
      } else {
        // Reattach existing terminal element to this container
        if (_p.term.element?.parentElement !== container) {
          container.appendChild(_p.term.element);
        }
        _p.fit.fit();
      }

      if (!cancelled) {
        _p.onAliveChange = (v) => setAlive(v);
        _p.onDimsChange = (d) => setDims(d);
        setInfo(_p.info);
        setAlive(_p.alive);
        setDims({ cols: _p.term.cols, rows: _p.term.rows });
        _p.term.focus();
      }
    })();

    const obs = new ResizeObserver(() => { if (_p?.fit) _p.fit.fit(); });
    obs.observe(container);

    return () => {
      cancelled = true;
      obs.disconnect();
      if (_p) {
        _p.onAliveChange = null;
        _p.onDimsChange = null;
      }
    };
  }, [sshCommand, enabled, terminalKey.value]);

  async function clear() {
    _p?.term?.clear();
    _p?.term?.focus();
  }

  async function kill() {
    if (_sshTimeout) { clearTimeout(_sshTimeout); _sshTimeout = null; }
    await invoke("kill_terminal");
    if (_p) {
      if (_p.isProject) setSshConnected(false);
      _p.alive = false;
      _p.term.writeln("\r\n\x1b[2m[Terminal killed]\x1b[0m");
      _destroy();
    }
    setAlive(false);
    _setSshStatus("idle", "");
    sshConnecting.value = false;
  }

  async function restart() {
    if (_sshTimeout) { clearTimeout(_sshTimeout); _sshTimeout = null; }
    _setSshStatus("idle", "");
    sshConnecting.value = false;
    await invoke("kill_terminal");
    _destroy();
    const container = containerRef.current;
    if (!container) return;
    container.innerHTML = "";
    const p = await _init(container, sshCommand, isProject, projectPath);
    _p = p;
    p.onAliveChange = (v) => setAlive(v);
    p.onDimsChange = (d) => setDims(d);
    setInfo(p.info);
    setAlive(p.alive);
    setDims({ cols: p.term.cols, rows: p.term.rows });
    p.term.focus();
  }

  function focus() {
    _p?.term?.focus();
  }

  return { containerRef, dims, alive, info, clear, kill, restart, focus };
}
