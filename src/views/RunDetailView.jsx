import { useState, useEffect } from "preact/hooks";
import { invoke } from "@tauri-apps/api/core";
import { navigate, routeParams } from "../state/router.js";
import { allRuns, loadRunScalars } from "../state/experiments.js";
import { currentProject } from "../state/projects.js";
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

function DownloadModelButton({ runId, runName }) {
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");

  async function handleDownload() {
    const project = currentProject.value;
    if (!project) return;

    setStatus("loading");
    setError("");
    try {
      const sshCmd =
        project.connectionType === "remote" ? project.sshCommand : null;
      await invoke("download_model", {
        projectPath: project.projectPath,
        runId,
        runName: runName || runId,
        sshCommand: sshCmd,
      });
      setStatus("done");
    } catch (err) {
      setStatus("error");
      setError(String(err));
    }
  }

  const icon =
    status === "loading" ? (
      <div class="download-spinner" />
    ) : status === "done" ? (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    ) : (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" y1="15" x2="12" y2="3" />
      </svg>
    );

  return (
    <div class="training-download-row">
      <button
        class="training-download-btn"
        onClick={handleDownload}
        disabled={status === "loading"}
      >
        {icon}
        {status === "loading"
          ? "Downloading..."
          : status === "done"
            ? "Downloaded"
            : "Download Model"}
      </button>
      {error && (
        <span class="training-download-msg training-download-msg--error">
          {error}
        </span>
      )}
    </div>
  );
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
        <DownloadModelButton runId={run.id} runName={run.name || run.id} />
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
          <span class="run-meta-tag">Val Acc: {run.bestAcc.toFixed(4)}</span>
        )}
        {run.testAcc != null && (
          <span class="run-meta-tag">Test Acc: {run.testAcc.toFixed(4)}</span>
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
