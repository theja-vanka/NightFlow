import { useRef } from "preact/hooks";
import {
  INTERPRETATION_METHODS,
  completedRuns,
  selectedRunId,
  uploadedImage,
  selectRun,
  setImage,
  clearImage,
} from "../state/interpretation.js";

const HEATMAP_GRADIENTS = {
  gradcam: "radial-gradient(circle at 45% 40%, rgba(255,0,0,0.55) 0%, rgba(255,255,0,0.3) 35%, transparent 70%)",
  gradcampp: "radial-gradient(ellipse at 50% 45%, rgba(255,0,0,0.5) 0%, rgba(255,165,0,0.35) 30%, rgba(255,255,0,0.2) 50%, transparent 75%)",
  integrated_gradients: "linear-gradient(135deg, rgba(0,0,255,0.4) 0%, rgba(0,255,255,0.3) 25%, rgba(0,255,0,0.3) 50%, rgba(255,255,0,0.3) 75%, rgba(255,0,0,0.4) 100%)",
  smoothgrad: "radial-gradient(circle at 50% 50%, rgba(255,80,80,0.4) 0%, rgba(255,200,50,0.25) 40%, transparent 65%)",
  attention_rollout: "conic-gradient(from 0deg at 50% 50%, rgba(255,0,0,0.4), rgba(255,165,0,0.3), rgba(255,255,0,0.2), rgba(0,128,0,0.15), rgba(0,0,255,0.2), rgba(128,0,128,0.3), rgba(255,0,0,0.4))",
  attention_flow: "radial-gradient(circle at 35% 35%, rgba(128,0,255,0.5) 0%, rgba(0,100,255,0.3) 40%, transparent 70%), radial-gradient(circle at 65% 60%, rgba(255,0,128,0.4) 0%, transparent 50%)",
};

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
    <div class="interp-upload" onDrop={handleDrop} onDragOver={handleDragOver} onClick={handleClick}>
      <input ref={fileRef} type="file" accept="image/*" style="display:none" onChange={handleChange} />
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.3">
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

  return (
    <div class="interp-results-wrap">
      <div class="interp-results">
        <div class="interp-panel">
          <div class="interp-panel-label">Original</div>
          <div class="interp-image-wrap">
            <img class="interp-image" src={image.url} alt={image.name} />
          </div>
        </div>
        {INTERPRETATION_METHODS.map((m) => (
          <div class="interp-panel" key={m.id}>
            <div class="interp-panel-label">{m.label}</div>
            <div class="interp-image-wrap">
              <img class="interp-image" src={image.url} alt={m.label} />
              <div class="interp-heatmap" style={{ background: HEATMAP_GRADIENTS[m.id] }} />
            </div>
            <div class="interp-panel-desc">{m.desc}</div>
          </div>
        ))}
      </div>
      <div class="interp-info">
        <span class="interp-info-file">{image.name}</span>
      </div>
      <button class="interp-clear-btn" onClick={clearImage}>Clear Image</button>
    </div>
  );
}

export function InterpretationView() {
  const runs = completedRuns.value;

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
              {r.id} — {r.model}
            </option>
          ))}
        </select>
      </div>
      <div class="interp-body">
        {uploadedImage.value ? <ResultsPanel /> : <UploadZone />}
      </div>
    </div>
  );
}
