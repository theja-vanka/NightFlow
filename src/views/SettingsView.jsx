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
  "name", "sshCommand", "taskType", "modelCategory",
  "detectionArch", "segHeadType", "datasetFormat",
];

function pick(obj) {
  const out = {};
  for (const k of EDITABLE_KEYS) out[k] = obj[k];
  return out;
}

function isDirty(draft, source) {
  for (const k of EDITABLE_KEYS) {
    if (draft[k] !== source[k]) return true;
  }
  return false;
}

const sunIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`;
const moonIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;
const trashIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`;
const checkIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
const lockIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`;

export function SettingsView() {
  const proj = currentProject.value;
  const [draft, setDraft] = useState(() => proj ? pick(proj) : {});
  const [saved, setSaved] = useState(false);
  const savedTimer = useRef(null);

  // Re-sync draft when switching projects
  useEffect(() => {
    if (proj) setDraft(pick(proj));
  }, [proj?.id]);

  if (!proj) return <div class="settings-view"><p class="settings-empty">No project selected.</p></div>;

  const locked = sshConnected.value;
  const dirty = isDirty(draft, proj);

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

  return (
    <div class="settings-view">
      {locked && (
        <div class="settings-locked-banner">
          <span dangerouslySetInnerHTML={{ __html: lockIcon }} />
          Settings are locked while connected to SSH. Disconnect to make changes.
        </div>
      )}

      {/* General */}
      <section class="settings-section">
        <div class="settings-section-header">
          <h2 class="settings-heading">General</h2>
          <p class="settings-heading-desc">Basic project identity and connection</p>
        </div>
        <div class="settings-card">
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
              <span class="settings-label">SSH Command</span>
              <span class="settings-hint">Remote machine connection string</span>
              <input
                class="settings-input settings-input-mono"
                type="text"
                value={draft.sshCommand}
                placeholder="ssh user@host"
                disabled={locked}
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
              <div class="settings-select-wrap">
                <select
                  class="settings-select"
                  value={draft.taskType}
                  disabled={locked}
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
          <p class="settings-heading-desc">Data format for training pipeline</p>
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
                  value={draft.datasetFormat}
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
