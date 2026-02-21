import {
  trainingActive,
  trainingReconnected,
  trainingEvent,
  trainingEpoch,
  trainingMaxEpochs,
  trainingStep,
  trainingLoss,
  trainingProgress,
  trainingError,
  trainingFastDevRun,
  stopTraining,
} from "../state/training.js";

function ProgressBar({ value }) {
  return (
    <div class="training-progress-track">
      <div
        class="training-progress-fill"
        style={{ width: `${Math.min(value, 100)}%` }}
      />
    </div>
  );
}

function StatusLabel({ event, reconnected }) {
  const labels = {
    tuning_started: "Auto-tuning...",
    tuning_complete: "Tuning complete",
    training_started: "Starting...",
    epoch_started: "Training",
    batch_end: "Training",
    epoch_end: "Epoch complete",
    validation_end: "Validating",
    training_complete: "Complete",
    training_error: "Failed",
    stopped: "Stopped",
  };
  const label = labels[event] || "Idle";
  return (
    <span class="training-status-label">
      {reconnected ? `Reconnected \u00b7 ${label}` : label}
    </span>
  );
}

export function TrainingPanel() {
  const active = trainingActive.value;
  const reconnected = trainingReconnected.value;
  const event = trainingEvent.value;
  const error = trainingError.value;

  // Don't show if nothing has happened
  if (!active && !event) return null;

  const epoch = trainingEpoch.value;
  const maxEpochs = trainingMaxEpochs.value;
  const step = trainingStep.value;
  const loss = trainingLoss.value;
  const progress = trainingProgress.value;
  const fastDev = trainingFastDevRun.value;

  const isError = event === "training_error" || event === "stopped";
  const isDone = event === "training_complete";

  return (
    <div class={`training-panel${isError ? " training-panel--error" : isDone ? " training-panel--done" : reconnected ? " training-panel--reconnected" : ""}`}>
      <div class="training-panel-header">
        <div class="training-panel-title-row">
          {active && <div class={`training-panel-spinner${reconnected ? " training-panel-spinner--reconnected" : ""}`} />}
          <span class="training-panel-title">
            {fastDev ? "Fast Dev Run" : "Training"}
          </span>
          <StatusLabel event={event} reconnected={reconnected} />
        </div>
        {active && (
          <button class="training-stop-btn" onClick={stopTraining}>
            Stop
          </button>
        )}
      </div>

      {active && (
        <>
          <ProgressBar value={progress} />
          <div class="training-panel-stats">
            <div class="training-stat">
              <span class="training-stat-label">Epoch</span>
              <span class="training-stat-value">
                {epoch + 1} / {maxEpochs}
              </span>
            </div>
            <div class="training-stat">
              <span class="training-stat-label">Step</span>
              <span class="training-stat-value">{step}</span>
            </div>
            {loss != null && (
              <div class="training-stat">
                <span class="training-stat-label">Loss</span>
                <span class="training-stat-value">{loss.toFixed(4)}</span>
              </div>
            )}
          </div>
        </>
      )}

      {isError && error && (
        <div class="training-panel-error">{error}</div>
      )}

      {isDone && (
        <div class="training-panel-done-msg">Training finished successfully.</div>
      )}
    </div>
  );
}
