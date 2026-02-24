const styles = {
  completed: "badge-completed",
  running: "badge-running badge-pulse",
  failed: "badge-failed",
  queued: "badge-ghost",
};

export function StatusBadge({ status }) {
  return (
    <span class={`status-badge ${styles[status] || "badge-ghost"}`}>
      {status}
    </span>
  );
}
