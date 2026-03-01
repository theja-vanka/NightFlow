import { useRef } from "preact/hooks";
import { convertFileSrc } from "@tauri-apps/api/core";
import {
  INTERPRETATION_METHODS,
  completedRuns,
  selectedRunId,
  selectedRun,
  uploadedImage,
  selectRun,
  setImage,
  clearImage,
  runInterpretation,
  interpretationLoading,
  interpretationResult,
  interpretationError,
} from "../state/interpretation.js";

function UploadZone() {
  const fileRef = useRef(null);

  function handleDrop(e) {
    e.preventDefault();
    const file = e.dataTransfer?.files?.[0];
    if (file && file.type.startsWith("image/")) setImage(file);
  }

  function handleDragOver(e) {
    e.preventDefault();
  }

  function handleClick() {
    fileRef.current?.click();
  }

  function handleChange(e) {
    const file = e.target.files?.[0];
    if (file) setImage(file);
  }

  return (
    <div
      class="interp-upload"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onClick={handleClick}
    >
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        style="display:none"
        onChange={handleChange}
      />
      <svg
        width="48"
        height="48"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
        style="opacity:0.3"
      >
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <polyline points="21 15 16 10 5 21" />
      </svg>
      <p class="interp-upload-title">Drop an image here or click to browse</p>
      <p class="interp-upload-hint">Supports PNG, JPG, WEBP</p>
    </div>
  );
}

function ResultsPanel() {
  const image = uploadedImage.value;
  const result = interpretationResult.value;
  const loading = interpretationLoading.value;
  const hasResult = result && result.results;
  const showMethods = hasResult || loading;

  return (
    <div class="interp-results-wrap">
      {loading && (
        <div class="interp-loading-overlay">
          <div class="interp-spinner" />
          <p>Running interpretation…</p>
        </div>
      )}
      {hasResult && result.predicted_class !== undefined && (
        <div class="interp-predicted-class">
          Predicted class: <strong>{result.predicted_class}</strong>
        </div>
      )}
      <div class="interp-results">
        <div class="interp-panel">
          <div class="interp-panel-label">Original</div>
          <div class="interp-image-wrap">
            <img class="interp-image" src={image.url} alt={image.name} />
          </div>
        </div>
        {showMethods &&
          INTERPRETATION_METHODS.map((m) => {
            const hasMethodResult = hasResult && result.results[m.id];
            const methodError =
              hasResult && result.errors && result.errors[m.id];

            return (
              <div class="interp-panel" key={m.id}>
                <div class="interp-panel-label">{m.label}</div>
                <div class="interp-image-wrap">
                  {hasMethodResult ? (
                    <img
                      class="interp-image"
                      src={convertFileSrc(result.results[m.id])}
                      alt={m.label}
                    />
                  ) : (
                    <img
                      class="interp-image"
                      src={image.url}
                      alt={m.label}
                      style={loading ? { opacity: 0.4 } : undefined}
                    />
                  )}
                  {methodError && (
                    <div class="interp-method-error">
                      <span>{methodError}</span>
                    </div>
                  )}
                </div>
                <div class="interp-panel-desc">{m.desc}</div>
              </div>
            );
          })}
      </div>
      {interpretationError.value && (
        <div class="interp-error">{interpretationError.value}</div>
      )}
    </div>
  );
}

export function InterpretationView() {
  const fileRef = useRef(null);
  const runs = completedRuns.value;
  const run = selectedRun.value;
  const image = uploadedImage.value;
  const loading = interpretationLoading.value;
  const canRun = run && image && !loading;

  function handleChangeImage(e) {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith("image/")) {
      clearImage();
      setImage(file);
    }
    e.target.value = "";
  }

  return (
    <div class="interp-view">
      <div class="interp-toolbar">
        <select
          class="interp-select"
          value={selectedRunId.value}
          onChange={(e) => selectRun(e.target.value)}
        >
          <option value="">Select a completed run…</option>
          {runs.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name || r.id} — {r.model}
            </option>
          ))}
        </select>
        {image && (
          <>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              style="display:none"
              onChange={handleChangeImage}
            />
            <button
              class="interp-clear-btn"
              onClick={() => fileRef.current?.click()}
            >
              Change Image
            </button>
            <button class="interp-clear-btn" onClick={clearImage}>
              Clear Image
            </button>
          </>
        )}
        <button
          class="interp-run-btn"
          disabled={!canRun}
          onClick={runInterpretation}
        >
          {loading ? "Running…" : "Run Interpretation"}
        </button>
      </div>
      <div class="interp-body">
        {image ? <ResultsPanel /> : <UploadZone />}
      </div>
    </div>
  );
}
