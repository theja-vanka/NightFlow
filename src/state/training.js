import { signal, computed } from "@preact/signals";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { currentProjectId, currentProject, projectList } from "./projects.js";
import { addRun, updateRun, allRuns, generateRunName } from "./experiments.js";

// ── Per-project training state ───────────────────────────────────────────────

const _trainingState = signal({}); // { [projectId]: TrainingState }

const _defaultTraining = () => ({
  active: false,
  reconnected: false, // true if restored from an orphaned session
  runId: null,
  event: null, // last event type
  epoch: 0,
  maxEpochs: 0,
  step: 0,
  totalSteps: 0,
  loss: null,
  metrics: {},
  testMetrics: {}, // metrics from autotimm test step
  error: null,
  fastDevRun: false,
  lossCurve: [],
  accCurve: [],
  scalars: {}, // { [tag]: [{ step, value }] } — all metrics accumulated per epoch
});

function _get(projectId) {
  return _trainingState.value[projectId] ?? _defaultTraining();
}

function _set(projectId, updates) {
  const current = _get(projectId);
  _trainingState.value = {
    ..._trainingState.value,
    [projectId]: { ...current, ...updates },
  };
}

// ── Computed signals for active project ──────────────────────────────────────

export const trainingActive = computed(
  () => _get(currentProjectId.value).active,
);
export const trainingReconnected = computed(
  () => _get(currentProjectId.value).reconnected,
);
export const trainingEvent = computed(() => _get(currentProjectId.value).event);
export const trainingEpoch = computed(() => _get(currentProjectId.value).epoch);
export const trainingMaxEpochs = computed(
  () => _get(currentProjectId.value).maxEpochs,
);
export const trainingStep = computed(() => _get(currentProjectId.value).step);
export const trainingTotalSteps = computed(
  () => _get(currentProjectId.value).totalSteps,
);
export const trainingLoss = computed(() => _get(currentProjectId.value).loss);
export const trainingMetrics = computed(
  () => _get(currentProjectId.value).metrics,
);
export const trainingError = computed(() => _get(currentProjectId.value).error);
export const trainingFastDevRun = computed(
  () => _get(currentProjectId.value).fastDevRun,
);
export const trainingLossCurve = computed(
  () => _get(currentProjectId.value).lossCurve,
);
export const trainingAccCurve = computed(
  () => _get(currentProjectId.value).accCurve,
);
export const trainingTestMetrics = computed(
  () => _get(currentProjectId.value).testMetrics,
);

export const trainingProgress = computed(() => {
  const s = _get(currentProjectId.value);
  if (!s.active || s.maxEpochs === 0) return 0;
  return Math.round(((s.epoch + 1) / s.maxEpochs) * 100);
});

export function getTrainingRunId(projectId) {
  return _get(projectId).runId;
}

// ── Start / stop training ────────────────────────────────────────────────────

