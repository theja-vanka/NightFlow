export function LineChart({
  series,
  width = 360,
  height = 180,
  yLabel = "",
  xLabel = "Epoch",
}) {
  // series: [{ label, data, dash? }]
  if (!series || !series.length) return <div class="chart-empty">No data</div>;

  const pad = { top: 18, right: 14, bottom: 28, left: 40 };
  const cw = width - pad.left - pad.right;
  const ch = height - pad.top - pad.bottom;

  const allValues = series.flatMap((s) => s.data);
  const maxLen = Math.max(...series.map((s) => s.data.length));
  const yMin = Math.min(...allValues);
  const yMax = Math.max(...allValues);
  const yRange = yMax - yMin || 1;

  function toX(i) {
    return pad.left + (i / (maxLen - 1)) * cw;
  }
  function toY(v) {
    return pad.top + ch - ((v - yMin) / yRange) * ch;
  }

  // Y-axis ticks
  const yTicks = 5;
  const yTickValues = Array.from(
    { length: yTicks },
    (_, i) => yMin + (yRange * i) / (yTicks - 1),
  );

  // X-axis ticks
  const xTicks = Math.min(6, maxLen);
  const xTickValues = Array.from({ length: xTicks }, (_, i) =>
    Math.round((i / (xTicks - 1)) * (maxLen - 1)),
  );

  const strokes = [
    "var(--chart-line-1)",
    "var(--chart-line-2)",
    "var(--chart-line-3)",
    "var(--chart-line-4)",
    "var(--chart-line-5)",
    "var(--chart-line-6)",
    "var(--chart-line-7)",
    "var(--chart-line-8)",
  ];

  return (
    <svg
      class="line-chart"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
    >
      {/* Grid lines */}
      {yTickValues.map((v) => (
        <line
          x1={pad.left}
          y1={toY(v)}
          x2={pad.left + cw}
          y2={toY(v)}
          stroke="var(--chart-grid)"
          stroke-width="1"
        />
      ))}

      {/* Axes */}
      <line
        x1={pad.left}
        y1={pad.top}
        x2={pad.left}
        y2={pad.top + ch}
        stroke="var(--chart-axis)"
        stroke-width="1"
      />
      <line
        x1={pad.left}
        y1={pad.top + ch}
        x2={pad.left + cw}
        y2={pad.top + ch}
        stroke="var(--chart-axis)"
        stroke-width="1"
      />

      {/* Y labels */}
      {yTickValues.map((v) => (
        <text
          x={pad.left - 8}
          y={toY(v) + 4}
          text-anchor="end"
          class="chart-label"
        >
          {v < 1 ? v.toFixed(2) : v.toFixed(1)}
        </text>
      ))}

      {/* X labels */}
      {xTickValues.map((idx) => (
        <text
          x={toX(idx)}
          y={pad.top + ch + 20}
          text-anchor="middle"
          class="chart-label"
        >
          {idx}
        </text>
      ))}

      {/* Axis titles */}
      <text
        x={pad.left + cw / 2}
        y={height - 4}
        text-anchor="middle"
        class="chart-axis-title"
      >
        {xLabel}
      </text>
      <text
        x={14}
        y={pad.top + ch / 2}
        text-anchor="middle"
        class="chart-axis-title"
        transform={`rotate(-90, 14, ${pad.top + ch / 2})`}
      >
        {yLabel}
      </text>

      {/* Data lines */}
      {series.map((s, si) => {
        const points = s.data
          .map((v, i) => `${toX(i).toFixed(1)},${toY(v).toFixed(1)}`)
          .join(" ");
        return (
          <polyline
            fill="none"
            stroke={strokes[si % strokes.length]}
            stroke-width="1.5"
            stroke-dasharray={s.dash ? "4 3" : "none"}
            stroke-linecap="round"
            stroke-linejoin="round"
            points={points}
          />
        );
      })}

      {/* Legend */}
      {series.map((s, si) => (
        <g transform={`translate(${pad.left + 6 + si * 90}, ${pad.top - 6})`}>
          <line
            x1="0"
            y1="0"
            x2="12"
            y2="0"
            stroke={strokes[si % strokes.length]}
            stroke-width="1.5"
            stroke-dasharray={s.dash ? "4 3" : "none"}
          />
          <text x="16" y="3" class="chart-legend-text">
            {s.label}
          </text>
        </g>
      ))}
    </svg>
  );
}
