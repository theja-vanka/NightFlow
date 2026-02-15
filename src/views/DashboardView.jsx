import { SummaryCard } from "../components/SummaryCard.jsx";
import { ChartPanel } from "../components/ChartPanel.jsx";
import { LineChart } from "../components/LineChart.jsx";
import { stats } from "../state/dashboard.js";
import { projectRuns } from "../state/experiments.js";

const icons = {
  total: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20V10"/><path d="M18 20V4"/><path d="M6 20v-4"/></svg>`,
  running: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>`,
  accuracy: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/></svg>`,
  loss: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
};

export function DashboardView() {
  const s = stats.value;
  const runs = projectRuns.value;

  // Pick top 3 completed runs for charts
  const completed = runs.filter((r) => r.status === "completed").slice(0, 3);

  return (
    <div class="dashboard-view">
      <div class="summary-grid">
        <SummaryCard label="Total Runs" value={s.totalRuns} icon={icons.total} />
        <SummaryCard label="Running" value={s.running} icon={icons.running} />
        <SummaryCard label="Best Accuracy" value={s.bestAcc != null ? (s.bestAcc * 100).toFixed(1) + "%" : "—"} icon={icons.accuracy} />
        <SummaryCard label="Avg Val Loss" value={s.avgLoss != null ? s.avgLoss.toFixed(4) : "—"} icon={icons.loss} />
      </div>
      <div class="chart-grid-2">
        <ChartPanel title="Training Loss">
          <LineChart
            series={completed.map((r) => ({ label: r.id, data: r.lossCurve }))}
            yLabel="Loss"
          />
        </ChartPanel>
        <ChartPanel title="Accuracy">
          <LineChart
            series={completed.map((r) => ({ label: r.id, data: r.accCurve }))}
            yLabel="Acc"
          />
        </ChartPanel>
      </div>
    </div>
  );
}