export async function startTraining(command, cwd, passedRunId) {
  const projectId = currentProjectId.value;
  if (!projectId) return;

  const project = currentProject.value;
  const runId = passedRunId || crypto.randomUUID();
  const runName = generateRunName();

  // Collect hyperparameters from the project
  const hyperparameters = {};
  if (project?.learningRate != null && project.learningRate !== "")
    hyperparameters.lr = Number(project.learningRate);
  if (project?.optimizer) hyperparameters.optimizer = project.optimizer;
  if (project?.scheduler && project.scheduler !== "none")
    hyperparameters.scheduler = project.scheduler;
  if (project?.weightDecay != null && project.weightDecay !== "")
    hyperparameters.weightDecay = Number(project.weightDecay);
  if (project?.batchSize != null && project.batchSize !== "")
    hyperparameters.batchSize = Number(project.batchSize);
  if (project?.maxEpochs != null && project.maxEpochs !== "")
    hyperparameters.maxEpochs = Number(project.maxEpochs);
  if (project?.imageSize != null && project.imageSize !== "")
    hyperparameters.imageSize = Number(project.imageSize);
  if (project?.precision) hyperparameters.precision = project.precision;
  if (project?.gradientClipVal != null && project.gradientClipVal !== "")
    hyperparameters.gradientClipVal = Number(project.gradientClipVal);
  if (project?.freezeBackbone) hyperparameters.freezeBackbone = true;
  if (project?.seed != null && project.seed !== "")
    hyperparameters.seed = Number(project.seed);
  if (project?.augmentationPreset)
    hyperparameters.augmentationPreset = project.augmentationPreset;
  if (project?.numClasses != null && project.numClasses !== "")
    hyperparameters.numClasses = Number(project.numClasses);

  // Create a run record in experiments
  await addRun({
    id: runId,
    name: runName,
    projectId,
    status: "running",
    model: project?.modelCategory ?? "unknown",
    dataset: project?.folderPath || project?.trainPath || "unknown",
    bestAcc: null,
    valLoss: null,
    epochs: 0,
    lr: hyperparameters.lr ?? null,
    hyperparameters,
    lossCurve: [],
    accCurve: [],
    created: new Date().toISOString(),
  });

  _set(projectId, {
    ..._defaultTraining(),
    active: true,
    runId,
    event: "preparing",
  });

  try {
    await invoke("start_training", {
      sessionId: projectId,
      runId,
      runName,
      command,
      cwd: cwd || project?.projectPath || null,
    });
  } catch (err) {
    _set(projectId, {
      active: false,
      event: "training_error",
      error: `${err}`,
    });
    await updateRun(runId, { status: "failed" });
  }
}

export async function stopTraining() {
  const projectId = currentProjectId.value;
  if (!projectId) return;

  const state = _get(projectId);
  const project = currentProject.value;
  try {
    await invoke("stop_training", {
      sessionId: projectId,
      projectPath: project?.projectPath || null,
    });
  } catch (err) {
    console.error("Failed to stop training:", err);
  }

  _set(projectId, { active: false, event: "stopped", reconnected: false });

  if (state.runId) {
    await updateRun(state.runId, { status: "failed" });
  }
}

// ── Event processing (shared between live and replay) ────────────────────────

