import { SummaryCard } from "../components/SummaryCard.jsx";
import {
  stats, sshInfo, toggleSshConnection, sshConnecting, sshConnected,
  sshConnectionError, clearSshConnectionError,
  dashboardSynced, dashboardSyncing, syncDashboard,
} from "../state/dashboard.js";

function SshStatusBanner() {
  const info = sshInfo.value;
  const connecting = sshConnecting.value;
  if (!info) return null;

  const elapsed = info.connectedAt
    ? Math.floor((Date.now() - new Date(info.connectedAt).getTime()) / 60000)
    : 0;
  const uptime = elapsed >= 60
    ? `${Math.floor(elapsed / 60)}h ${elapsed % 60}m`
    : `${elapsed}m`;

  const bannerClass = `ssh-status-banner ${
    connecting ? "ssh-connecting" : info.connected ? "ssh-connected" : "ssh-disconnected"
  }`;
  const statusLabel = connecting ? "Connecting..." : info.connected ? "Connected" : "Disconnected";
  const buttonLabel = connecting ? "Connecting..." : info.connected ? "Disconnect" : "Connect";

  return (
    <div class={bannerClass}>
      {connecting ? (
        <div class="ssh-status-spinner" />
      ) : (
        <div class="ssh-status-dot" />
      )}
      <div class="ssh-status-info">
        <span class="ssh-status-label">{statusLabel}</span>
        <span class="ssh-status-host">{info.host}</span>
      </div>
      {info.connected && !connecting && (
        <span class="ssh-status-uptime">Uptime: {uptime}</span>
      )}
      <button
        class={`ssh-toggle-btn ${info.connected ? "ssh-toggle-disconnect" : ""}`}
        onClick={toggleSshConnection}
        disabled={connecting}
      >
        {connecting && (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="ssh-btn-spinner">
            <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
          </svg>
        )}
        {buttonLabel}
      </button>
    </div>
  );
}

const icons = {
  total: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20V10"/><path d="M18 20V4"/><path d="M6 20v-4"/></svg>`,
  running: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>`,
  accuracy: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/></svg>`,
  loss: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
};

function SshErrorModal() {
  const error = sshConnectionError.value;
  if (!error) return null;

  return (
    <div class="modal-overlay" onClick={clearSshConnectionError}>
      <div class="modal-dialog ssh-error-modal" onClick={(e) => e.stopPropagation()}>
        <div class="modal-header">
          <h3 class="modal-title">SSH Connection Failed</h3>
          <button class="modal-close-btn" onClick={clearSshConnectionError}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div class="modal-body">
          <div class="ssh-error-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
          </div>
          <p class="ssh-error-message">{error.message}</p>
        </div>
        <div class="modal-footer">
          <button class="btn btn-primary" onClick={clearSshConnectionError}>Close</button>
        </div>
      </div>
    </div>
  );
}

function SyncScreen() {
  const syncing = dashboardSyncing.value;
  return (
    <div class="dashboard-sync-screen">
      <div class="dashboard-sync-card">
        <div class="dashboard-sync-icon">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M23 4v6h-6"/>
            <path d="M1 20v-6h6"/>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
          </svg>
        </div>
        <h2 class="dashboard-sync-title">Sync Project Data</h2>
        <p class="dashboard-sync-desc">
          Fetch the latest runs, metrics, and experiment history from the connected machine.
        </p>
        <button class="dashboard-sync-btn" onClick={syncDashboard} disabled={syncing}>
          {syncing ? (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="ssh-btn-spinner">
                <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
              </svg>
              Syncing…
            </>
          ) : "Sync"}
        </button>
      </div>
    </div>
  );
}

export function DashboardView() {
  const s = stats.value;
  const connected = sshConnected.value;
  const synced = dashboardSynced.value;

  return (
    <div class="dashboard-view">
      <SshStatusBanner />
      {!connected ? null : !synced ? (
        <SyncScreen />
      ) : (
        <div class="summary-grid">
          <SummaryCard label="Total Runs" value={s.totalRuns} icon={icons.total} />
          <SummaryCard label="Running" value={s.running} icon={icons.running} />
          <SummaryCard label="Best Accuracy" value={s.bestAcc != null ? (s.bestAcc * 100).toFixed(1) + "%" : "—"} icon={icons.accuracy} />
          <SummaryCard label="Avg Val Loss" value={s.avgLoss != null ? s.avgLoss.toFixed(4) : "—"} icon={icons.loss} />
        </div>
      )}
      <SshErrorModal />
    </div>
  );
}
