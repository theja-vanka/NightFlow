import { useState, useEffect, useRef } from "preact/hooks";
import { theme, toggleTheme } from "../state/theme.js";
import {
  currentProject,
  updateProject,
  openDeleteDialog,
  TASK_TYPES,
  MODEL_CATEGORIES,
  DATASET_FORMATS,
  DETECTION_ARCHS,
  SEG_HEAD_TYPES,
} from "../state/projects.js";
import { sshConnected } from "../state/dashboard.js";
import { DeleteProjectDialog } from "../components/DeleteProjectDialog.jsx";

const EDITABLE_KEYS = [
  "name", "connectionType", "sshCommand", "projectPath", "modelCategory",
  "detectionArch", "segHeadType", "datasetFormat", "folderPath",
  "trainPath", "valPath", "testPath", "powerUserMode",
  "maxEpochs", "learningRate", "batchSize", "optimizer", "scheduler",
  "weightDecay", "precision", "gradientClipVal", "imageSize",
  "augmentationPreset", "freezeBackbone", "seed",
  "earlyStopping", "earlyStoppingPatience", "earlyStoppingMonitor",
];

// Read-only fields that need to be included in draft for rendering
const READONLY_KEYS = ["taskType"];

function pick(obj) {
  const out = {};
  // Include editable fields
  for (const k of EDITABLE_KEYS) {
    // Provide default values for fields that might not exist in older projects
    out[k] = obj[k] !== undefined ? obj[k] : "";
  }
  // Include read-only fields (needed for rendering but not editable)
  for (const k of READONLY_KEYS) {
    out[k] = obj[k];
  }
  return out;
}

function isDirty(draft, source) {
  for (const k of EDITABLE_KEYS) {
    if (draft[k] !== source[k]) return true;
  }
  return false;
}

const PATH_BASE = "~/nightforge/projects/";
const sanitizeForPath = (n) => n.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

const sunIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`;
const moonIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;
const trashIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`;
const checkIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
const lockIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`;

export function SettingsView() {
  const proj = currentProject.value;
  const [draft, setDraft] = useState(() => {
    if (!proj) return {};
    const pickedData = pick(proj);
    // Ensure critical fields have values for proper rendering
    if (!pickedData.connectionType) pickedData.connectionType = "localhost";
    if (!pickedData.sshCommand) pickedData.sshCommand = "localhost";
    if (!pickedData.taskType) pickedData.taskType = "Classification";
    if (!pickedData.modelCategory) pickedData.modelCategory = "Edge";
    if (!pickedData.datasetFormat) pickedData.datasetFormat = "Folder";
    if (!pickedData.detectionArch) pickedData.detectionArch = "fcos";
    if (!pickedData.segHeadType) pickedData.segHeadType = "deeplabv3plus";
    return pickedData;
  });
  const [saved, setSaved] = useState(false);
  const savedTimer = useRef(null);

  // Re-sync draft when switching projects
  useEffect(() => {
    if (proj) {
      const pickedData = pick(proj);
      // Ensure critical fields have values for proper rendering
      if (!pickedData.connectionType) pickedData.connectionType = "localhost";
      if (!pickedData.sshCommand) pickedData.sshCommand = "localhost";
      if (!pickedData.taskType) pickedData.taskType = "Classification";
      if (!pickedData.modelCategory) pickedData.modelCategory = "Edge";
      if (!pickedData.datasetFormat) pickedData.datasetFormat = "Folder";
      if (!pickedData.detectionArch) pickedData.detectionArch = "fcos";
      if (!pickedData.segHeadType) pickedData.segHeadType = "deeplabv3plus";
      setDraft(pickedData);
    }
  }, [proj?.id]);

  if (!proj) return <div class="settings-view"><p class="settings-empty">No project selected.</p></div>;

  const [activeTab, setActiveTab] = useState("general");
  const locked = sshConnected.value;
  const dirty = isDirty(draft, proj);

  // Reset to general tab if power user mode is turned off
  useEffect(() => {
    if (!draft.powerUserMode && activeTab === "advanced") {
      setActiveTab("general");
    }
  }, [draft.powerUserMode]);

  function set(key, value) {
    setDraft((d) => ({ ...d, [key]: value }));
    setSaved(false);
  }

  function onTaskTypeChange(newTask) {
    const formats = DATASET_FORMATS[newTask] || [];
    const formatStillValid = formats.some((f) => f.id === draft.datasetFormat);
    setDraft((d) => ({
      ...d,
      taskType: newTask,
      datasetFormat: formatStillValid ? d.datasetFormat : "",
    }));
    setSaved(false);
  }

  async function handleSave() {
    try {
      await updateProject(proj.id, { ...draft });
      setSaved(true);
      clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setSaved(false), 2000);
    } catch (error) {
      console.error("Error saving project:", error);
      // Could show an error message to user here
    }
  }

  function handleDiscard() {
    setDraft(pick(proj));
    setSaved(false);
  }

  const isDetection = draft.taskType === "Object Detection";
  const isSegmentation =
    draft.taskType === "Semantic Segmentation" ||
    draft.taskType === "Instance Segmentation";
  const datasetFormats = DATASET_FORMATS[draft.taskType] || [];
  const modelCatDesc = draft.modelCategory
    ? MODEL_CATEGORIES[draft.modelCategory]?.desc
    : null;

  const derivedProjectPath = draft.name ? `${PATH_BASE}${sanitizeForPath(draft.name)}` : PATH_BASE;

  return (
    <div class="settings-view">
      {locked && (
        <div class="settings-locked-banner">
          <span dangerouslySetInnerHTML={{ __html: lockIcon }} />
          Settings are locked while connected. Disconnect to make changes.
        </div>
      )}

      {/* Tab navigation — only show tabs when power user mode is on */}
      {draft.powerUserMode && (
        <div class="settings-tabs">
          <button
            class={`settings-tab ${activeTab === "general" ? "settings-tab--active" : ""}`}
            onClick={() => setActiveTab("general")}
          >
            General
          </button>
          <button
            class={`settings-tab ${activeTab === "advanced" ? "settings-tab--active" : ""}`}
            onClick={() => setActiveTab("advanced")}
          >
            Advanced Training
          </button>
        </div>
      )}

      {/* ─── General Tab ─── */}
      {activeTab === "general" && (
      <>

      {/* General */}
      <section class="settings-section">
        <div class="settings-section-header">
          <h2 class="settings-heading">General</h2>
          <p class="settings-heading-desc">Basic project identity and connection</p>
        </div>
        <div class="settings-card">
          <div class="settings-card-row">
            <label class="settings-field">
              <span class="settings-label">Project ID</span>
              <span class="settings-hint">Unique identifier (read-only)</span>
              <input
                class="settings-input settings-input-mono"
                type="text"
                value={proj.id}
                disabled
                readOnly
              />
            </label>
          </div>
          <div class="settings-card-divider" />
          <div class="settings-card-row">
            <label class="settings-field">
              <span class="settings-label">Project Name</span>
              <input
                class="settings-input"
                type="text"
                value={draft.name}
                placeholder="My Project"
                disabled={locked}
                onInput={(e) => set("name", e.target.value)}
              />
            </label>
          </div>
          <div class="settings-card-divider" />
          <div class="settings-card-row">
            <label class="settings-field">
              <span class="settings-label">Project Path</span>
              <input
                class="settings-input settings-input-mono"
                type="text"
                value={draft.projectPath || ""}
                placeholder={derivedProjectPath}
                disabled={locked}
                onInput={(e) => set("projectPath", e.target.value)}
              />
            </label>
          </div>
          <div class="settings-card-divider" />
          <div class="settings-card-row settings-row-grid">
            <label class="settings-field">
              <span class="settings-label">Connection Type</span>
              <span class="settings-hint">Where to run training</span>
              <div class="settings-select-wrap">
                <select
                  class="settings-select"
                  value={draft.connectionType || "localhost"}
                  disabled={locked}
                  onChange={(e) => {
                    const newType = e.target.value;
                    set("connectionType", newType);
                    if (newType === "localhost") {
                      set("sshCommand", "localhost");
                    } else if (draft.sshCommand === "localhost") {
                      set("sshCommand", "");
                    }
                  }}
                >
                  <option value="localhost">Localhost</option>
                  <option value="remote">Remote Instance</option>
                </select>
              </div>
            </label>
            <label class="settings-field">
              <span class="settings-label">SSH Command</span>
              <span class="settings-hint">
                {draft.connectionType === "remote" ? "Remote machine connection string" : "Set to localhost"}
              </span>
              <input
                class="settings-input settings-input-mono"
                type="text"
                value={draft.sshCommand}
                placeholder={draft.connectionType === "remote" ? "ssh user@host" : "localhost"}
                disabled={locked || draft.connectionType !== "remote"}
                onInput={(e) => set("sshCommand", e.target.value)}
              />
            </label>
          </div>
        </div>
      </section>

      {/* Training */}
      <section class="settings-section">
        <div class="settings-section-header">
          <h2 class="settings-heading">Training</h2>
          <p class="settings-heading-desc">Task configuration and model selection</p>
        </div>
        <div class="settings-card">
          <div class="settings-card-row settings-row-grid">
            <label class="settings-field">
              <span class="settings-label">Task Type</span>
              <span class="settings-hint">Set at project creation (read-only)</span>
              <div class="settings-select-wrap">
                <select
                  class="settings-select"
                  value={draft.taskType}
                  disabled
                  onChange={(e) => onTaskTypeChange(e.target.value)}
                >
                  {TASK_TYPES.map((t) => (
                    <option key={t.id} value={t.id}>{t.label}</option>
                  ))}
                </select>
                <span class="settings-select-chevron" />
              </div>
            </label>
            <label class="settings-field">
              <span class="settings-label">Model Category</span>
              <span class="settings-hint">Deployment target tier</span>
              <div class="settings-select-wrap">
                <select
                  class="settings-select"
                  value={draft.modelCategory}
                  disabled={locked}
                  onChange={(e) => set("modelCategory", e.target.value)}
                >
                  <option value="">Select category</option>
                  {Object.keys(MODEL_CATEGORIES).map((k) => (
                    <option key={k} value={k}>{k}</option>
                  ))}
                </select>
                <span class="settings-select-chevron" />
              </div>
            </label>
          </div>
          {modelCatDesc && (
            <div class="settings-card-note">{modelCatDesc}</div>
          )}

          {isDetection && (
            <>
              <div class="settings-card-divider" />
              <div class="settings-card-row">
                <label class="settings-field">
                  <span class="settings-label">Detection Architecture</span>
                  <div class="settings-select-wrap settings-select-narrow">
                    <select
                      class="settings-select"
                      value={draft.detectionArch}
                      disabled={locked}
                      onChange={(e) => set("detectionArch", e.target.value)}
                    >
                      {DETECTION_ARCHS.map((a) => (
                        <option key={a} value={a}>{a}</option>
                      ))}
                    </select>
                    <span class="settings-select-chevron" />
                  </div>
                </label>
              </div>
            </>
          )}
          {isSegmentation && (
            <>
              <div class="settings-card-divider" />
              <div class="settings-card-row">
                <label class="settings-field">
                  <span class="settings-label">Segmentation Head</span>
                  <div class="settings-select-wrap settings-select-narrow">
                    <select
                      class="settings-select"
                      value={draft.segHeadType}
                      disabled={locked}
                      onChange={(e) => set("segHeadType", e.target.value)}
                    >
                      {SEG_HEAD_TYPES.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                    <span class="settings-select-chevron" />
                  </div>
                </label>
              </div>
            </>
          )}
        </div>
      </section>

      {/* Dataset */}
      <section class="settings-section">
        <div class="settings-section-header">
          <h2 class="settings-heading">Dataset</h2>
          <p class="settings-heading-desc">Data format and paths for training pipeline</p>
        </div>
        <div class="settings-card">
          <div class="settings-card-row">
            <label class="settings-field">
              <span class="settings-label">Format</span>
              <span class="settings-hint">
                {datasetFormats.length} format{datasetFormats.length !== 1 ? "s" : ""} available for {draft.taskType}
              </span>
              <div class="settings-select-wrap">
                <select
                  class="settings-select"
                  value={draft.datasetFormat || ""}
                  disabled={locked}
                  onChange={(e) => set("datasetFormat", e.target.value)}
                >
                  <option value="">Select format</option>
                  {datasetFormats.map((f) => (
                    <option key={f.id} value={f.id}>{f.label}</option>
                  ))}
                </select>
                <span class="settings-select-chevron" />
              </div>
            </label>
          </div>

          {draft.datasetFormat && draft.datasetFormat !== "CSV" && draft.datasetFormat !== "JSONL" && (
            <>
              <div class="settings-card-divider" />
              <div class="settings-card-row">
                <label class="settings-field">
                  <span class="settings-label">Dataset Folder Path</span>
                  <span class="settings-hint">Path to {draft.datasetFormat} dataset folder</span>
                  <input
                    class="settings-input settings-input-mono"
                    type="text"
                    value={draft.folderPath || ""}
                    placeholder="/path/to/dataset"
                    disabled={locked}
                    onInput={(e) => set("folderPath", e.target.value)}
                  />
                </label>
              </div>
            </>
          )}

          {(draft.datasetFormat === "CSV" || draft.datasetFormat === "JSONL") && (
            <>
              <div class="settings-card-divider" />
              <div class="settings-card-row">
                <label class="settings-field">
                  <span class="settings-label">Train Path</span>
                  <span class="settings-hint">Path to training data file</span>
                  <input
                    class="settings-input settings-input-mono"
                    type="text"
                    value={draft.trainPath || ""}
                    placeholder={`/path/to/train.${draft.datasetFormat.toLowerCase()}`}
                    disabled={locked}
                    onInput={(e) => set("trainPath", e.target.value)}
                  />
                </label>
              </div>
              <div class="settings-card-divider" />
              <div class="settings-card-row">
                <label class="settings-field">
                  <span class="settings-label">Val Path</span>
                  <span class="settings-hint">Path to validation data file (optional)</span>
                  <input
                    class="settings-input settings-input-mono"
                    type="text"
                    value={draft.valPath || ""}
                    placeholder={`/path/to/val.${draft.datasetFormat.toLowerCase()}`}
                    disabled={locked}
                    onInput={(e) => set("valPath", e.target.value)}
                  />
                </label>
              </div>
              <div class="settings-card-divider" />
              <div class="settings-card-row">
                <label class="settings-field">
                  <span class="settings-label">Test Path</span>
                  <span class="settings-hint">Path to test data file</span>
                  <input
                    class="settings-input settings-input-mono"
                    type="text"
                    value={draft.testPath || ""}
                    placeholder={`/path/to/test.${draft.datasetFormat.toLowerCase()}`}
                    disabled={locked}
                    onInput={(e) => set("testPath", e.target.value)}
                  />
                </label>
              </div>
            </>
          )}
        </div>
      </section>

      {/* Appearance */}
      <section class="settings-section">
        <div class="settings-section-header">
          <h2 class="settings-heading">Appearance</h2>
          <p class="settings-heading-desc">Visual preferences</p>
        </div>
        <div class="settings-card">
          <div class="settings-card-row settings-row-between">
            <div>
              <div class="settings-label">Theme</div>
              <div class="settings-desc">Switch between dark and light mode</div>
            </div>
            <button class="settings-theme-btn" onClick={toggleTheme}>
              <span
                class="settings-theme-icon"
                dangerouslySetInnerHTML={{ __html: theme.value === "dark" ? sunIcon : moonIcon }}
              />
              {theme.value === "dark" ? "Dark" : "Light"}
            </button>
          </div>
          <div class="settings-card-divider" />
          <div class="settings-card-row settings-row-between">
            <div>
              <div class="settings-label">Power User Mode</div>
              <div class="settings-desc">Enable advanced features and controls</div>
            </div>
            <button
              class="settings-theme-btn"
              disabled={locked}
              onClick={() => set("powerUserMode", !draft.powerUserMode)}
            >
              {draft.powerUserMode ? "On" : "Off"}
            </button>
          </div>
        </div>
      </section>

      {/* Early Stopping */}
      <section class="settings-section">
        <div class="settings-section-header">
          <h2 class="settings-heading">Early Stopping</h2>
          <p class="settings-heading-desc">Stop training when a metric stops improving</p>
        </div>
        <div class="settings-card">
          <div class="settings-card-row settings-row-between">
            <div>
              <div class="settings-label">Enable Early Stopping</div>
              <div class="settings-desc">Halt training after patience epochs with no improvement</div>
            </div>
            <button
              class="settings-theme-btn"
              disabled={locked}
              onClick={() => set("earlyStopping", !draft.earlyStopping)}
            >
              {draft.earlyStopping ? "On" : "Off"}
            </button>
          </div>
          {draft.earlyStopping && (
            <>
              <div class="settings-card-divider" />
              <div class="settings-card-row settings-row-grid">
                <label class="settings-field">
                  <span class="settings-label">Monitor Metric</span>
                  <span class="settings-hint">Metric to watch for improvement</span>
                  <div class="settings-select-wrap">
                    <select
                      class="settings-select"
                      value={draft.earlyStoppingMonitor}
                      disabled={locked}
                      onChange={(e) => set("earlyStoppingMonitor", e.target.value)}
                    >
                      <option value="val/loss">Validation Loss</option>
                      <option value="val/accuracy">Validation Accuracy</option>
                    </select>
                    <span class="settings-select-chevron" />
                  </div>
                </label>
                <label class="settings-field">
                  <span class="settings-label">Patience</span>
                  <span class="settings-hint">Epochs to wait before stopping (default 10)</span>
                  <input
                    class="settings-input"
                    type="number"
                    min="1"
                    value={draft.earlyStoppingPatience}
                    placeholder="10"
                    disabled={locked}
                    onInput={(e) => set("earlyStoppingPatience", e.target.value === "" ? "" : Number(e.target.value))}
                  />
                </label>
              </div>
            </>
          )}
        </div>
      </section>

      {/* Danger Zone */}
      <section class="settings-section">
        <div class="settings-danger">
          <div class="settings-danger-header">
            <h2 class="settings-heading">Danger Zone</h2>
          </div>
          <div class="settings-card-row settings-row-between">
            <div>
              <div class="settings-label">Delete this project</div>
              <div class="settings-desc">
                Once deleted, this project and all associated data cannot be recovered.
              </div>
            </div>
            <button
              class="settings-danger-btn"
              disabled={locked}
              onClick={() => openDeleteDialog(proj.id)}
            >
              <span dangerouslySetInnerHTML={{ __html: trashIcon }} />
              Delete Project
            </button>
          </div>
        </div>
      </section>

      </>
      )}

      {/* ─── Advanced Training Tab ─── */}
      {activeTab === "advanced" && draft.powerUserMode && (
        <>
          <section class="settings-section">
            <div class="settings-section-header">
              <h2 class="settings-heading">Training Basics</h2>
              <p class="settings-heading-desc">Core hyperparameters for the training loop</p>
            </div>
            <div class="settings-card">
              <div class="settings-card-row settings-row-grid">
                <label class="settings-field">
                  <span class="settings-label">Max Epochs</span>
                  <span class="settings-hint">Number of training epochs</span>
                  <input
                    class="settings-input"
                    type="number"
                    min="1"
                    value={draft.maxEpochs}
                    disabled={locked}
                    onInput={(e) => set("maxEpochs", e.target.value === "" ? "" : Number(e.target.value))}
                  />
                </label>
                <label class="settings-field">
                  <span class="settings-label">Learning Rate</span>
                  <span class="settings-hint">Leave empty for AutoTimm default</span>
                  <input
                    class="settings-input"
                    type="number"
                    step="any"
                    value={draft.learningRate}
                    placeholder="auto"
                    disabled={locked}
                    onInput={(e) => set("learningRate", e.target.value === "" ? "" : Number(e.target.value))}
                  />
                </label>
              </div>
              <div class="settings-card-divider" />
              <div class="settings-card-row settings-row-grid">
                <label class="settings-field">
                  <span class="settings-label">Batch Size</span>
                  <span class="settings-hint">Samples per training step</span>
                  <input
                    class="settings-input"
                    type="number"
                    min="1"
                    value={draft.batchSize}
                    placeholder="auto"
                    disabled={locked}
                    onInput={(e) => set("batchSize", e.target.value === "" ? "" : Number(e.target.value))}
                  />
                </label>
                <label class="settings-field">
                  <span class="settings-label">Weight Decay</span>
                  <span class="settings-hint">L2 regularization factor</span>
                  <input
                    class="settings-input"
                    type="number"
                    step="any"
                    value={draft.weightDecay}
                    placeholder="auto"
                    disabled={locked}
                    onInput={(e) => set("weightDecay", e.target.value === "" ? "" : Number(e.target.value))}
                  />
                </label>
              </div>
              <div class="settings-card-divider" />
              <div class="settings-card-row settings-row-grid">
                <label class="settings-field">
                  <span class="settings-label">Optimizer</span>
                  <span class="settings-hint">Optimization algorithm</span>
                  <div class="settings-select-wrap">
                    <select
                      class="settings-select"
                      value={draft.optimizer}
                      disabled={locked}
                      onChange={(e) => set("optimizer", e.target.value)}
                    >
                      <option value="">Auto (default)</option>
                      <option value="adamw">AdamW</option>
                      <option value="adam">Adam</option>
                      <option value="sgd">SGD</option>
                    </select>
                    <span class="settings-select-chevron" />
                  </div>
                </label>
                <label class="settings-field">
                  <span class="settings-label">Scheduler</span>
                  <span class="settings-hint">Learning rate schedule</span>
                  <div class="settings-select-wrap">
                    <select
                      class="settings-select"
                      value={draft.scheduler}
                      disabled={locked}
                      onChange={(e) => set("scheduler", e.target.value)}
                    >
                      <option value="">Auto (default)</option>
                      <option value="cosine">Cosine</option>
                      <option value="step">Step</option>
                      <option value="onecycle">OneCycle</option>
                      <option value="none">None</option>
                    </select>
                    <span class="settings-select-chevron" />
                  </div>
                </label>
              </div>
            </div>
          </section>

          <section class="settings-section">
            <div class="settings-section-header">
              <h2 class="settings-heading">Precision & Data</h2>
              <p class="settings-heading-desc">Mixed precision, image size, and augmentation</p>
            </div>
            <div class="settings-card">
              <div class="settings-card-row settings-row-grid">
                <label class="settings-field">
                  <span class="settings-label">Precision</span>
                  <span class="settings-hint">Floating-point precision</span>
                  <div class="settings-select-wrap">
                    <select
                      class="settings-select"
                      value={draft.precision}
                      disabled={locked}
                      onChange={(e) => set("precision", e.target.value)}
                    >
                      <option value="">Auto (default)</option>
                      <option value="32">32-bit (float32)</option>
                      <option value="16-mixed">16-mixed (AMP)</option>
                      <option value="bf16-mixed">bf16-mixed</option>
                    </select>
                    <span class="settings-select-chevron" />
                  </div>
                </label>
                <label class="settings-field">
                  <span class="settings-label">Image Size</span>
                  <span class="settings-hint">Input resolution (px)</span>
                  <input
                    class="settings-input"
                    type="number"
                    min="1"
                    value={draft.imageSize}
                    placeholder="auto"
                    disabled={locked}
                    onInput={(e) => set("imageSize", e.target.value === "" ? "" : Number(e.target.value))}
                  />
                </label>
              </div>
              <div class="settings-card-divider" />
              <div class="settings-card-row settings-row-grid">
                <label class="settings-field">
                  <span class="settings-label">Augmentation Preset</span>
                  <span class="settings-hint">Data augmentation strategy</span>
                  <div class="settings-select-wrap">
                    <select
                      class="settings-select"
                      value={draft.augmentationPreset}
                      disabled={locked}
                      onChange={(e) => set("augmentationPreset", e.target.value)}
                    >
                      <option value="">Auto (default)</option>
                      <option value="default">Default</option>
                      <option value="autoaugment">AutoAugment</option>
                      <option value="randaugment">RandAugment</option>
                      <option value="trivialaugment">TrivialAugment</option>
                    </select>
                    <span class="settings-select-chevron" />
                  </div>
                </label>
                <label class="settings-field">
                  <span class="settings-label">Gradient Clip</span>
                  <span class="settings-hint">Max gradient norm</span>
                  <input
                    class="settings-input"
                    type="number"
                    step="any"
                    value={draft.gradientClipVal}
                    placeholder="auto"
                    disabled={locked}
                    onInput={(e) => set("gradientClipVal", e.target.value === "" ? "" : Number(e.target.value))}
                  />
                </label>
              </div>
            </div>
          </section>

          <section class="settings-section">
            <div class="settings-section-header">
              <h2 class="settings-heading">Advanced</h2>
              <p class="settings-heading-desc">Backbone freezing and reproducibility</p>
            </div>
            <div class="settings-card">
              <div class="settings-card-row settings-row-between">
                <div>
                  <div class="settings-label">Freeze Backbone</div>
                  <div class="settings-desc">Freeze pretrained backbone weights during training</div>
                </div>
                <button
                  class="settings-theme-btn"
                  disabled={locked}
                  onClick={() => set("freezeBackbone", !draft.freezeBackbone)}
                >
                  {draft.freezeBackbone ? "On" : "Off"}
                </button>
              </div>
              <div class="settings-card-divider" />
              <div class="settings-card-row">
                <label class="settings-field">
                  <span class="settings-label">Seed</span>
                  <span class="settings-hint">Random seed for reproducibility (leave empty for random)</span>
                  <input
                    class="settings-input"
                    type="number"
                    min="0"
                    value={draft.seed}
                    placeholder="random"
                    disabled={locked}
                    onInput={(e) => set("seed", e.target.value === "" ? "" : Number(e.target.value))}
                  />
                </label>
              </div>
            </div>
          </section>
        </>
      )}

      {/* Save bar */}
      <div class={`settings-save-bar ${dirty || saved ? "visible" : ""}`}>
        {saved ? (
          <div class="settings-saved-msg">
            <span dangerouslySetInnerHTML={{ __html: checkIcon }} />
            Changes saved
          </div>
        ) : (
          <>
            <span class="settings-save-hint">You have unsaved changes</span>
            <div class="settings-save-actions">
              <button class="settings-discard-btn" onClick={handleDiscard}>Discard</button>
              <button class="settings-save-btn" disabled={locked} onClick={handleSave}>Save Changes</button>
            </div>
          </>
        )}
      </div>

      <DeleteProjectDialog />
    </div>
  );
}
