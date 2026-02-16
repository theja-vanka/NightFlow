import { useRef, useEffect, useState } from "preact/hooks";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { theme } from "../state/theme.js";
import { currentProject } from "../state/projects.js";
import { setSshConnected, shouldAutoConnect, sshConnecting } from "../state/dashboard.js";

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

function getTermTheme() {
  return theme.value === "dark" ? darkTheme : lightTheme;
}

const killIcon = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
const restartIcon = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>`;
const clearIcon = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z"/><line x1="18" y1="9" x2="12" y2="15"/><line x1="12" y1="9" x2="18" y2="15"/></svg>`;

// ── Persistent module-level state ──
// The terminal instance, addons, and PTY event listeners survive
// across page navigations so scrollback and session are preserved.
let persistent = null; // { term, fit, onData, onResize, unlistenOutput, unlistenExit, info, alive, sshCommand, isProjectConnection }

async function createPersistentTerminal(container, sshCommand = null, isProjectConnection = false, autoConnect = false) {

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

  const state = {
    term,
    fit,
    info: null,
    alive: true,
    sshCommand,
    isProjectConnection,
    onData: null,
    onResize: null,
    unlistenOutput: null,
    unlistenExit: null,
    // Callbacks the component sets so persistent listeners can update React state
    onAliveChange: null,
    onDimsChange: null,
  };

  state.unlistenOutput = await listen("pty-output", (event) => {
    term.write(event.payload);
  });

  state.unlistenExit = await listen("pty-exit", () => {
    state.alive = false;
    if (isProjectConnection) setSshConnected(false);
    if (state.onAliveChange) state.onAliveChange(false);
    term.writeln("\r\n\x1b[2m[Process exited — press Restart to relaunch]\x1b[0m");
  });

  try {
    // Check if terminal info exists (PTY already spawned)
    const existingInfo = await invoke("get_terminal_info").catch(() => null);

    if (!existingInfo) {
      // No existing PTY, spawn new one
      const spawnArgs = { rows: term.rows, cols: term.cols };
      if (sshCommand) spawnArgs.sshCommand = sshCommand;
      await invoke("spawn_terminal", spawnArgs);
      // Only set connected if user explicitly requested connection (autoConnect)
      // OR if this is a remote SSH connection (not localhost)
      if (isProjectConnection && (autoConnect || sshCommand)) {
        setSshConnected(true);
      }
    } else {
      // PTY already exists (spawned in background), just connect UI
      term.writeln("\r\n\x1b[32m[Connected to existing session]\x1b[0m\r\n");
    }

    // Clear connecting state on success
    sshConnecting.value = false;
  } catch (err) {
    term.writeln(`\r\n\x1b[31mFailed to spawn terminal: ${err}\x1b[0m`);
    // Clear connecting state on error
    sshConnecting.value = false;
  }

  // Fetch terminal info after spawn (includes SSH state)
  state.info = await invoke("get_terminal_info").catch(() => null);

  state.onData = term.onData((data) => {
    invoke("pty_write", { data });
  });

  state.onResize = term.onResize(({ cols, rows }) => {
    if (state.onDimsChange) state.onDimsChange({ cols, rows });
    invoke("pty_resize", { rows, cols });
  });

  persistent = state;
  return state;
}

function destroyPersistentTerminal() {
  if (!persistent) return;
  const s = persistent;
  if (s.onData) s.onData.dispose();
  if (s.onResize) s.onResize.dispose();
  if (s.unlistenOutput) s.unlistenOutput();
  if (s.unlistenExit) s.unlistenExit();
  s.term.dispose();
  persistent = null;
}

