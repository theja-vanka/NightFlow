import { h } from "preact";
import { useEffect, useRef } from "preact/hooks";
import { syncLogs, dashboardSyncing } from "../state/dashboard.js";
import "../style.css";

export default function SyncLogsPanel() {
  const logsContainerRef = useRef(null);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (logsContainerRef.current) {
      setTimeout(() => {
        logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
      }, 0);
    }
  }, [syncLogs.value]);

  const getLevelColor = (type) => {
    switch (type) {
      case "success":
        return "#10b981";
      case "warning":
        return "#f59e0b";
      case "error":
        return "#ef4444";
      case "info":
      default:
        return "#6b7280";
    }
  };

  const getLevelIcon = (type) => {
    switch (type) {
      case "success":
        return "✓";
      case "warning":
        return "⚠";
      case "error":
        return "✕";
      case "info":
      default:
        return "ℹ";
    }
  };

  return (
    <div class="sync-logs-panel">
      <div class="sync-logs-header">
        <h3 class="sync-logs-title">Sync Progress</h3>
        {dashboardSyncing.value && (
          <div class="sync-spinner">
            <div class="spinner-dot"></div>
            <span>Syncing...</span>
          </div>
        )}
      </div>
      <div ref={logsContainerRef} class="sync-logs-container">
        {syncLogs.value.length === 0 ? (
          <div class="sync-logs-empty">Click sync to start</div>
        ) : (
          syncLogs.value.map((log, idx) => (
            <div key={idx} class={`sync-log-entry sync-log-${log.type}`}>
              <span
                class="sync-log-icon"
                style={{ color: getLevelColor(log.type) }}
              >
                {getLevelIcon(log.type)}
              </span>
              <span class="sync-log-timestamp">{log.timestamp}</span>
              <span class="sync-log-message">{log.message}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
