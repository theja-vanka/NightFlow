/**
 * Confusion matrix heatmap table.
 * @param {{ matrix: number[][], labels: string[] }} props
 */
export function ConfusionMatrix({ matrix, labels }) {
  if (!matrix || matrix.length === 0) return null;

  const maxVal = Math.max(...matrix.flat());

  function cellColor(val) {
    const intensity = maxVal > 0 ? val / maxVal : 0;
    // Blue intensity scale
    return `rgba(91, 141, 239, ${0.1 + intensity * 0.7})`;
  }

  // Calculate row totals for percentage display
  const rowTotals = matrix.map((row) => row.reduce((a, b) => a + b, 0));

  return (
    <div class="confusion-matrix-wrap">
      <table class="confusion-matrix-table">
        <thead>
          <tr>
            <th></th>
            {labels.map((l) => (
              <th key={l}>{l}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.map((row, i) => (
            <tr key={i}>
              <td class="confusion-matrix-label-col">{labels[i]}</td>
              {row.map((val, j) => {
                const pct = rowTotals[i] > 0 ? ((val / rowTotals[i]) * 100).toFixed(0) : 0;
                return (
                  <td
                    key={j}
                    style={{ background: cellColor(val) }}
                    title={`${val} (${pct}%)`}
                  >
                    {val}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