function _processEvent(session_id, data) {
  const state = _get(session_id);

  switch (data.event) {
    case "training_started":
      _set(session_id, {
        event: "training_started",
        maxEpochs: data.max_epochs ?? 0,
        totalSteps: data.total_steps ?? 0,
        fastDevRun: data.fast_dev_run ?? false,
      });
      break;

    case "tuning_started":
      _set(session_id, { event: "tuning_started" });
      break;

    case "tuning_complete":
      _set(session_id, { event: "tuning_complete" });
      break;

    case "testing_started":
      _set(session_id, { event: "testing_started", testMetrics: {} });
      break;

    case "testing_complete": {
      const testMetrics = data.metrics ?? {};
      const testAcc =
        testMetrics["test/accuracy"] ??
        testMetrics["test/acc"] ??
        testMetrics["test/MulticlassAccuracy"] ??
        null;

      _set(session_id, { event: "testing_complete", testMetrics });

      if (state.runId) {
        const updates = { testMetrics };
        if (testAcc != null) updates.testAcc = testAcc;
        updateRun(state.runId, updates);
      }
      break;
    }

    case "epoch_started":
      _set(session_id, {
        event: "epoch_started",
        epoch: data.epoch ?? 0,
        maxEpochs: data.max_epochs ?? state.maxEpochs,
      });
      break;

    case "batch_end":
      _set(session_id, {
        event: "batch_end",
        step: data.step ?? state.step,
        totalSteps: data.total_steps ?? state.totalSteps,
        loss: data.loss ?? state.loss,
      });
      break;

    case "epoch_end": {
      const metrics = data.metrics ?? {};
      const epoch = data.epoch ?? state.epoch;
      const loss = metrics["train/loss"] ?? metrics["loss"] ?? state.loss;
      const lossCurve = [..._get(session_id).lossCurve];
      if (loss != null) lossCurve.push(loss);

      // Accumulate all metrics into scalars
      const prevScalars = { ..._get(session_id).scalars };
      for (const [tag, value] of Object.entries(metrics)) {
        if (value == null) continue;
        if (!prevScalars[tag]) prevScalars[tag] = [];
        prevScalars[tag] = [...prevScalars[tag], { step: epoch, value }];
      }

      _set(session_id, {
        event: "epoch_end",
        epoch,
        metrics,
        loss,
        lossCurve,
        scalars: prevScalars,
      });

      if (state.runId) {
        updateRun(state.runId, {
          epochs: epoch + 1,
          valLoss: metrics["val/loss"] ?? null,
          lossCurve,
          scalars: prevScalars,
        });
      }
      break;
    }

    case "validation_end": {
      const metrics = data.metrics ?? {};
      const epoch = data.epoch ?? state.epoch;
      const acc = metrics["val/accuracy"] ?? metrics["val/acc"] ?? null;
      const accCurve = [..._get(session_id).accCurve];
      if (acc != null) accCurve.push(acc);

      const bestAcc = accCurve.length > 0 ? Math.max(...accCurve) : null;

      // Accumulate all validation metrics into scalars
      const prevScalars = { ..._get(session_id).scalars };
      for (const [tag, value] of Object.entries(metrics)) {
        if (value == null) continue;
        if (!prevScalars[tag]) prevScalars[tag] = [];
        prevScalars[tag] = [...prevScalars[tag], { step: epoch, value }];
      }

      _set(session_id, {
        event: "validation_end",
        metrics: { ..._get(session_id).metrics, ...metrics },
        accCurve,
        scalars: prevScalars,
      });

      if (state.runId) {
        updateRun(state.runId, {
          bestAcc,
          valLoss: metrics["val/loss"] ?? null,
          accCurve,
          scalars: prevScalars,
        });
      }
      break;
    }

    case "training_complete":
      _set(session_id, {
        event: "training_complete",
        active: false,
        reconnected: false,
        metrics: data.final_metrics ?? state.metrics,
      });

      if (state.runId) {
        updateRun(state.runId, { status: "completed" });
      }
      break;

    case "training_error":
      _set(session_id, {
        event: "training_error",
        active: false,
        reconnected: false,
        error: data.error ?? "Unknown error",
      });

      if (state.runId) {
        updateRun(state.runId, { status: "failed" });
      }
      break;
  }
}

// ── Reconnect to orphaned training sessions ─────────────────────────────────

/**
 * Check all projects for orphaned training sessions that survived an app crash.
 * For each found:
 *   - If process is still alive: replay log, start log watcher, restore UI state
 *   - If process is dead: replay log to get final state, mark run complete/failed
 */
