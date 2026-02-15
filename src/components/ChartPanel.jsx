export function ChartPanel({ title, children }) {
  return (
    <div class="chart-panel">
      <div class="chart-panel-header">{title}</div>
      <div class="chart-panel-body">{children}</div>
    </div>
  );
}
