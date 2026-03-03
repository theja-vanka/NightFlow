import { useState } from "preact/hooks";

const METRIC_KEYS = ["precision", "recall", "f1"];
const METRIC_LABELS = { precision: "Precision", recall: "Recall", f1: "F1" };
const BAR_COLORS = {
  precision: "var(--chart-line-1)",
  recall: "var(--chart-line-2)",
  f1: "var(--chart-line-3)",
};

const SORT_OPTIONS = ["class", "precision", "recall", "f1"];
const SORT_LABELS = { class: "Class", precision: "Precision", recall: "Recall", f1: "F1" };

/**
 * Per-class precision / recall / F1 bar chart with all-metrics display.
 * Items default to class-index order; user can sort by any metric.
 * @param {{ metrics: { class_index?: number, label: string, precision: number, recall: number, f1: number }[] }} props
 */
export function PerClassMetrics({ metrics }) {
  const [sortBy, setSortBy] = useState("class");

  if (!metrics || metrics.length === 0) return null;

  const sorted = [...metrics].sort((a, b) => {
    if (sortBy === "class") {
      // Sort by class_index if available, otherwise by label naturally
      const ai = a.class_index ?? parseInt(a.label, 10);
      const bi = b.class_index ?? parseInt(b.label, 10);
      if (!isNaN(ai) && !isNaN(bi)) return ai - bi;
      return (a.label || "").localeCompare(b.label || "");
    }
    return (b[sortBy] ?? 0) - (a[sortBy] ?? 0);
  });

  // Determine which metric to use for the bar
  const barMetric = sortBy === "class" ? "f1" : sortBy;

  return (
    <div class="per-class-metrics">
      <div class="per-class-header">
        <span class="per-class-header-label">Sort by</span>
        <div class="per-class-sort-group">
          {SORT_OPTIONS.map((key) => (
            <button
              key={key}
              class={`per-class-sort-btn${sortBy === key ? " active" : ""}`}
              onClick={() => setSortBy(key)}
              style={sortBy === key && key !== "class" ? { borderColor: BAR_COLORS[key], color: BAR_COLORS[key] } : {}}
            >
              {SORT_LABELS[key]}
            </button>
          ))}
        </div>
      </div>
      <div class="per-class-rows">
        {sorted.map((item, idx) => (
          <div key={item.label} class="per-class-row">
            <span class="per-class-rank">#{idx + 1}</span>
            <span class="per-class-label" title={item.label}>
              {item.label}
            </span>
            <div class="per-class-bar-track">
              <div
                class="per-class-bar-fill"
                style={{
                  width: `${((item[barMetric] ?? 0) * 100).toFixed(0)}%`,
                  background: BAR_COLORS[barMetric],
                }}
              />
            </div>
            <div class="per-class-values">
              {METRIC_KEYS.map((key) => (
                <span
                  key={key}
                  class={`per-class-chip${sortBy === key ? " per-class-chip-active" : ""}`}
                  title={METRIC_LABELS[key]}
                  style={sortBy === key ? { color: BAR_COLORS[key] } : {}}
                >
                  <span class="per-class-chip-label">{key === "f1" ? "F1" : key.charAt(0).toUpperCase()}</span>
                  {((item[key] ?? 0) * 100).toFixed(1)}%
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
