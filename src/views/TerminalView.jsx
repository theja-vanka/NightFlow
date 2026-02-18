import { useTerminal } from "../hooks/useTerminal.js";
import { currentProject } from "../state/projects.js";
import { sshConnected, sshConnecting } from "../state/dashboard.js";

const killIcon = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
const restartIcon = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>`;
const clearIcon = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z"/><line x1="18" y1="9" x2="12" y2="15"/><line x1="12" y1="9" x2="18" y2="15"/></svg>`;

export function TerminalView() {
  const project = currentProject.value;
  const rawSsh = project?.sshCommand;
  const projectSshCommand =
    rawSsh && rawSsh.trim() && rawSsh.trim().toLowerCase() !== "localhost"
      ? rawSsh.trim()
      : null;
  const hasProject = !!project;
  const isSSH = !!projectSshCommand;
  const projectId = project?.id ?? null;

  const enabled = !isSSH || sshConnected.value || sshConnecting.value;
  const showTerminal = !isSSH || sshConnected.value;

  const { containerRef, dims, alive, info, sshStatus, sshMessage, clear, kill, restart, focus } =
    useTerminal({
      projectId,
      sshCommand: projectSshCommand,
      isProject: hasProject,
      projectPath: project?.projectPath ?? null,
      enabled,
    });

  const showOverlay = isSSH && sshStatus !== "idle";
  const isConnecting = sshStatus === "connecting";
  const isConnected = sshStatus === "connected";
  const isFailed = sshStatus === "failed";

  return (
    <div class="terminal-view">
      {showOverlay && (
        <div class="terminal-connection-overlay">
          <div class="terminal-connection-status">
            {isConnecting && (
              <>
                <div class="terminal-connection-spinner" />
                <div class="terminal-connection-text">{sshMessage}</div>
                <div class="terminal-connection-progress">
                  <div class="terminal-connection-progress-bar connecting" />
                </div>
              </>
            )}
            {isConnected && (
              <>
                <div class="terminal-connection-icon success">✓</div>
                <div class="terminal-connection-text success">{sshMessage}</div>
                <div class="terminal-connection-progress">
                  <div class="terminal-connection-progress-bar success" />
                </div>
              </>
            )}
            {isFailed && (
              <>
                <div class="terminal-connection-icon failed">✕</div>
                <div class="terminal-connection-text failed">{sshMessage}</div>
                <div class="terminal-connection-progress">
                  <div class="terminal-connection-progress-bar failed" />
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {showTerminal && (
        <>
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
              <button class="terminal-toolbar-btn" onClick={clear} title="Clear scrollback">
                <span dangerouslySetInnerHTML={{ __html: clearIcon }} />
              </button>
              {alive ? (
                <button class="terminal-toolbar-btn terminal-toolbar-btn-kill" onClick={kill} title="Kill terminal">
                  <span dangerouslySetInnerHTML={{ __html: killIcon }} />
                </button>
              ) : (
                <button class="terminal-toolbar-btn terminal-toolbar-btn-restart" onClick={restart} title="Restart terminal">
                  <span dangerouslySetInnerHTML={{ __html: restartIcon }} />
                </button>
              )}
            </div>
          </div>
          <div class="terminal-xterm-container" ref={containerRef} onClick={focus} />
        </>
      )}
    </div>
  );
}
