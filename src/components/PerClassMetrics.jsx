import { useState } from "preact/hooks";

const BAR_COLORS = [
  "var(--chart-line-1)",
  "var(--chart-line-2)",
  "var(--chart-line-3)",
];

/**
 * Per-class precision / recall / F1 bar chart.
 * @param {{ metrics: { label: string, precision: number, recall: number, f1: number }[] }} props
 */
export function PerClassMetrics({ metrics }) {
  const [sortBy, setSortBy] = useState("f1");

  if (!metrics || metrics.length === 0) return null;

  const sorted = [...metrics].sort((a, b) => (b[sortBy] ?? 0) - (a[sortBy] ?? 0));

  return (
    <div class="per-class-metrics">
      <div class="per-class-header">
        {["precision", "recall", "f1"].map((key) => (
          <button
            key={key}
            class={`per-class-sort-btn${sortBy === key ? " active" : ""}`}
            onClick={() => setSortBy(key)}
          >
            {key === "f1" ? "F1" : key.charAt(0).toUpperCase() + key.slice(1)}
          </button>
        ))}
      </div>
      {sorted.map((item) => (
        <div key={item.label} class="per-class-row">
          <span class="per-class-label" title={item.label}>
            {item.label}
          </span>
          <div class="per-class-bar-track">
            <div
              class="per-class-bar-fill"
              style={{
                width: `${((item[sortBy] ?? 0) * 100).toFixed(0)}%`,
                background: BAR_COLORS[
                  sortBy === "precision" ? 0 : sortBy === "recall" ? 1 : 2
                ],
              }}
            />
          </div>
          <span class="per-class-value">
            {((item[sortBy] ?? 0) * 100).toFixed(1)}%
          </span>
        </div>
      ))}
    </div>
  );
}
