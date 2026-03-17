/**
 * Confusion matrix heatmap with rotated column headers.
 * Uses CSS Grid so headers and cells share exact column tracks.
 * @param {{ matrix: number[][], labels: string[] }} props
 */
export function ConfusionMatrix({ matrix, labels }) {
  if (!matrix || matrix.length === 0) return null;

  const n = matrix.length;
  const maxVal = Math.max(...matrix.flat());

  function cellBg(val, isDiag) {
    const t = maxVal > 0 ? val / maxVal : 0;
    if (isDiag) return `rgba(80, 200, 120, ${0.10 + t * 0.65})`;
    return `rgba(91, 141, 239, ${0.06 + t * 0.64})`;
  }

  const rowTotals = matrix.map((row) => row.reduce((a, b) => a + b, 0));

  // Compute header height from longest label so rotated text never overlaps cells.
  // Approximate char width ~6.5px at 0.7rem, rotation 55 deg.
  const maxLabelLen = Math.max(...labels.map((l) => l.length));
  const charWidth = 6.5;
  const angle = 55;
  const rad = (angle * Math.PI) / 180;
  const headerHeight = Math.ceil(maxLabelLen * charWidth * Math.sin(rad)) + 16;

  const gridCols = `18px auto repeat(${n}, 52px)`;
  const gridRows = `${headerHeight}px repeat(${n}, 48px) auto`;

  return (
    <div class="cm" style={{ gridTemplateColumns: gridCols, gridTemplateRows: gridRows }}>
      {/* Column headers — row 1, starting at col 3 */}
      {labels.map((l, j) => (
        <div
          key={`ch-${j}`}
          class="cm-col-header"
          style={{ gridRow: 1, gridColumn: j + 3 }}
        >
          <span class="cm-col-text" title={l}>{l}</span>
        </div>
      ))}

      {/* Actual axis label — col 1, spanning all data rows */}
      <div
        class="cm-axis-left"
        style={{ gridRow: `2 / ${n + 2}`, gridColumn: 1 }}
      >
        Actual
      </div>

      {/* Data rows */}
      {matrix.map((row, i) => (
        <>
          {/* Row label */}
          <div
            key={`rl-${i}`}
            class="cm-row-label"
            style={{ gridRow: i + 2, gridColumn: 2 }}
            title={labels[i]}
          >
            {labels[i]}
          </div>
          {/* Cells */}
          {row.map((val, j) => {
            const pct = rowTotals[i] > 0 ? ((val / rowTotals[i]) * 100).toFixed(0) : 0;
            const isDiag = i === j;
            return (
              <div
                key={`c-${i}-${j}`}
                class={`cm-cell${isDiag ? " cm-diag" : ""}`}
                style={{
                  gridRow: i + 2,
                  gridColumn: j + 3,
                  background: cellBg(val, isDiag),
                }}
                title={`${labels[i]} → ${labels[j]}: ${val} (${pct}%)`}
              >
                <span class="cm-val">{val}</span>
                <span class="cm-pct">{pct}%</span>
              </div>
            );
          })}
        </>
      ))}

      {/* Predicted axis label — bottom, spanning cell columns */}
      <div
        class="cm-axis-bottom"
        style={{ gridRow: n + 2, gridColumn: `3 / ${n + 3}` }}
      >
        Predicted
      </div>
    </div>
  );
}
