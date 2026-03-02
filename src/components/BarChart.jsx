/**
 * Horizontal bar chart for displaying singular metric values (e.g. test results).
 *
 * Props:
 *   items: [{ label: string, value: number }]
 *   formatValue: (v) => string  — optional formatter (default: smart rounding)
 */
export function BarChart({ items, formatValue }) {
  if (!items || !items.length) return <div class="chart-empty">No data</div>;

  const fmt = formatValue || ((v) => {
    if (v == null) return "—";
    if (Math.abs(v) < 0.001 && v !== 0) return v.toExponential(2);
    if (Math.abs(v) < 1) return v.toFixed(4);
    return v.toFixed(2);
  });

  const maxVal = Math.max(...items.map((d) => Math.abs(d.value)), 1e-9);

  // Pick bar colors from chart palette
  const colors = [
    "var(--chart-line-1)",
    "var(--chart-line-4)",
    "var(--chart-line-5)",
    "var(--chart-line-2)",
    "var(--chart-line-3)",
    "var(--chart-line-7)",
    "var(--chart-line-6)",
    "var(--chart-line-8)",
  ];

  return (
    <div class="bar-chart">
      {items.map((d, i) => {
        const pct = Math.min((Math.abs(d.value) / maxVal) * 100, 100);
        const color = colors[i % colors.length];
        return (
          <div class="bar-chart-row" key={d.label}>
            <span class="bar-chart-label">{d.label}</span>
            <div class="bar-chart-track">
              <div
                class="bar-chart-fill"
                style={{
                  width: `${pct}%`,
                  background: color,
                }}
              />
            </div>
            <span class="bar-chart-value">{fmt(d.value)}</span>
          </div>
        );
      })}
    </div>
  );
}
