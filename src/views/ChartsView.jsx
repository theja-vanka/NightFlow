import { ChartPanel } from "../components/ChartPanel.jsx";
import { LineChart } from "../components/LineChart.jsx";
import { projectRuns } from "../state/experiments.js";

export function ChartsView() {
  const runs = projectRuns.value;
  const completed = runs.filter((r) => r.status === "completed");

  // If no completed runs, show empty state
  if (completed.length === 0) {
    return (
      <div class="charts-view">
        <div class="charts-empty">
          <p class="charts-empty-text">No completed runs yet</p>
          <p class="charts-empty-hint">Charts will appear here once training runs complete or TensorBoard logs are found during sync.</p>
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

  // Group by dataset
  const byDataset = {};
  completed.forEach((r) => {
    if (!byDataset[r.dataset]) byDataset[r.dataset] = r;
  });
  // Top runs by best accuracy
  const topAcc = [...completed].sort((a, b) => (b.bestAcc ?? 0) - (a.bestAcc ?? 0)).slice(0, 3);
  const topLoss = [...completed].sort((a, b) => (a.valLoss ?? 9) - (b.valLoss ?? 9)).slice(0, 3);

  return (
    <div class="charts-view">
      <div class="chart-grid-2x2">
        {modelRuns.length > 0 && (
          <ChartPanel title="Loss by Model">
            <LineChart
              series={modelRuns.map((r) => ({ label: r.model, data: r.lossCurve }))}
              yLabel="Loss"
            />
          </ChartPanel>
        )}
        {modelRuns.length > 0 && (
          <ChartPanel title="Accuracy by Model">
            <LineChart
              series={modelRuns.map((r) => ({ label: r.model, data: r.accCurve }))}
              yLabel="Acc"
            />
          </ChartPanel>
        )}
        {topAcc.length > 0 && (
          <ChartPanel title="Top Accuracy Runs">
            <LineChart
              series={topAcc.map((r) => ({ label: r.id, data: r.accCurve }))}
              yLabel="Acc"
            />
          </ChartPanel>
        )}
        {topLoss.length > 0 && (
          <ChartPanel title="Lowest Loss Runs">
            <LineChart
              series={topLoss.map((r) => ({ label: r.id, data: r.lossCurve }))}
              yLabel="Loss"
            />
          </ChartPanel>
        )}
      </div>
    </div>
  );
}
