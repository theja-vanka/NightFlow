// Mock experiment data for NightForge dashboard

export const projects = [
  { id: "proj-1", name: "ImageNet Classifier", taskType: "Classification", datasetType: "Folder" },
  { id: "proj-2", name: "COCO Detector", taskType: "Object Detection", datasetType: "JSONL" },
  { id: "proj-3", name: "Street Segmenter", taskType: "Semantic Segmentation", datasetType: "Folder" },
];

function generateLossCurve(epochs, startLoss, endLoss, noise = 0.05) {
  const points = [];
  for (let i = 0; i <= epochs; i++) {
    const t = i / epochs;
    const base = startLoss * Math.exp(-3 * t) + endLoss;
    const jitter = (Math.random() - 0.5) * noise * base;
    points.push(+(base + jitter).toFixed(4));
  }
  return points;
}

function generateAccCurve(epochs, startAcc, endAcc, noise = 0.02) {
  const points = [];
  for (let i = 0; i <= epochs; i++) {
    const t = i / epochs;
    const base = startAcc + (endAcc - startAcc) * (1 - Math.exp(-4 * t));
    const jitter = (Math.random() - 0.5) * noise;
    points.push(+Math.min(1, Math.max(0, base + jitter)).toFixed(4));
  }
  return points;
}

const MODELS = ["ResNet-50", "ViT-B/16", "EfficientNet-B3", "DenseNet-121", "MobileNet-v3", "ConvNeXt-T", "Swin-T", "RegNet-Y-4G"];
const DATASETS = ["ImageNet-1k", "CIFAR-100", "Oxford Pets", "Food-101", "Stanford Cars"];
const OPTIMIZERS = ["AdamW", "SGD", "LAMB", "Adam", "RMSProp"];
const STATUSES = ["completed", "completed", "completed", "running", "failed", "queued", "completed", "completed"];

export const runs = Array.from({ length: 24 }, (_, i) => {
  const id = `NF-${String(i + 1).padStart(3, "0")}`;
  const status = STATUSES[i % STATUSES.length];
  const epochs = status === "queued" ? 0 : status === "running" ? Math.floor(Math.random() * 60) + 20 : Math.floor(Math.random() * 80) + 50;
  const lr = [1e-3, 3e-4, 1e-4, 5e-4, 1e-2][i % 5];
  const batchSize = [32, 64, 128, 256][i % 4];
  const model = MODELS[i % MODELS.length];
  const dataset = DATASETS[i % DATASETS.length];
  const optimizer = OPTIMIZERS[i % OPTIMIZERS.length];

  const startLoss = 2.5 + Math.random() * 1.5;
  const endLoss = 0.1 + Math.random() * 0.4;
  const startAcc = 0.05 + Math.random() * 0.1;
  const endAcc = 0.85 + Math.random() * 0.13;

  const lossCurve = status === "queued" ? [] : generateLossCurve(epochs, startLoss, endLoss);
  const accCurve = status === "queued" ? [] : generateAccCurve(epochs, startAcc, endAcc);
  const valLoss = status === "queued" ? null : +(lossCurve[lossCurve.length - 1] + Math.random() * 0.15).toFixed(4);
  const valAcc = status === "queued" ? null : +(accCurve[accCurve.length - 1] - Math.random() * 0.03).toFixed(4);

  const daysAgo = Math.floor(Math.random() * 14);
  const hoursAgo = Math.floor(Math.random() * 24);
  const created = new Date(Date.now() - daysAgo * 86400000 - hoursAgo * 3600000);
  const durationMin = status === "queued" ? 0 : Math.floor(Math.random() * 180) + 15;

  return {
    id,
    projectId: projects[i % projects.length].id,
    status,
    model,
    dataset,
    optimizer,
    lr,
    batchSize,
    epochs,
    lossCurve,
    accCurve,
    bestLoss: lossCurve.length ? +Math.min(...lossCurve).toFixed(4) : null,
    bestAcc: accCurve.length ? +Math.max(...accCurve).toFixed(4) : null,
    valLoss,
    valAcc,
    created: created.toISOString(),
    durationMin,
  };
});
