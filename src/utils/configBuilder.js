import { MODEL_CATEGORIES } from "../state/projects.js";

/** Strip trailing slash from a path so concatenation doesn't double up. */
const trimSlash = (p) => (p && p.endsWith("/") ? p.slice(0, -1) : p);

const TASK_CLASS_PATHS = {
  "Classification": { model: "autotimm.ImageClassifier", data: "autotimm.ImageDataModule" },
  "Multi-Label Classification": { model: "autotimm.ImageClassifier", data: "autotimm.ImageDataModule" },
  "Object Detection": { model: "autotimm.ObjectDetector", data: "autotimm.DetectionDataModule" },
  "Semantic Segmentation": { model: "autotimm.SemanticSegmentor", data: "autotimm.SegmentationDataModule" },
  "Instance Segmentation": { model: "autotimm.InstanceSegmentor", data: "autotimm.InstanceSegmentationDataModule" },
};

/**
 * Build an AutoTimm YAML config string from a NightFlow project object.
 */
export function buildConfigYaml(project) {
  const task = project.taskType || "Classification";
  const paths = TASK_CLASS_PATHS[task] || TASK_CLASS_PATHS["Classification"];
  const category = project.modelCategory || "Edge";
  const backbone = (MODEL_CATEGORIES[category]?.models?.[0]) || "efficientnet_b0";

  const lines = [];

  // ── model section ───────────────────────────────────────────────────────
  lines.push("model:");
  lines.push(`  class_path: ${paths.model}`);
  lines.push("  init_args:");
  lines.push(`    backbone: ${backbone}`);

  if (project.numClasses !== "" && project.numClasses !== undefined) {
    lines.push(`    num_classes: ${project.numClasses}`);
  }

  if (project.learningRate !== "" && project.learningRate !== undefined) {
    lines.push(`    lr: ${project.learningRate}`);
  }

  if (task === "Multi-Label Classification") {
    lines.push("    multilabel: true");
  }

  if (task === "Object Detection" && project.detectionArch) {
    lines.push(`    detection_arch: ${project.detectionArch}`);
  }

  if (task === "Semantic Segmentation" && project.segHeadType) {
    lines.push(`    head_type: ${project.segHeadType}`);
  }

  if (project.optimizer) {
    lines.push(`    optimizer: ${project.optimizer}`);
  }

  if (project.scheduler && project.scheduler !== "none") {
    lines.push(`    scheduler: ${project.scheduler}`);
  }

  if (project.weightDecay !== "" && project.weightDecay !== undefined) {
    lines.push(`    weight_decay: ${project.weightDecay}`);
  }

  if (project.freezeBackbone) {
    lines.push("    freeze_backbone: true");
  }

  // Classification metrics
  if ((task === "Classification" || task === "Multi-Label Classification") &&
      project.numClasses !== "" && project.numClasses !== undefined) {
    const tmTask = task === "Multi-Label Classification" ? "multilabel" : "multiclass";
    const ncKey = task === "Multi-Label Classification" ? "num_labels" : "num_classes";
    const nc = project.numClasses;

    lines.push("    metrics:");

    const metricsDef = [
      { name: "accuracy", cls: "Accuracy", extra: {} },
      { name: "precision", cls: "Precision", extra: { average: "macro" } },
      { name: "recall", cls: "Recall", extra: { average: "macro" } },
      { name: "f1", cls: "F1Score", extra: { average: "macro" } },
    ];

    for (const m of metricsDef) {
      lines.push(`      - name: ${m.name}`);
      lines.push("        backend: torchmetrics");
      lines.push(`        metric_class: ${m.cls}`);

      // params as inline YAML mapping
      const paramParts = [`task: ${tmTask}`, `${ncKey}: ${nc}`];
      for (const [k, v] of Object.entries(m.extra)) {
        paramParts.push(`${k}: ${v}`);
      }
      lines.push(`        params: {${paramParts.join(", ")}}`);

      lines.push("        stages: [train, val, test]");
      lines.push("        prog_bar: true");
    }
  }

  // ── data section ────────────────────────────────────────────────────────
  lines.push("");
  lines.push("data:");
  lines.push(`  class_path: ${paths.data}`);
  lines.push("  init_args:");

  const fmt = project.datasetFormat;
  if (fmt === "CSV" || fmt === "JSONL") {
    if (project.trainPath) lines.push(`    train_path: ${trimSlash(project.trainPath)}`);
    if (project.valPath) lines.push(`    val_path: ${trimSlash(project.valPath)}`);
    if (project.testPath) lines.push(`    test_path: ${trimSlash(project.testPath)}`);
  } else if (project.folderPath) {
    lines.push(`    data_dir: ${trimSlash(project.folderPath)}`);
  }

  if (project.batchSize !== "" && project.batchSize !== undefined) {
    lines.push(`    batch_size: ${project.batchSize}`);
  }

  if (project.imageSize !== "" && project.imageSize !== undefined) {
    lines.push(`    image_size: ${project.imageSize}`);
  }

  if (project.augmentationPreset) {
    lines.push(`    augmentation_preset: ${project.augmentationPreset}`);
  }

  // ── trainer section ─────────────────────────────────────────────────────
  lines.push("");
  lines.push("trainer:");
  lines.push(`  max_epochs: ${project.maxEpochs || 10}`);
  lines.push("  accelerator: auto");
  lines.push("  devices: auto");

  if (project.precision) {
    lines.push(`  precision: ${project.precision}`);
  }

  if (project.gradientClipVal !== "" && project.gradientClipVal !== undefined) {
    lines.push(`  gradient_clip_val: ${project.gradientClipVal}`);
  }

  if (project.seed !== "" && project.seed !== undefined) {
    lines.push(`  seed: ${project.seed}`);
  }

  // Default logger: TensorBoard
  lines.push("  logger:");
  lines.push("    - backend: tensorboard");
  lines.push("      params:");
  lines.push("        save_dir: logs");

  // Early stopping callback
  if (project.earlyStopping) {
    const monitor = project.earlyStoppingMonitor || "val/loss";
    const patience = project.earlyStoppingPatience || 10;
    const mode = monitor.includes("loss") ? "min" : "max";
    lines.push("  callbacks:");
    lines.push("    - class_path: pytorch_lightning.callbacks.EarlyStopping");
    lines.push("      init_args:");
    lines.push(`        monitor: ${monitor}`);
    lines.push(`        patience: ${patience}`);
    lines.push(`        mode: ${mode}`);
  }

  lines.push("");
  return lines.join("\n");
}