export async function recoverOrphanedSessions() {
  const projects = projectList.value;
  for (const project of projects) {
    if (!project.projectPath) continue;

    try {
      const result = await invoke("check_training_session", {
        projectPath: project.projectPath,
      });

      if (!result.found || !result.meta) continue;

      const { meta } = result;
      const projectId = meta.session_id;

      // Find or recreate the run record
      let runId = meta.run_id;
      const existingRun = allRuns.value.find((r) => r.id === runId);
      if (!existingRun) {
        // Run was lost from IndexedDB — recreate it
        runId = meta.run_id;
        const hp = {};
        if (project.learningRate != null && project.learningRate !== "")
          hp.lr = Number(project.learningRate);
        if (project.optimizer) hp.optimizer = project.optimizer;
        if (project.scheduler && project.scheduler !== "none")
          hp.scheduler = project.scheduler;
        if (project.weightDecay != null && project.weightDecay !== "")
          hp.weightDecay = Number(project.weightDecay);
        if (project.batchSize != null && project.batchSize !== "")
          hp.batchSize = Number(project.batchSize);
        if (project.maxEpochs != null && project.maxEpochs !== "")
          hp.maxEpochs = Number(project.maxEpochs);
        if (project.imageSize != null && project.imageSize !== "")
          hp.imageSize = Number(project.imageSize);
        if (project.precision) hp.precision = project.precision;
        if (project.numClasses != null && project.numClasses !== "")
          hp.numClasses = Number(project.numClasses);
        await addRun({
          id: runId,
          projectId,
          status: "running",
          model: project.modelCategory ?? "unknown",
          dataset: project.folderPath || project.trainPath || "unknown",
          bestAcc: null,
          valLoss: null,
          epochs: 0,
          lr: hp.lr ?? null,
          hyperparameters: hp,
          lossCurve: [],
          accCurve: [],
          created: new Date(meta.started_at * 1000).toISOString(),
        });
      }

      // Set state to active so _processEvent works
      _set(projectId, {
        ..._defaultTraining(),
        active: true,
        reconnected: true,
        runId,
      });

      // Read all events from the log file and process synchronously
      // (Using read_training_log instead of replay_training_log to avoid
      //  async event delivery race where state isn't updated before we read it)
      const events = await invoke("read_training_log", {
        logFile: meta.log_file,
      });
      for (const data of events) {
        _processEvent(projectId, data);
      }

      // Check final state after replay
      const stateAfterReplay = _get(projectId);

      if (result.alive) {
        // Process still running — override any stale error from the log
        // (e.g. a BrokenPipeError recorded when the app previously closed)
        if (
          !stateAfterReplay.active ||
          stateAfterReplay.event === "training_error"
        ) {
          _set(projectId, {
            active: true,
            reconnected: true,
            event:
              stateAfterReplay.event === "training_error"
                ? stateAfterReplay.epoch > 0
                  ? "epoch_end"
                  : "training_started"
                : stateAfterReplay.event,
            error: null,
          });
          if (runId) {
            await updateRun(runId, { status: "running" });
          }
        }
        // Start watching log file for new events
        console.log(
          `[training] Reconnected to orphaned training for ${project.name} (PID ${meta.pid})`,
        );
        invoke("watch_training_log", {
          sessionId: projectId,
          logFile: meta.log_file,
          pid: meta.pid,
        }); // fire-and-forget, runs until process dies
      } else {
        // Process is dead — if we never got training_complete, mark as failed
        if (stateAfterReplay.active) {
          _set(projectId, {
            active: false,
            reconnected: false,
            event:
              stateAfterReplay.event === "training_complete"
                ? "training_complete"
                : "training_error",
            error:
              stateAfterReplay.event === "training_complete"
                ? null
                : "Training process exited unexpectedly",
          });
          if (runId) {
            const finalStatus =
              stateAfterReplay.event === "training_complete"
                ? "completed"
                : "failed";
            await updateRun(runId, { status: finalStatus });
          }
        }
        console.log(
          `[training] Recovered completed/failed orphaned training for ${project.name}`,
        );
      }
    } catch (err) {
      // check_training_session can fail for non-local projects — ignore
      console.debug(
        `[training] Could not check orphaned session for ${project.name}:`,
        err,
      );
    }
  }
}

// ── Event listener setup ─────────────────────────────────────────────────────

let _unlistenEvent = null;
let _unlistenLog = null;

export async function initTrainingListeners() {
  // Avoid double-init
  if (_unlistenEvent) return;

  _unlistenEvent = await listen("training-event", (e) => {
    const { session_id, data } = e.payload;
    const state = _get(session_id);
    if (!state.active) return;
    _processEvent(session_id, data);
  });

  _unlistenLog = await listen("training-log", (_e) => {
    // Stderr logs — could forward to a log panel in the future
  });

  // Check for orphaned sessions from a previous app crash
  // Small delay to let projects and runs load first
  setTimeout(() => recoverOrphanedSessions(), 500);
}

export function cleanupTrainingListeners() {
  if (_unlistenEvent) {
    _unlistenEvent();
    _unlistenEvent = null;
  }
  if (_unlistenLog) {
    _unlistenLog();
    _unlistenLog = null;
  }
}
