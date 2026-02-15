import { useRef, useEffect, useState } from "preact/hooks";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { theme } from "../state/theme.js";

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

export function TerminalView() {
  const containerRef = useRef(null);
  const termRef = useRef(null);
  const fitRef = useRef(null);
  const cleanupRef = useRef(null);
  const [dims, setDims] = useState({ cols: 0, rows: 0 });
  const [alive, setAlive] = useState(true);
  const [info, setInfo] = useState(null);

  async function setupTerminal() {
    if (!containerRef.current) return;

    if (cleanupRef.current) {
      cleanupRef.current();
      cleanupRef.current = null;
    }

    // Fetch shell/user/host info from backend
    try {
      const termInfo = await invoke("get_terminal_info");
      setInfo(termInfo);
    } catch (_) {}

    const term = new Terminal({
      fontSize: 13,
      fontFamily: '"Hack Nerd Font Mono", "SF Mono", "Fira Code", "Cascadia Code", "Menlo", "Consolas", monospace',
      cursorBlink: true,
      cursorStyle: "bar",
      scrollback: 10000,
      allowProposedApi: true,
      macOptionIsMeta: true,
      theme: getTermTheme(),
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(new WebLinksAddon());
    term.open(containerRef.current);

    try { term.loadAddon(new WebglAddon()); } catch (_) {}

    fitAddon.fit();
    termRef.current = term;
    fitRef.current = fitAddon;
    setDims({ cols: term.cols, rows: term.rows });
    setAlive(true);

    const unlistenOutput = await listen("pty-output", (event) => {
      term.write(event.payload);
    });

    const unlistenExit = await listen("pty-exit", () => {
      setAlive(false);
      term.writeln("\r\n\x1b[2m[Process exited — press Restart to relaunch]\x1b[0m");
    });

    try {
      await invoke("spawn_terminal", { rows: term.rows, cols: term.cols });
    } catch (err) {
      term.writeln(`\r\n\x1b[31mFailed to spawn terminal: ${err}\x1b[0m`);
    }

    const onData = term.onData((data) => {
      invoke("pty_write", { data });
    });

    const onResize = term.onResize(({ cols, rows }) => {
      setDims({ cols, rows });
      invoke("pty_resize", { rows, cols });
    });

    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
    });
    resizeObserver.observe(containerRef.current);

    term.focus();

    cleanupRef.current = () => {
      onData.dispose();
      onResize.dispose();
      resizeObserver.disconnect();
      unlistenOutput();
      unlistenExit();
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
  }

  useEffect(() => {
    setupTerminal();
    return () => {
      if (cleanupRef.current) cleanupRef.current();
    };
  }, []);

  // Update xterm theme when app theme changes
  useEffect(() => {
    const currentTheme = theme.value;
    if (termRef.current) {
      termRef.current.options.theme = getTermTheme();
    }
  }, [theme.value]);

  function handleClear() {
    if (termRef.current) {
      termRef.current.clear();
      termRef.current.focus();
    }
  }

  async function handleKill() {
    await invoke("kill_terminal");
    setAlive(false);
    if (termRef.current) {
      termRef.current.writeln("\r\n\x1b[2m[Terminal killed]\x1b[0m");
    }
  }

  async function handleRestart() {
    await invoke("kill_terminal");
    if (cleanupRef.current) {
      cleanupRef.current();
      cleanupRef.current = null;
    }
    setTimeout(() => setupTerminal(), 100);
  }

  function handleFocus() {
    if (termRef.current) termRef.current.focus();
  }

  return (
    <div class="terminal-view">
      <div class="terminal-toolbar">
        <div class="terminal-toolbar-left">
          <span class="terminal-toolbar-shell">{info?.shell || "shell"}</span>
          <span class="terminal-toolbar-sep" />
          {info?.user && info?.hostname && (
            <span class="terminal-toolbar-userhost">
              {info.user}@{info.hostname}
            </span>
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