export function TerminalView() {
  const containerRef = useRef(null);
  const resizeObRef = useRef(null);
  const [dims, setDims] = useState({ cols: 0, rows: 0 });
  const [alive, setAlive] = useState(true);
  const [info, setInfo] = useState(null);

  // Get the current project's SSH command — normalize empty/missing/localhost to null (= local terminal)
  const rawSsh = currentProject.value?.sshCommand;
  const projectSshCommand = rawSsh && rawSsh.trim() && rawSsh.trim().toLowerCase() !== "localhost" ? rawSsh.trim() : null;
  const hasProject = !!currentProject.value;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;

    (async () => {
      // If persistent terminal exists but SSH command changed, restart it
      const prevSsh = persistent ? (persistent.sshCommand ?? null) : null;
      if (persistent && prevSsh !== projectSshCommand) {
        await invoke("kill_terminal");
        destroyPersistentTerminal();
        container.innerHTML = "";
      }

      if (!persistent) {
        // First time or after restart — create the terminal
        const autoConnect = shouldAutoConnect.value;
        const state = await createPersistentTerminal(container, projectSshCommand, hasProject, autoConnect);
        if (cancelled) return;
        setInfo(state.info);
        setAlive(state.alive);
        setDims({ cols: state.term.cols, rows: state.term.rows });

        // Clear auto-connect flag after successful spawn
        if (autoConnect) {
          shouldAutoConnect.value = false;
        }
      } else {
        // Reattach existing terminal to this container
        const termEl = persistent.term.element;
        if (termEl && termEl.parentElement !== container) {
          container.appendChild(termEl);
        }
        persistent.fit.fit();
        setInfo(persistent.info);
        setAlive(persistent.alive);
        setDims({ cols: persistent.term.cols, rows: persistent.term.rows });
      }

      // Wire up state callbacks so persistent listeners update this component
      persistent.onAliveChange = (v) => { if (!cancelled) setAlive(v); };
      persistent.onDimsChange = (d) => { if (!cancelled) setDims(d); };

      persistent.term.focus();
    })();

    // ResizeObserver — local to this mount
    const obs = new ResizeObserver(() => {
      if (persistent?.fit) persistent.fit.fit();
    });
    obs.observe(container);
    resizeObRef.current = obs;

    return () => {
      cancelled = true;
      obs.disconnect();
      // Disconnect component callbacks but do NOT destroy the terminal
      if (persistent) {
        persistent.onAliveChange = null;
        persistent.onDimsChange = null;
      }
    };
  }, [projectSshCommand]);

  // Update xterm theme when app theme changes
  useEffect(() => {
    const _t = theme.value; // subscribe
    if (persistent?.term) {
      persistent.term.options.theme = getTermTheme();
    }
  }, [theme.value]);

  function handleClear() {
    if (persistent?.term) {
      persistent.term.clear();
      persistent.term.focus();
    }
  }

  async function handleKill() {
    await invoke("kill_terminal");
    setAlive(false);
    if (persistent) {
      if (persistent.isProjectConnection) setSshConnected(false);
      persistent.alive = false;
      persistent.term.writeln("\r\n\x1b[2m[Terminal killed]\x1b[0m");
      // Destroy persistent terminal to ensure fresh start on reconnect
      destroyPersistentTerminal();
    }
  }

  async function handleRestart() {
    await invoke("kill_terminal");
    destroyPersistentTerminal();
    const container = containerRef.current;
    if (!container) return;
    // Clear stale DOM
    container.innerHTML = "";
    const autoConnect = shouldAutoConnect.value;
    const state = await createPersistentTerminal(container, projectSshCommand, hasProject, autoConnect);
    setInfo(state.info);
    setAlive(state.alive);
    setDims({ cols: state.term.cols, rows: state.term.rows });
    state.onAliveChange = (v) => setAlive(v);
    state.onDimsChange = (d) => setDims(d);
    state.term.focus();
  }

  function handleFocus() {
    if (persistent?.term) persistent.term.focus();
  }

  return (
    <div class="terminal-view">
      <div class="terminal-toolbar">
        <div class="terminal-toolbar-left">
          {info?.isSSH ? (
            <>
              <span class="terminal-toolbar-shell">ssh</span>
              <span class="terminal-toolbar-sep" />
              <span class="terminal-toolbar-userhost">{info.sshTarget}</span>
            </>
          ) : (
            <>
              <span class="terminal-toolbar-shell">{info?.shell || "shell"}</span>
              <span class="terminal-toolbar-sep" />
              {info?.user && info?.hostname && (
                <span class="terminal-toolbar-userhost">
                  {info.user}@{info.hostname}
                </span>
              )}
            </>
          )}
          <span class={`terminal-toolbar-status ${alive ? "alive" : "dead"}`}>
            {alive ? "Running" : "Exited"}
          </span>
        </div>
        <div class="terminal-toolbar-right">
          <span class="terminal-toolbar-dims">{dims.cols} x {dims.rows}</span>
          <span class="terminal-toolbar-sep" />
          <button class="terminal-toolbar-btn" onClick={handleClear} title="Clear scrollback">
            <span dangerouslySetInnerHTML={{ __html: clearIcon }} />
          </button>
          {alive ? (
            <button class="terminal-toolbar-btn terminal-toolbar-btn-kill" onClick={handleKill} title="Kill terminal">
              <span dangerouslySetInnerHTML={{ __html: killIcon }} />
            </button>
          ) : (
            <button class="terminal-toolbar-btn terminal-toolbar-btn-restart" onClick={handleRestart} title="Restart terminal">
              <span dangerouslySetInnerHTML={{ __html: restartIcon }} />
            </button>
          )}
        </div>
      </div>
      <div class="terminal-xterm-container" ref={containerRef} onClick={handleFocus} />
    </div>
  );
}
