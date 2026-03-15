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
  trainingMetrics,
  trainingTestMetrics,
  trainingTestBatch,
  trainingTestTotalBatches,
  trainingTestProgress,
  trainingEstimatedRemaining,
  trainingTestOnly,
  stopTraining,
} from "../state/training.js";

function formatDuration(ms) {
  if (ms == null || ms <= 0) return null;
  const totalMin = Math.floor(ms / 60000);
  if (totalMin < 1) return "< 1m";
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

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
    preparing: "Starting...",
    tuning_started: "Auto-tuning...",
    tuning_complete: "Tuning complete",
    training_started: "Starting...",
    testing_started: "Running tests...",
    test_batch_end: "Testing",
    testing_complete: "Testing complete",
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
  const metrics = trainingMetrics.value;

  const testOnly = trainingTestOnly.value;
  const isError = event === "training_error" || event === "stopped";
  const isDone = event === "training_complete";

  const showTest = event === "testing_started" || event === "test_batch_end" || event === "testing_complete";

  // For test-only runs, skip the training panel entirely
  if (testOnly) {
    return (
      <>
        {/* Test / Evaluation panel for test-only runs */}
        <div class={`training-panel${isError ? " training-panel--error" : (isDone || event === "testing_complete") ? " training-panel--done" : ""}`}>
          <div class="training-panel-header">
            <div class="training-panel-title-row">
              {active && event !== "testing_complete" && <div class="training-panel-spinner" />}
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style="margin-right:4px">
                <path d="M6.5 1.75a.75.75 0 0 1 .75-.75h1.5a.75.75 0 0 1 .75.75V4h2.75a.75.75 0 0 1 .53 1.28l-4.5 4.5a.75.75 0 0 1-1.06 0l-4.5-4.5A.75.75 0 0 1 2.75 4H5.5V1.75Z" fill="currentColor" opacity="0.5"/>
                <path d="M2 13.25a.75.75 0 0 1 .75-.75h10.5a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1-.75-.75Z" fill="currentColor"/>
              </svg>
              <span class="training-panel-title">Evaluation</span>
              {event === "testing_complete" || isDone ? (
                <span class="training-test-badge">Done</span>
              ) : showTest && trainingTestTotalBatches.value > 0 ? (
                <span class="training-test-counter">
                  {trainingTestBatch.value} / {trainingTestTotalBatches.value}
                </span>
              ) : (
                <StatusLabel event={event} reconnected={reconnected} />
              )}
            </div>
            {active && event !== "testing_complete" && (
              <button class="training-stop-btn" onClick={stopTraining}>
                Stop
              </button>
            )}
          </div>

          {active && showTest && event !== "testing_complete" && (
            <ProgressBar value={trainingTestProgress.value} />
          )}

          {Object.keys(trainingTestMetrics.value).length > 0 && (
            <div class="training-panel-stats">
              {Object.entries(trainingTestMetrics.value).map(([key, val]) => {
                const label = key
                  .replace(/^test\//, "")
                  .replace(/_/g, " ");
                const displayVal =
                  typeof val === "number"
                    ? val < 1 && val > -1
                      ? val.toFixed(4)
                      : val.toFixed(2)
                    : val;
                return (
                  <div class="training-stat" key={key}>
                    <span class="training-stat-label">{label}</span>
                    <span class="training-stat-value">{displayVal}</span>
                  </div>
                );
              })}
            </div>
          )}

          {(event === "testing_complete" || isDone) && (
            <div class="training-panel-done-msg">
              Evaluation finished successfully.
            </div>
          )}

          {isError && error && <div class="training-panel-error">{error}</div>}
        </div>
      </>
    );
  }

  return (
    <>
      <div
        class={`training-panel${isError ? " training-panel--error" : isDone && !showTest ? " training-panel--done" : ""}`}
      >
        <div class="training-panel-header">
          <div class="training-panel-title-row">
            {active && !showTest && <div class="training-panel-spinner" />}
            <span class="training-panel-title">
              {fastDev ? "Fast Dev Run" : "Training"}
            </span>
            <StatusLabel event={active && !showTest ? event : isDone || showTest ? "training_complete" : event} reconnected={reconnected} />
          </div>
          {active && !showTest && (
            <button class="training-stop-btn" onClick={stopTraining}>
              Stop
            </button>
          )}
        </div>

        {active && !showTest && (
          <>
            <ProgressBar value={progress} />
            <div class="training-panel-stats">
              <div class="training-stat">
                <span class="training-stat-label">Epoch</span>
                <span class="training-stat-value">
                  {epoch + 1} / {maxEpochs}
                  {(() => {
                    const eta = formatDuration(trainingEstimatedRemaining.value);
                    return eta ? <span class="training-eta"> (~{eta} remaining)</span> : null;
                  })()}
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
              {Object.entries(metrics).map(([key, val]) => {
                if (key === "train/loss" || key === "loss") return null;
                const label = key
                  .replace(/^(train|val|test)\//, "")
                  .replace(/_/g, " ");
                const prefix = key.startsWith("val/")
                  ? "Val"
                  : key.startsWith("train/")
                    ? "Train"
                    : key.startsWith("test/")
                      ? "Test"
                      : "";
                const displayLabel = prefix ? `${prefix} ${label}` : label;
                const displayVal =
                  typeof val === "number"
                    ? val < 1 && val > -1
                      ? val.toFixed(4)
                      : val.toFixed(2)
                    : val;
                return (
                  <div class="training-stat" key={key}>
                    <span class="training-stat-label">{displayLabel}</span>
                    <span class="training-stat-value">{displayVal}</span>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* Show done message only when training is complete and test hasn't started */}
        {!showTest && isDone && (
          <div class="training-panel-done-msg">
            Training finished successfully.
          </div>
        )}

        {isError && error && <div class="training-panel-error">{error}</div>}
      </div>

      {/* Separate Test / Evaluation panel */}
      {showTest && (
        <div class={`training-panel${event === "testing_complete" ? " training-panel--done" : ""}`}>
          <div class="training-panel-header">
            <div class="training-panel-title-row">
              {event !== "testing_complete" && <div class="training-panel-spinner" />}
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style="margin-right:4px">
                <path d="M6.5 1.75a.75.75 0 0 1 .75-.75h1.5a.75.75 0 0 1 .75.75V4h2.75a.75.75 0 0 1 .53 1.28l-4.5 4.5a.75.75 0 0 1-1.06 0l-4.5-4.5A.75.75 0 0 1 2.75 4H5.5V1.75Z" fill="currentColor" opacity="0.5"/>
                <path d="M2 13.25a.75.75 0 0 1 .75-.75h10.5a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1-.75-.75Z" fill="currentColor"/>
              </svg>
              <span class="training-panel-title">Evaluation</span>
              {event === "testing_complete" ? (
                <span class="training-test-badge">Done</span>
              ) : trainingTestTotalBatches.value > 0 ? (
                <span class="training-test-counter">
                  {trainingTestBatch.value} / {trainingTestTotalBatches.value}
                </span>
              ) : null}
            </div>
            {active && event !== "testing_complete" && (
              <button class="training-stop-btn" onClick={stopTraining}>
                Stop
              </button>
            )}
          </div>

          {event !== "testing_complete" && (
            <ProgressBar value={trainingTestProgress.value} />
          )}

          {Object.keys(trainingTestMetrics.value).length > 0 && (
            <div class="training-panel-stats">
              {Object.entries(trainingTestMetrics.value).map(([key, val]) => {
                const label = key
                  .replace(/^test\//, "")
                  .replace(/_/g, " ");
                const displayVal =
                  typeof val === "number"
                    ? val < 1 && val > -1
                      ? val.toFixed(4)
                      : val.toFixed(2)
                    : val;
                return (
                  <div class="training-stat" key={key}>
                    <span class="training-stat-label">{label}</span>
                    <span class="training-stat-value">{displayVal}</span>
                  </div>
                );
              })}
            </div>
          )}

          {event === "testing_complete" && (
            <div class="training-panel-done-msg">
              Evaluation finished successfully.
            </div>
          )}
        </div>
      )}
    </>
  );
}
