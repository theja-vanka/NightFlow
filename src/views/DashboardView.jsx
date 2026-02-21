import { SummaryCard } from "../components/SummaryCard.jsx";
import { TrainingPanel } from "../components/TrainingPanel.jsx";
import SyncLogsPanel from "../components/SyncLogsPanel.jsx";
import {
  stats, sshInfo, toggleSshConnection, sshConnecting, sshConnected,
  sshConnectionError, clearSshConnectionError,
  dashboardSynced, dashboardSyncing, syncDashboard, syncProgress, syncShowingCompletion,
  datasetPathStatus, uvInfo, envInfo,
} from "../state/dashboard.js";
import { currentProject, MODEL_CATEGORIES } from "../state/projects.js";
import { startTraining, trainingActive } from "../state/training.js";

function SshStatusBanner() {
  const info = sshInfo.value;
  const connecting = sshConnecting.value;
  if (!info) return null;

  const elapsed = info.connectedAt
    ? Math.floor((Date.now() - new Date(info.connectedAt).getTime()) / 60000)
    : 0;
  const uptime = elapsed >= 60
    ? `${Math.floor(elapsed / 60)}h ${elapsed % 60}m`
    : `${elapsed}m`;

  const bannerClass = `ssh-status-banner ${
    connecting ? "ssh-connecting" : info.connected ? "ssh-connected" : "ssh-disconnected"
  }`;
  const statusLabel = connecting ? "Connecting..." : info.connected ? "Connected" : "Disconnected";
  const buttonLabel = connecting ? "Connecting..." : info.connected ? "Disconnect" : "Connect";

  return (
    <div class={bannerClass}>
      {connecting ? (
        <div class="ssh-status-spinner" />
      ) : (
        <div class="ssh-status-dot" />
      )}
      <div class="ssh-status-info">
        <span class="ssh-status-label">{statusLabel}</span>
        <span class="ssh-status-host">{info.host}</span>
      </div>
      {info.connected && !connecting && (
        <span class="ssh-status-uptime">Uptime: {uptime}</span>
      )}
      <button
        class={`ssh-toggle-btn ${info.connected ? "ssh-toggle-disconnect" : ""}`}
        onClick={toggleSshConnection}
        disabled={connecting}
      >
        {connecting && (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="ssh-btn-spinner">
            <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
          </svg>
        )}
        {buttonLabel}
      </button>
    </div>
  );
}

const icons = {
  total: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20V10"/><path d="M18 20V4"/><path d="M6 20v-4"/></svg>`,
  running: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>`,
  accuracy: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/></svg>`,
  loss: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
};

function SshErrorModal() {
  const error = sshConnectionError.value;
  if (!error) return null;

  return (
    <div class="modal-overlay" onClick={() => clearSshConnectionError()}>
      <div class="modal-dialog ssh-error-modal" onClick={(e) => e.stopPropagation()}>
        <div class="modal-header">
          <h3 class="modal-title">SSH Connection Failed</h3>
          <button class="modal-close-btn" onClick={() => clearSshConnectionError()}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div class="modal-body">
          <div class="ssh-error-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
          </div>
          <p class="ssh-error-message">{error.message}</p>
        </div>
        <div class="modal-footer">
          <button class="btn btn-primary" onClick={() => clearSshConnectionError()}>Close</button>
        </div>
      </div>
    </div>
  );
}

