export function LineChart({
  series,
  width = 360,
  height = 180,
  yLabel = "",
  xLabel = "Epoch",
}) {
  // series: [{ label, data, dash? }]
  // data can be: number[] OR { epoch, value }[] OR { step, value }[]
  if (!series || !series.length) return <div class="chart-empty">No data</div>;

  const pad = { top: 18, right: 14, bottom: 28, left: 40 };
  const cw = width - pad.left - pad.right;
  const ch = height - pad.top - pad.bottom;

  // Normalize each series data into [{ epoch, value }]
  // Deduplicate points sharing the same epoch (e.g. step-level train metrics
  // from CSVLogger) by keeping only the last value per epoch.
  const normalized = series.map((s) => {
    if (!s.data || !s.data.length) return { ...s, points: [] };
    let raw;
    if (typeof s.data[0] === "number") {
      raw = s.data.map((v, i) => ({ epoch: i, value: v }));
    } else {
      raw = s.data.map((p) => ({
        epoch: p.epoch ?? p.step ?? 0,
        value: p.value,
      }));
    }
    // Deduplicate: keep last value per epoch
    const byEpoch = new Map();
    for (const p of raw) byEpoch.set(p.epoch, p);
    return { ...s, points: Array.from(byEpoch.values()) };
  });

  const allValues = normalized
    .flatMap((s) => s.points.map((p) => p.value))
    .filter((v) => Number.isFinite(v));
  if (!allValues.length) return <div class="chart-empty">No valid data</div>;

  const allEpochs = normalized
    .flatMap((s) => s.points.map((p) => p.epoch))
    .filter((v) => Number.isFinite(v));
  const epochMin = Math.min(...allEpochs);
  const epochMax = Math.max(...allEpochs);
  const epochRange = epochMax - epochMin || 1;

  const yMin = Math.min(...allValues);
  const yMax = Math.max(...allValues);
  const yRange = yMax - yMin || 1;

  function toX(epoch) {
    return pad.left + ((epoch - epochMin) / epochRange) * cw;
  }
  function toY(v) {
    if (!Number.isFinite(v)) return pad.top + ch;
    return pad.top + ch - ((v - yMin) / yRange) * ch;
  }

  // Y-axis ticks
  const yTicks = 5;
  const yTickValues = Array.from(
    { length: yTicks },
    (_, i) => yMin + (yRange * i) / (yTicks - 1),
  );

  // X-axis ticks (based on epoch range)
  const xTicks = Math.min(6, epochRange + 1);
  const xTickValues = Array.from({ length: xTicks }, (_, i) =>
    Math.round(epochMin + (i / (xTicks - 1)) * epochRange),
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
      {xTickValues.map((ep) => (
        <text
          x={toX(ep)}
          y={pad.top + ch + 20}
          text-anchor="middle"
          class="chart-label"
        >
          {ep}
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
      {normalized.map((s, si) => {
        // Split into segments at NaN/Infinity gaps so the line breaks cleanly
        const segments = [];
        let current = [];
        for (let i = 0; i < s.points.length; i++) {
          const p = s.points[i];
          if (Number.isFinite(p.value)) {
            current.push(`${toX(p.epoch).toFixed(1)},${toY(p.value).toFixed(1)}`);
          } else if (current.length) {
            segments.push(current.join(" "));
            current = [];
          }
        }
        if (current.length) segments.push(current.join(" "));

        return segments.map((points, pi) => (
          <polyline
            key={`${si}-${pi}`}
            fill="none"
            stroke={strokes[si % strokes.length]}
            stroke-width="1.5"
            stroke-dasharray={s.dash ? "4 3" : "none"}
            stroke-linecap="round"
            stroke-linejoin="round"
            points={points}
          />
        ));
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
