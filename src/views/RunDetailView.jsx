import { useState, useEffect } from "preact/hooks";
import { invoke } from "@tauri-apps/api/core";
import { navigate, routeParams } from "../state/router.js";
import { allRuns, loadRunScalars, loadRunHparams, updateRun } from "../state/experiments.js";
import { currentProject } from "../state/projects.js";
import { ChartPanel } from "../components/ChartPanel.jsx";
import { LineChart } from "../components/LineChart.jsx";
import { BarChart } from "../components/BarChart.jsx";
import { ExportDropdown } from "../components/ExportDropdown.jsx";
import { ConfusionMatrix } from "../components/ConfusionMatrix.jsx";
import { PerClassMetrics } from "../components/PerClassMetrics.jsx";

// Convert snake_case / camelCase keys to Title Case labels
function formatLabel(key) {
  return key
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// Keys to exclude from hparams display (internal/noise from PyTorch Lightning)
const HPARAM_EXCLUDE = new Set([
  "_class_path", "class_path", "_target_", "_recursive_",
  "callbacks", "logger", "log_dir", "default_root_dir",
  "enable_checkpointing", "enable_progress_bar", "enable_model_summary",
  "num_sanity_val_steps", "check_val_every_n_epoch",
  "log_every_n_steps", "detect_anomaly", "deterministic",
  "benchmark", "inference_mode", "use_distributed_sampler",
  "profiler", "reload_dataloaders_every_n_epochs",
  "val_check_interval", "limit_train_batches", "limit_val_batches",
  "limit_test_batches", "limit_predict_batches",
  "fast_dev_run", "overfit_batches", "barebones",
  "plugins", "sync_batchnorm", "strategy",
  "data_dir", "data_directory", "instantiator", "_instantiator",
]);

// Returns true if a value is a "noisy" object or deeply nested structure
function isNoisyValue(val) {
  if (val === null || val === undefined) return true;
  if (typeof val === "object" && !Array.isArray(val)) {
    // Skip objects that look like internal config (e.g. {class_path: ..., init_args: ...})
    const keys = Object.keys(val);
    if (keys.includes("class_path") || keys.includes("_target_")) return true;
    if (keys.length > 6) return true; // deeply nested config blobs
  }
  return false;
}

// Filter and clean hparams for display
function filterHparams(hp) {
  if (!hp) return {};
  const filtered = {};
  for (const [key, val] of Object.entries(hp)) {
    if (HPARAM_EXCLUDE.has(key)) continue;
    if (isNoisyValue(val)) continue;
    filtered[key] = val;
  }
  return filtered;
}

function formatHparamValue(key, val) {
  if (val === null || val === undefined) return "—";
  if (typeof val === "boolean") return val ? "Yes" : "No";
  if (Array.isArray(val)) return val.map(String).join(", ");
  if (typeof val === "object") return JSON.stringify(val);
  if (typeof val === "number") {
    // Small floats like learning rates look better in exponential notation
    if (Math.abs(val) > 0 && Math.abs(val) < 0.01) return val.toExponential(1);
    return String(val);
  }
  return String(val);
}

// Tags that hold structured data (not scalar points) — excluded from charts
const NON_SCALAR_TAGS = new Set(["test/confusion_matrix", "test/per_class_metrics"]);

// Build tabs from scalar tags: train, val, test, other
function buildTabs(scalars) {
  const tabs = {};
  for (const tag of Object.keys(scalars).sort()) {
    if (tag.startsWith("sanity_val/") || tag.startsWith("sanity_val_")) continue;
    if (NON_SCALAR_TAGS.has(tag)) continue;
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

function TagsInput({ tags = [], runId }) {
  const [input, setInput] = useState("");

  function addTag(e) {
    if (e.key !== "Enter" || !input.trim()) return;
    const newTag = input.trim();
    if (!tags.includes(newTag)) {
      updateRun(runId, { tags: [...tags, newTag] });
    }
    setInput("");
  }

  function removeTag(tag) {
    updateRun(runId, { tags: tags.filter((t) => t !== tag) });
  }

  return (
    <div class="tag-chips">
      {tags.map((tag) => (
        <span key={tag} class="tag-chip">
          {tag}
          <button class="tag-chip-remove" onClick={() => removeTag(tag)}>
            &times;
          </button>
        </span>
      ))}
      <input
        type="text"
        class="tag-input-inline"
        placeholder="Add tag..."
        value={input}
        onInput={(e) => setInput(e.currentTarget.value)}
        onKeyDown={addTag}
      />
    </div>
  );
}

function NotesSection({ notes = "", runId }) {
  const [value, setValue] = useState(notes);

  useEffect(() => {
    setValue(notes);
  }, [notes]);

  function handleBlur() {
    if (value !== notes) {
      updateRun(runId, { notes: value });
    }
  }

  return (
    <div class="run-notes-section">
      <div class="run-notes-label">Notes</div>
      <textarea
        class="run-notes-textarea"
        value={value}
        onInput={(e) => setValue(e.currentTarget.value)}
        onBlur={handleBlur}
        placeholder="Add notes about this run..."
      />
    </div>
  );
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

function getAugmentationSteps(preset, hp) {
  const size = hp.image_size || hp.imageSize || 224;
  const meanStd = "mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]";

  switch (String(preset).toLowerCase()) {
    case "default":
      return [
        `Random Resized Crop (${size}x${size})`,
        "Random Horizontal Flip (p=0.5)",
        "Color Jitter (brightness=0.2, contrast=0.2, saturation=0.2)",
        "Convert to Tensor",
        `Normalize (${meanStd})`
      ];
    case "autoaugment":
      return [
        `Random Resized Crop (${size}x${size})`,
        "Random Horizontal Flip (p=0.5)",
        "AutoAugment (policy=ImageNet)",
        "Convert to Tensor",
        `Normalize (${meanStd})`
      ];
    case "randaugment":
      return [
        `Random Resized Crop (${size}x${size})`,
        "Random Horizontal Flip (p=0.5)",
        "RandAugment (num_ops=2, magnitude=9)",
        "Convert to Tensor",
        `Normalize (${meanStd})`
      ];
    case "trivialaugment":
      return [
        `Random Resized Crop (${size}x${size})`,
        "Random Horizontal Flip (p=0.5)",
        "TrivialAugmentWide",
        "Convert to Tensor",
        `Normalize (${meanStd})`
      ];
    case "strong":
      return [
        `Random Resized Crop (${size}x${size})`,
        "Horizontal Flip (p=0.5)",
        "Affine Transform (scale=0.8-1.2, rotate=\u00b115\u00b0, translate=\u00b110%, p=0.5)",
        "Blur / Gaussian Noise (p=0.3)",
        "Color Jitter (brightness=0.3, contrast=0.3, saturation=0.3, hue=0.1, p=0.8)",
        "Coarse Dropout (holes=1-3, size=5-15%, p=0.3)",
        `Normalize (${meanStd})`,
        "Convert to Tensor"
      ];
    case "light":
      return [
        `Random Resized Crop (${size}x${size})`,
        "Horizontal Flip (p=0.5)",
        "Convert to Tensor",
        `Normalize (${meanStd})`
      ];
    default:
      return null;
  }
}

export function RunDetailView() {
  const { runId } = routeParams.value;
  const run = allRuns.value.find((r) => r.id === runId);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState(null);
  const [fileHparams, setFileHparams] = useState(null);

  // If run has no scalars in IndexedDB, try loading from its JSONL file
  useEffect(() => {
    if (!run || (run.scalars && Object.keys(run.scalars).length > 0)) return;
    setLoading(true);
    loadRunScalars(run).finally(() => setLoading(false));
  }, [runId]);

  // Load hyperparameters from hparams.yaml on disk
  useEffect(() => {
    if (!run) return;

    // If we already have file-based hparams cached on the run, use those
    if (run.fileHparams && Object.keys(run.fileHparams).length > 0) {
      setFileHparams(run.fileHparams);
      return;
    }

    loadRunHparams(run).then((hparams) => {
      if (hparams) setFileHparams(hparams);
    });
  }, [runId]);


  // Auto-select first tab when scalars become available
  const hasScalars = run?.scalars && Object.keys(run.scalars).length > 0;
  const tabs = hasScalars ? buildTabs(run.scalars) : {};
  const tabNames = Object.keys(tabs);
  // Check for confusion matrix / per-class data (persisted directly or in scalars)
  const confusionMatrix = run?.confusionMatrix || run?.scalars?.["test/confusion_matrix"] || null;
  const perClassMetrics = run?.perClassMetrics || run?.scalars?.["test/per_class_metrics"] || null;
  const hasClassificationData = confusionMatrix || perClassMetrics;

  const TAB_ORDER = ["train", "val", "test"];
  const sortedTabs = [
    ...TAB_ORDER.filter((t) => tabNames.includes(t)),
    ...tabNames.filter((t) => !TAB_ORDER.includes(t)),
    ...(hasClassificationData ? ["classification"] : []),
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

  // Merge both sources: file hparams (more detailed) + project-captured hparams (always available).
  // This ensures augmentation, backbone, etc. survive even if log files are deleted.
  const mergedHp = { ...(run.hyperparameters || {}), ...(fileHparams || {}) };
  const hp = filterHparams(mergedHp);
  const hasHparams = Object.keys(hp).length > 0;
  const currentTags = activeTab && tabs[activeTab] ? tabs[activeTab] : [];

  return (
    <div class="run-detail-view">
      <button class="run-detail-back" onClick={() => navigate("experiments")}>
        &larr; Back to Experiments
      </button>

      <div class="run-detail-header">
        <h2>{run.name || run.id}</h2>
        <div style="display:flex;align-items:center;gap:8px">
          <ExportDropdown runs={run} filenamePrefix={run.name || run.id} />
          <DownloadModelButton runId={run.id} runName={run.name || run.id} />
        </div>
      </div>

      <TagsInput tags={run.tags || []} runId={run.id} />
      <NotesSection notes={run.notes || ""} runId={run.id} />

      <div class="run-detail-meta">
        {run.backbone && <span class="run-meta-tag">Backbone: {run.backbone}</span>}
        {!run.backbone && run.model && <span class="run-meta-tag">Model: {run.model}</span>}
        {run.taskType && <span class="run-meta-tag">Task: {run.taskType}</span>}
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
              <h3 class="run-detail-group-title">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.5">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
                Hyperparameters
              </h3>
              <div class="hparams-list">
                {Object.entries(hp).map(([key, val]) => (
                  <div key={key} class="hparams-item">
                    <span class="hparams-key">{formatLabel(key)}</span>
                    <span class="hparams-val">{formatHparamValue(key, val)}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div class="run-detail-hparams">
              <h3 class="run-detail-group-title">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.5">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
                Hyperparameters
              </h3>
              <div class="run-detail-empty-sidebar">
                No hyperparameters recorded.
              </div>
            </div>
          )}

          {/* Augmentation Steps */}
          {(() => {
            const presetName = hp.augmentation_preset || hp.augmentationPreset;
            if (!presetName) return null;
            const steps = getAugmentationSteps(presetName, hp);
            if (!steps) return null;

            return (
              <div class="run-detail-hparams" style="margin-top: 16px;">
                <h3 class="run-detail-group-title">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.5">
                    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
                    <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
                    <line x1="12" y1="22.08" x2="12" y2="12"></line>
                  </svg>
                  Augmentation ({presetName})
                </h3>
                <ol style="padding-left: 24px; margin: 8px 0; color: var(--text-secondary); font-size: 13px;">
                  {steps.map((step, idx) => (
                    <li key={idx} style="margin-bottom: 6px;">{step}</li>
                  ))}
                </ol>
              </div>
            );
          })()}
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

              {activeTab === "classification" ? (
                <div style="padding: 8px 0">
                  {confusionMatrix && Array.isArray(confusionMatrix) && (
                    <>
                      <h3 class="run-detail-group-title">Confusion Matrix</h3>
                      <ConfusionMatrix
                        matrix={confusionMatrix.matrix || confusionMatrix}
                        labels={confusionMatrix.labels || confusionMatrix.map((_, i) => `Class ${i}`)}
                      />
                    </>
                  )}
                  {perClassMetrics && Array.isArray(perClassMetrics) && (
                    <>
                      <h3 class="run-detail-group-title" style="margin-top:20px">Per-Class Metrics</h3>
                      <PerClassMetrics metrics={perClassMetrics} />
                    </>
                  )}
                </div>
              ) : (() => {
                // Check if all tags in this tab are singular values (e.g. test metrics)
                const allSingular = currentTags.every((tag) => {
                  const pts = run.scalars[tag];
                  return pts && pts.length <= 1;
                });

                if (allSingular && currentTags.length > 0) {
                  // Render each singular metric as its own bar chart
                  return (
                    <div class="run-detail-charts-grid">
                      {currentTags.map((tag) => {
                        const pts = run.scalars[tag];
                        const val = pts.length === 1
                          ? (typeof pts[0] === "number" ? pts[0] : pts[0].value)
                          : 0;
                        return (
                          <ChartPanel key={tag} title={stripPrefix(tag)}>
                            <BarChart items={[{ label: stripPrefix(tag), value: val }]} />
                          </ChartPanel>
                        );
                      })}
                    </div>
                  );
                }

                return (
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
                );
              })()}
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
