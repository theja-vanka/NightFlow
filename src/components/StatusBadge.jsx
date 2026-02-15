const styles = {
  completed: "badge-filled",
  running: "badge-outline badge-pulse",
  failed: "badge-outline badge-dim",
  queued: "badge-ghost",
};

export function StatusBadge({ status }) {
  return (
    <span class={`status-badge ${styles[status] || "badge-ghost"}`}>
      {status}
    </span>
  );
}