function DatasetStatusBanner() {
  const project = currentProject.value;
  const status = datasetPathStatus.value;
  if (!project) return null;

  const fmt = project.datasetFormat;
  const usesSplitFiles = fmt === "CSV" || fmt === "JSONL";

  const paths = [];
  if (usesSplitFiles) {
    if (project.trainPath) paths.push({ label: "Train", path: project.trainPath, exists: status.trainPath });
    if (project.valPath) paths.push({ label: "Validation", path: project.valPath, exists: status.valPath });
    if (project.testPath) paths.push({ label: "Test", path: project.testPath, exists: status.testPath });
  } else {
    if (project.folderPath) paths.push({ label: "Dataset Folder", path: project.folderPath, exists: status.folderPath });
  }

  if (paths.length === 0) return null;

  return (
    <div class="dataset-status-banner">
      <div class="dataset-status-header">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
        </svg>
        <span>Dataset Paths</span>
      </div>
      <div class="dataset-status-items">
        {paths.map((p) => (
          <div class="dataset-status-item" key={p.label}>
            <span class={`dataset-status-dot ${p.exists === true ? "found" : p.exists === false ? "missing" : "unknown"}`} />
            <span class="dataset-status-label">{p.label}</span>
            <span class="dataset-status-path">{p.path}</span>
            <span class={`dataset-status-tag ${p.exists === true ? "found" : p.exists === false ? "missing" : "unknown"}`}>
              {p.exists === true ? "Found" : p.exists === false ? "Not Found" : "—"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function EnvStatusBanner() {
  const uv = uvInfo.value;
  const info = envInfo.value;
  if (!uv && !info) return null;

  const isError = info?.status === "error";
  const dotClass = isError ? "missing" : "found";
  const tagClass = isError ? "missing" : "found";

  return (
    <div class="dataset-status-banner">
      <div class="dataset-status-header">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
        </svg>
        <span>Python Environment</span>
      </div>
      <div class="dataset-status-items">
        {uv && (
          <div class="dataset-status-item">
            <span class={`dataset-status-dot ${uv.installed ? "found" : "missing"}`} />
            <span class="dataset-status-label">uv</span>
            <span class="dataset-status-path">{uv.installed ? (uv.version || "installed") : uv.message}</span>
            <span class={`dataset-status-tag ${uv.installed ? "found" : "missing"}`}>
              {uv.installed ? "Ready" : "Missing"}
            </span>
          </div>
        )}
        {info && (isError ? (
          <div class="dataset-status-item">
            <span class={`dataset-status-dot ${dotClass}`} />
            <span class="dataset-status-label">Status</span>
            <span class="dataset-status-path">{info.message}</span>
            <span class={`dataset-status-tag ${tagClass}`}>Error</span>
          </div>
        ) : (
          <>
            <div class="dataset-status-item">
              <span class={`dataset-status-dot ${dotClass}`} />
              <span class="dataset-status-label">Python</span>
              <span class="dataset-status-path">{info.pythonVersion || "unknown"}</span>
              <span class={`dataset-status-tag ${tagClass}`}>
                {info.status === "created" ? "Installed" : info.status === "system" ? "System" : "Ready"}
              </span>
            </div>
            <div class="dataset-status-item">
              <span class={`dataset-status-dot ${info.autotimmVersion ? "found" : "missing"}`} />
              <span class="dataset-status-label">AutoTimm</span>
              <span class="dataset-status-path">{info.autotimmVersion || "not installed"}</span>
              <span class={`dataset-status-tag ${info.autotimmVersion ? "found" : "missing"}`}>
                {info.autotimmVersion ? (info.status === "created" ? "Installed" : info.status === "system" ? "System" : "Ready") : "Missing"}
              </span>
            </div>
          </>
        ))}
      </div>
    </div>
  );
}

function ProgressCircle({ percentage }) {
  const circumference = 2 * Math.PI * 45; // radius = 45
  const dashOffset = circumference - (percentage / 100) * circumference;
  
  return (
    <div class="progress-circle-container">
      <svg width="80" height="80" viewBox="0 0 100 100" class="progress-circle-svg">
        <circle
          cx="50"
          cy="50"
          r="45"
          fill="none"
          stroke="var(--sync-progress-bg)"
          stroke-width="3"
        />
        <circle
          cx="50"
          cy="50"
          r="45"
          fill="none"
          stroke="var(--sync-progress-fill)"
          stroke-width="3"
          stroke-dasharray={circumference}
          stroke-dashoffset={dashOffset}
          stroke-linecap="round"
          class="progress-circle-svg-fill"
        />
      </svg>
      <span class="progress-circle-text">{Math.round(percentage)}%</span>
    </div>
  );
}

function SyncScreen() {
  const syncing = dashboardSyncing.value;
  const progress = syncProgress.value;
  const showingCompletion = syncShowingCompletion.value;
  
  return (
    <div class="dashboard-sync-screen">
      <div class="dashboard-sync-card">
        <div class={`dashboard-sync-icon${syncing ? " dashboard-sync-icon--spinning" : ""}`}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M23 4v6h-6"/>
            <path d="M1 20v-6h6"/>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
          </svg>
        </div>
        <h2 class="dashboard-sync-title">Sync Project Data</h2>
        <p class="dashboard-sync-desc">
          Fetch the latest runs, metrics, and experiment history from the connected machine.
        </p>
        <button class="dashboard-sync-btn" onClick={syncDashboard} disabled={syncing || showingCompletion}>
          {syncing || showingCompletion ? (
            <ProgressCircle percentage={progress} />
          ) : "Sync"}
        </button>
      </div>
    </div>
  );
}

function ResyncButton() {
  const syncing = dashboardSyncing.value;
  return (
    <button
      class={`resync-fab${syncing ? " resync-fab--spinning" : ""}`}
      onClick={syncDashboard}
      disabled={syncing}
      title="Re-sync project data"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M23 4v6h-6"/>
        <path d="M1 20v-6h6"/>
        <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
      </svg>
    </button>
  );
}

const TASK_CLASS_PATHS = {
  "Classification": { model: "autotimm.ImageClassifier", data: "autotimm.ImageDataModule" },
  "Multi-Label Classification": { model: "autotimm.ImageClassifier", data: "autotimm.ImageDataModule" },
  "Object Detection": { model: "autotimm.ObjectDetector", data: "autotimm.DetectionDataModule" },
  "Semantic Segmentation": { model: "autotimm.SemanticSegmentor", data: "autotimm.SegmentationDataModule" },
  "Instance Segmentation": { model: "autotimm.InstanceSegmentor", data: "autotimm.DetectionDataModule" },
};

function buildTrainingCommand(project) {
  const task = project.taskType || "Classification";
  const paths = TASK_CLASS_PATHS[task] || TASK_CLASS_PATHS["Classification"];
  const category = project.modelCategory || "Edge";
  const backbone = (MODEL_CATEGORIES[category]?.models?.[0]) || "efficientnet_b0";

  // Use .venv python if env was created/exists, otherwise system python
  const env = envInfo.value;
  const useVenv = env && (env.status === "exists" || env.status === "created");
  const pythonBin = useVenv ? `${project.projectPath}/.venv/bin/python` : "python3";
  const args = [
    `${pythonBin} -m autotimm fit`,
    `--model.class_path=${paths.model}`,
    `--model.init_args.backbone=${backbone}`,
    `--data.class_path=${paths.data}`,
  ];

  // Multi-label flag
  if (task === "Multi-Label Classification") {
    args.push("--model.init_args.multilabel=true");
  }

  // Task-specific args
  if (task === "Object Detection" && project.detectionArch) {
    args.push(`--model.init_args.detection_arch=${project.detectionArch}`);
  }
  if (task === "Semantic Segmentation" && project.segHeadType) {
    args.push(`--model.init_args.head_type=${project.segHeadType}`);
  }

  // Dataset paths
  const fmt = project.datasetFormat;
  if (fmt === "CSV" || fmt === "JSONL") {
    if (project.trainPath) args.push(`--data.init_args.train_path=${project.trainPath}`);
    if (project.valPath) args.push(`--data.init_args.val_path=${project.valPath}`);
    if (project.testPath) args.push(`--data.init_args.test_path=${project.testPath}`);
  } else if (project.folderPath) {
    args.push(`--data.init_args.data_dir=${project.folderPath}`);
  }

  // Training hyperparameters
  args.push(`--trainer.max_epochs=${project.maxEpochs || 10}`);
  if (project.learningRate !== "" && project.learningRate !== undefined)
    args.push(`--model.init_args.lr=${project.learningRate}`);
  if (project.batchSize !== "" && project.batchSize !== undefined)
    args.push(`--data.init_args.batch_size=${project.batchSize}`);
  if (project.optimizer)
    args.push(`--model.init_args.optimizer=${project.optimizer}`);
  if (project.scheduler && project.scheduler !== "none")
    args.push(`--model.init_args.scheduler=${project.scheduler}`);
  if (project.weightDecay !== "" && project.weightDecay !== undefined)
    args.push(`--model.init_args.weight_decay=${project.weightDecay}`);
  if (project.precision)
    args.push(`--trainer.precision=${project.precision}`);
  if (project.gradientClipVal !== "" && project.gradientClipVal !== undefined)
    args.push(`--trainer.gradient_clip_val=${project.gradientClipVal}`);
  if (project.imageSize !== "" && project.imageSize !== undefined)
    args.push(`--data.init_args.image_size=${project.imageSize}`);
  if (project.augmentationPreset)
    args.push(`--data.init_args.augmentation_preset=${project.augmentationPreset}`);
  if (project.freezeBackbone)
    args.push("--model.init_args.freeze_backbone=true");
  if (project.seed !== "" && project.seed !== undefined)
    args.push(`--trainer.seed=${project.seed}`);

  // Early stopping callback
  if (project.earlyStopping) {
    const monitor = project.earlyStoppingMonitor || "val/loss";
    const patience = project.earlyStoppingPatience || 10;
    const mode = monitor.includes("loss") ? "min" : "max";
    args.push(`--trainer.callbacks+={"class_path":"pytorch_lightning.callbacks.EarlyStopping","init_args":{"monitor":"${monitor}","patience":${patience},"mode":"${mode}"}}`);
  }

  return args.join(" ");
}

function StartTrainingButton() {
  const project = currentProject.value;
  const active = trainingActive.value;
  if (!project) return null;

  const command = buildTrainingCommand(project);

  const handleClick = () => {
    startTraining(command, project.projectPath);
  };

  return (
    <div class="start-training-section">
      <div class="start-training-label">Launch Experiment</div>
      <div class="start-training-cmd-preview">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="start-training-cmd-icon">
          <polyline points="4 17 10 11 4 5"/>
          <line x1="12" y1="19" x2="20" y2="19"/>
        </svg>
        <span>{command}</span>
      </div>
      <button
        class="start-training-btn"
        onClick={handleClick}
        disabled={active}
      >
        {active ? (
          <>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="ssh-btn-spinner">
              <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
            </svg>
            Training in Progress…
          </>
        ) : (
          <>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="5 3 19 12 5 21 5 3"/>
            </svg>
            Start Training
          </>
        )}
      </button>
    </div>
  );
}

export function DashboardView() {
  const s = stats.value;
  const connected = sshConnected.value;
  const synced = dashboardSynced.value;
  const syncing = dashboardSyncing.value;
  const showingCompletion = syncShowingCompletion.value;

  return (
    <div class={`dashboard-view ${(syncing || showingCompletion) && currentProject.value?.powerUserMode ? "dashboard-view--syncing" : ""}`}>
      <SshStatusBanner />
      {!connected ? null : syncing || showingCompletion || !synced ? (
        <SyncScreen />
      ) : (
        <>
          <TrainingPanel />
          <DatasetStatusBanner />
          <EnvStatusBanner />
          <div class="summary-grid">
            <SummaryCard label="Total Runs" value={s.totalRuns} icon={icons.total} />
            <SummaryCard label="Running" value={s.running} icon={icons.running} />
            <SummaryCard label="Best Accuracy" value={s.bestAcc != null ? (s.bestAcc * 100).toFixed(1) + "%" : "—"} icon={icons.accuracy} />
            <SummaryCard label="Avg Val Loss" value={s.avgLoss != null ? s.avgLoss.toFixed(4) : "—"} icon={icons.loss} />
          </div>
          <StartTrainingButton />
          <ResyncButton />
        </>
      )}
      {syncing && currentProject.value?.powerUserMode && <div class="sync-logs-navbar"><SyncLogsPanel /></div>}
      <SshErrorModal />
    </div>
  );
}
