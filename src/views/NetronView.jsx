import { signal } from "@preact/signals";
import { invoke } from "@tauri-apps/api/core";
import { convertFileSrc } from "@tauri-apps/api/core";
import {
  completedRuns,
  selectedRunId,
  selectedRun,
} from "../state/interpretation.js";
import { currentProject } from "../state/projects.js";

const modelSrc = signal(null);
const loading = signal(false);
const error = signal(null);

async function handleLoad() {
  const run = selectedRun.value;
  const project = currentProject.value;
  if (!run || !project) return;

  loading.value = true;
  error.value = null;
  modelSrc.value = null;

  try {
    const projectPath = project.projectPath;
    const runId = run.id;
    const sshCommand =
      project.connectionType === "remote" ? project.sshCommand : null;

    const taskClassMap = {
      Classification: "ImageClassifier",
      "Multi-Label Classification": "ImageClassifier",
      "Object Detection":
        project.detectionArch === "yolox" ? "YOLOXDetector" : "ObjectDetector",
      "Semantic Segmentation": "SemanticSegmentor",
      "Instance Segmentation": "InstanceSegmentor",
    };
    const taskClass = taskClassMap[project.taskType] || "ImageClassifier";

    const ptPath = await invoke("export_jit_model", {
      projectPath,
      runId,
      taskClass,
      sshCommand,
    });

    modelSrc.value = `/netron/index.html?url=${encodeURIComponent(convertFileSrc(ptPath))}`;
  } catch (err) {
    error.value = typeof err === "string" ? err : err.message || "Export failed";
  } finally {
    loading.value = false;
  }
}

function handleClear() {
  modelSrc.value = null;
  error.value = null;
}

export function NetronView() {
  const runs = completedRuns.value;
  const run = selectedRun.value;
  const canLoad = run && !loading.value;

  return (
    <div class="netron-view">
      <div class="netron-toolbar">
        <select
          class="interp-select"
          value={selectedRunId.value}
          onChange={(e) => {
            selectedRunId.value = e.target.value;
            modelSrc.value = null;
            error.value = null;
          }}
        >
          <option value="">Select a completed run…</option>
          {runs.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name || r.id} — {r.model}
            </option>
          ))}
        </select>
        {modelSrc.value && (
          <button class="netron-btn netron-btn-secondary" onClick={handleClear}>
            Clear
          </button>
        )}
        <button
          class="netron-btn netron-btn-primary"
          onClick={handleLoad}
          disabled={!canLoad}
          style="margin-left: auto"
        >
          {loading.value ? "Exporting…" : "Load Model"}
        </button>
      </div>
      {error.value && <div class="interp-error">{error.value}</div>}
      {loading.value ? (
        <div class="netron-loading">
          <div class="netron-loading-spinner" />
          <p class="netron-loading-title">Exporting model…</p>
          <p class="netron-loading-desc">
            Converting checkpoint to TorchScript for visualization
          </p>
        </div>
      ) : modelSrc.value ? (
        <iframe
          class="netron-frame"
          src={modelSrc.value}
          title="Netron Model Viewer"
          sandbox="allow-scripts allow-same-origin allow-popups"
        />
      ) : (
        <div class="netron-empty">
          <div class="netron-empty-icon">
            <svg
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <circle cx="12" cy="5" r="3" />
              <circle cx="5" cy="19" r="3" />
              <circle cx="19" cy="19" r="3" />
              <line x1="12" y1="8" x2="5" y2="16" />
              <line x1="12" y1="8" x2="19" y2="16" />
            </svg>
          </div>
          <p class="netron-empty-title">Netron Model Viewer</p>
          <p class="netron-empty-desc">
            Select a completed run and click "Load Model" to export and
            visualize the model architecture.
          </p>
        </div>
      )}
    </div>
  );
}
