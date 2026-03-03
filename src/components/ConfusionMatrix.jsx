/**
 * Confusion matrix heatmap table with axis labels and class names.
 * @param {{ matrix: number[][], labels: string[] }} props
 */
export function ConfusionMatrix({ matrix, labels }) {
  if (!matrix || matrix.length === 0) return null;

  const maxVal = Math.max(...matrix.flat());

  function cellColor(val) {
    const intensity = maxVal > 0 ? val / maxVal : 0;
    // Blue intensity scale
    return `rgba(91, 141, 239, ${0.08 + intensity * 0.72})`;
  }

  function diagColor(val) {
    const intensity = maxVal > 0 ? val / maxVal : 0;
    return `rgba(80, 200, 120, ${0.12 + intensity * 0.68})`;
  }

  // Calculate row totals for percentage display
  const rowTotals = matrix.map((row) => row.reduce((a, b) => a + b, 0));

  return (
    <div class="confusion-matrix-wrap">
      <div class="confusion-matrix-axis-label confusion-matrix-axis-top">Predicted</div>
      <div class="confusion-matrix-layout">
        <div class="confusion-matrix-axis-label confusion-matrix-axis-left">Actual</div>
        <table class="confusion-matrix-table">
          <thead>
            <tr>
              <th class="confusion-matrix-corner"></th>
              {labels.map((l) => (
                <th key={l} title={l}>
                  <span class="confusion-matrix-col-label">{l}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.map((row, i) => (
              <tr key={i}>
                <td class="confusion-matrix-label-col" title={labels[i]}>
                  {labels[i]}
                </td>
                {row.map((val, j) => {
                  const pct = rowTotals[i] > 0 ? ((val / rowTotals[i]) * 100).toFixed(0) : 0;
                  const isDiag = i === j;
                  return (
                    <td
                      key={j}
                      class={`confusion-matrix-cell${isDiag ? " confusion-matrix-diag" : ""}`}
                      style={{ background: isDiag ? diagColor(val) : cellColor(val) }}
                      title={`${labels[i]} → ${labels[j]}: ${val} (${pct}%)`}
                    >
                      <span class="confusion-matrix-cell-count">{val}</span>
                      <span class="confusion-matrix-cell-pct">{pct}%</span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
