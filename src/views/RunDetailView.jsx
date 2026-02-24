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

// Build tabs from scalar tags: train, val, test, other
function buildTabs(scalars) {
  const tabs = {};
  for (const tag of Object.keys(scalars).sort()) {
    const slashIdx = tag.indexOf("/");
    const prefix = slashIdx > 0 ? tag.slice(0, slashIdx) : "other";
    if (!tabs[prefix]) tabs[prefix] = [];
    tabs[prefix].push(tag);
  }
  return tabs;
}

// Strip prefix from tag for display (e.g. "train/loss" -> "loss")
function stripPrefix(tag) {
  const idx = tag.indexOf("/");
  return idx > 0 ? tag.slice(idx + 1) : tag;
}

export function RunDetailView() {
  const { runId } = routeParams.value;
  const run = allRuns.value.find((r) => r.id === runId);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState(null);

  // If run has no scalars in IndexedDB, try loading from its JSONL file
  useEffect(() => {
    if (!run || (run.scalars && Object.keys(run.scalars).length > 0)) return;
    setLoading(true);
    loadRunScalars(run).finally(() => setLoading(false));
  }, [runId]);

  // Auto-select first tab when scalars become available
  const hasScalars = run?.scalars && Object.keys(run.scalars).length > 0;
  const tabs = hasScalars ? buildTabs(run.scalars) : {};
  const tabNames = Object.keys(tabs);
  const TAB_ORDER = ["train", "val", "test"];
  const sortedTabs = [
    ...TAB_ORDER.filter((t) => tabNames.includes(t)),
    ...tabNames.filter((t) => !TAB_ORDER.includes(t)),
  ];

  // Reset active tab when run changes or tabs change
  useEffect(() => {
    if (sortedTabs.length > 0 && (!activeTab || !tabs[activeTab])) {
      setActiveTab(sortedTabs[0]);
    }
  }, [runId, sortedTabs.join(",")]);

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

  const hp = run.hyperparameters;
  const hasHparams = hp && Object.keys(hp).length > 0;
  const currentTags = activeTab && tabs[activeTab] ? tabs[activeTab] : [];

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
        {run.dataset && (
          <span class="run-meta-tag">Dataset: {run.dataset}</span>
        )}
        {run.epochs != null && (
          <span class="run-meta-tag">Epochs: {run.epochs}</span>
        )}
        {run.bestAcc != null && (
          <span class="run-meta-tag">Best Acc: {run.bestAcc.toFixed(4)}</span>
        )}
        {run.valLoss != null && (
          <span class="run-meta-tag">Val Loss: {run.valLoss.toFixed(4)}</span>
        )}
        {run.status && <span class="run-meta-tag">Status: {run.status}</span>}
      </div>

      <div class="run-detail-body">
        {/* Column 1: Hyperparameters */}
        <div class="run-detail-sidebar">
          {hasHparams ? (
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
          ) : (
            <div class="run-detail-hparams">
              <h3 class="run-detail-group-title">Hyperparameters</h3>
              <div class="run-detail-empty-sidebar">
                No hyperparameters recorded.
              </div>
            </div>
          )}
        </div>

        {/* Columns 2-3: Charts with tabs */}
        <div class="run-detail-charts-area">
          {loading && (
            <div class="run-detail-loading">
              Loading metrics from run log...
            </div>
          )}

          {hasScalars && sortedTabs.length > 0 ? (
            <>
              <div class="run-detail-tabs">
                {sortedTabs.map((tab) => (
                  <button
                    key={tab}
                    class={`run-detail-tab${activeTab === tab ? " active" : ""}`}
                    onClick={() => setActiveTab(tab)}
                  >
                    {tab}
                  </button>
                ))}
              </div>

              <div class="run-detail-charts-grid">
                {currentTags.map((tag) => {
                  const points = run.scalars[tag];
                  const data =
                    typeof points[0] === "number"
                      ? points
                      : points.map((s) => s.value);
                  return (
                    <ChartPanel key={tag} title={stripPrefix(tag)}>
                      <LineChart
                        series={[{ label: stripPrefix(tag), data }]}
                        yLabel=""
                        xLabel="Epoch"
                      />
                    </ChartPanel>
                  );
                })}
              </div>
            </>
          ) : null}

          {!loading && !hasScalars && (
            <div class="run-detail-empty">
              No metric data available for this run.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
