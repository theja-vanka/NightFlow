export function SummaryCard({ label, value, icon }) {
  return (
    <div class="summary-card">
      <div
        class="summary-card-icon"
        dangerouslySetInnerHTML={{ __html: icon }}
      />
      <div class="summary-card-content">
        <div class="summary-card-value">{value}</div>
        <div class="summary-card-label">{label}</div>
      </div>
    </div>
  );
}
