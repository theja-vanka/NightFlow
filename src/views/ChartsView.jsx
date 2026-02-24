import { useState, useEffect } from "preact/hooks";
import { ChartPanel } from "../components/ChartPanel.jsx";
import { LineChart } from "../components/LineChart.jsx";
import { projectRuns, loadRunScalars } from "../state/experiments.js";

export function ChartsView() {
  const runs = projectRuns.value;
  const completed = runs.filter((r) => r.status === "completed");
  const tbRuns = completed.filter((r) => r.tbVersion);

  const [tbScalars, setTbScalars] = useState({});
  const [loadingTb, setLoadingTb] = useState(false);

  // Stable key to detect when the set of TB runs changes
  const tbRunKey = tbRuns.map((r) => r.id).join(",");

  useEffect(() => {
    if (tbRuns.length === 0) {
      setTbScalars({});
      return;
    }
    setLoadingTb(true);
    Promise.all(
      tbRuns.map((r) =>
        loadRunScalars(r).then((s) => ({ run: r, scalars: s })),
      ),
    )
      .then((results) => {
        const map = {};
        for (const { run, scalars } of results) {
          if (scalars) map[run.id] = { run, scalars };
        }
        setTbScalars(map);
        setLoadingTb(false);
      })
      .catch(() => setLoadingTb(false));
  }, [tbRunKey]);

  // Build tagMap: tag -> [{ label, data: number[] }] across all loaded runs
  const tagMap = {};
  for (const { run, scalars } of Object.values(tbScalars)) {
    for (const [tag, points] of Object.entries(scalars)) {
      if (!tagMap[tag]) tagMap[tag] = [];
      tagMap[tag].push({
        label: run.name || run.id,
        data: points
          .slice()
          .sort((a, b) => a.step - b.step)
          .map((p) => p.value),
      });
    }
  }
  const allTags = Object.keys(tagMap).sort();

  // If no completed runs, show empty state
  if (completed.length === 0) {
    return (
      <div class="charts-view">
        <div class="charts-empty">
          <p class="charts-empty-text">No completed runs yet</p>
          <p class="charts-empty-hint">
            Charts will appear here once training runs complete or TensorBoard
            logs are found during sync.
          </p>
        </div>
      </div>
    );
  }

  // Group by model for comparison
  const byModel = {};
  completed.forEach((r) => {
    if (!byModel[r.model]) byModel[r.model] = r;
  });
  const modelRuns = Object.values(byModel).slice(0, 4);

  // Top runs by best accuracy / lowest loss
  const topAcc = [...completed]
    .sort((a, b) => (b.bestAcc ?? 0) - (a.bestAcc ?? 0))
    .slice(0, 3);
  const topLoss = [...completed]
    .sort((a, b) => (a.valLoss ?? 9) - (b.valLoss ?? 9))
    .slice(0, 3);

  return (
    <div class="charts-view">
      <div class="chart-grid-2x2">
        {modelRuns.length > 0 && (
          <ChartPanel title="Loss by Model">
            <LineChart
              series={modelRuns.map((r) => ({
                label: r.model,
                data: r.lossCurve,
              }))}
              yLabel="Loss"
            />
          </ChartPanel>
        )}
        {modelRuns.length > 0 && (
          <ChartPanel title="Accuracy by Model">
            <LineChart
              series={modelRuns.map((r) => ({
                label: r.model,
                data: r.accCurve,
              }))}
              yLabel="Acc"
            />
          </ChartPanel>
        )}
        {topAcc.length > 0 && (
          <ChartPanel title="Top Accuracy Runs">
            <LineChart
              series={topAcc.map((r) => ({
                label: r.name || r.id,
                data: r.accCurve,
              }))}
              yLabel="Acc"
            />
          </ChartPanel>
        )}
        {topLoss.length > 0 && (
          <ChartPanel title="Lowest Loss Runs">
            <LineChart
              series={topLoss.map((r) => ({
                label: r.name || r.id,
                data: r.lossCurve,
              }))}
              yLabel="Loss"
            />
          </ChartPanel>
        )}
      </div>

      {(loadingTb || allTags.length > 0) && (
        <div class="charts-tb-section">
          <h3 class="run-detail-group-title">TensorBoard Metrics</h3>
          {loadingTb ? (
            <div class="run-detail-loading">Loading TensorBoard scalars…</div>
          ) : (
            <div class="run-detail-group-charts">
              {allTags.map((tag) => (
                <ChartPanel key={tag} title={tag}>
                  <LineChart series={tagMap[tag]} yLabel="" xLabel="Step" />
                </ChartPanel>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
