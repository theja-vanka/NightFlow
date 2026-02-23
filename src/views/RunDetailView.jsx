import { useState, useEffect } from "preact/hooks";
import { navigate, routeParams } from "../state/router.js";
import { allRuns, loadRunScalars } from "../state/experiments.js";
import { ChartPanel } from "../components/ChartPanel.jsx";
import { LineChart } from "../components/LineChart.jsx";

const HPARAM_LABELS = {
  lr: "Learning Rate",
  optimizer: "Optimizer",
  scheduler: "Scheduler",
  weightDecay: "Weight Decay",
  batchSize: "Batch Size",
  maxEpochs: "Max Epochs",
  imageSize: "Image Size",
  precision: "Precision",
  gradientClipVal: "Gradient Clip",
  freezeBackbone: "Freeze Backbone",
  seed: "Seed",
  augmentationPreset: "Augmentation",
  numClasses: "Num Classes",
};

function formatHparamValue(key, val) {
  if (typeof val === "boolean") return val ? "Yes" : "No";
  if (typeof val === "number") {
    if (key === "lr" || key === "weightDecay") return val.toExponential(1);
    return String(val);
  }
  return String(val);
}

function groupByPrefix(scalars) {
  const groups = {};
  for (const tag of Object.keys(scalars).sort()) {
    const slashIdx = tag.indexOf("/");
    const prefix = slashIdx > 0 ? tag.slice(0, slashIdx) : "other";
    if (!groups[prefix]) groups[prefix] = [];
    groups[prefix].push(tag);
  }
  return groups;
}

export function RunDetailView() {
  const { runId } = routeParams.value;
  const run = allRuns.value.find((r) => r.id === runId);
  const [scalars, setScalars] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!run) return;
    setLoading(true);
    setError(null);
    loadRunScalars(run)
      .then((result) => {
        setScalars(result);
        setLoading(false);
      })
      .catch((err) => {
        setError(err?.message || String(err));
        setLoading(false);
      });
  }, [runId]);

  if (!run) {
    return (
      <div class="run-detail-view">
        <button class="run-detail-back" onClick={() => navigate("experiments")}>
          &larr; Back to Experiments
        </button>
        <div class="run-detail-error">Run not found.</div>
      </div>
    );
  }

  const hasScalars = scalars && Object.keys(scalars).length > 0;
  const groups = hasScalars ? groupByPrefix(scalars) : {};

  // Fallback charts from stored lossCurve / accCurve
  const fallbackCharts = [];
  if (run.lossCurve?.length) {
    fallbackCharts.push({ title: "Loss Curve", data: run.lossCurve, yLabel: "Loss" });
  }
  if (run.accCurve?.length) {
    fallbackCharts.push({ title: "Accuracy Curve", data: run.accCurve, yLabel: "Accuracy" });
  }

  const hp = run.hyperparameters;
  const hasHparams = hp && Object.keys(hp).length > 0;

  return (
    <div class="run-detail-view">
      <button class="run-detail-back" onClick={() => navigate("experiments")}>
        &larr; Back to Experiments
      </button>

      <div class="run-detail-header">
        <h2>{run.name || run.id}</h2>
      </div>

      <div class="run-detail-meta">
        {run.model && <span class="run-meta-tag">Model: {run.model}</span>}
        {run.dataset && <span class="run-meta-tag">Dataset: {run.dataset}</span>}
        {run.epochs != null && <span class="run-meta-tag">Epochs: {run.epochs}</span>}
        {run.bestAcc != null && <span class="run-meta-tag">Best Acc: {run.bestAcc.toFixed(4)}</span>}
        {run.valLoss != null && <span class="run-meta-tag">Val Loss: {run.valLoss.toFixed(4)}</span>}
        {run.status && <span class="run-meta-tag">Status: {run.status}</span>}
      </div>

      {hasHparams && (
        <div class="run-detail-hparams">
          <h3 class="run-detail-group-title">Hyperparameters</h3>
          <table class="hparams-table">
            <tbody>
              {Object.entries(hp).map(([key, val]) => (
                <tr key={key}>
                  <td class="hparams-key">{HPARAM_LABELS[key] || key}</td>
                  <td class="hparams-val">{formatHparamValue(key, val)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {loading && <div class="run-detail-loading">Loading scalar metrics...</div>}
      {error && <div class="run-detail-error">Failed to load scalars: {error}</div>}

      {hasScalars ? (
        <div class="run-detail-charts">
          {Object.entries(groups).map(([prefix, tags]) => (
            <div key={prefix} class="run-detail-group">
              <h3 class="run-detail-group-title">{prefix}/</h3>
              <div class="run-detail-group-charts">
                {tags.map((tag) => {
                  const data = scalars[tag].map((s) => s.value);
                  return (
                    <ChartPanel key={tag} title={tag}>
                      <LineChart
                        series={[{ label: tag, data }]}
                        yLabel=""
                        xLabel="Step"
                      />
                    </ChartPanel>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ) : (
        !loading && fallbackCharts.length > 0 && (
          <div class="run-detail-charts">
            <div class="run-detail-group">
              <h3 class="run-detail-group-title">Stored Metrics</h3>
              <div class="run-detail-group-charts">
                {fallbackCharts.map((fc) => (
                  <ChartPanel key={fc.title} title={fc.title}>
                    <LineChart
                      series={[{ label: fc.title, data: fc.data }]}
                      yLabel={fc.yLabel}
                      xLabel="Epoch"
                    />
                  </ChartPanel>
                ))}
              </div>
            </div>
          </div>
        )
      )}

      {!loading && !hasScalars && fallbackCharts.length === 0 && (
        <div class="run-detail-empty">No metric data available for this run.</div>
      )}
    </div>
  );
}
