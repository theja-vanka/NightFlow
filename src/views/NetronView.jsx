import { signal } from "@preact/signals";

const modelUrl = signal("");
const loaded = signal(false);

function handleLoad() {
  if (!modelUrl.value.trim()) return;
  loaded.value = true;
}

function handleClear() {
  modelUrl.value = "";
  loaded.value = false;
}

export function NetronView() {
  const src = loaded.value
    ? `https://netron.app/?url=${encodeURIComponent(modelUrl.value.trim())}`
    : null;

  return (
    <div class="netron-view">
      <div class="netron-toolbar">
        <input
          class="netron-url-input"
          type="text"
          placeholder="Paste model URL (.onnx, .pt, .tflite, .pb, ...)"
          value={modelUrl.value}
          onInput={(e) => {
            modelUrl.value = e.target.value;
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleLoad();
          }}
        />
        <button
          class="netron-btn netron-btn-primary"
          onClick={handleLoad}
          disabled={!modelUrl.value.trim()}
        >
          Load
        </button>
        {loaded.value && (
          <button class="netron-btn netron-btn-secondary" onClick={handleClear}>
            Clear
          </button>
        )}
      </div>
      {loaded.value ? (
        <iframe
          class="netron-frame"
          src={src}
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
            Paste a URL to an ONNX, TorchScript, TensorFlow, or other model file
            to visualize its architecture.
          </p>
        </div>
      )}
    </div>
  );
}
