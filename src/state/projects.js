import { signal, computed } from "@preact/signals";
import { projects as mockProjects } from "../data/mock.js";

export const projectList = signal([...mockProjects]);
export const currentProjectId = signal(mockProjects[0].id);

export const currentProject = computed(() =>
  projectList.value.find((p) => p.id === currentProjectId.value) || null
);

// ── Wizard constants (derived from AutoTimm API) ──

export const TASK_TYPES = [
  { id: "Classification", label: "Classification", desc: "Assign a single label to each image" },
  { id: "Multi-Label Classification", label: "Multi-Label Classification", desc: "Assign multiple labels per image" },
  { id: "Object Detection", label: "Object Detection", desc: "Locate and classify objects with bounding boxes" },
  { id: "Semantic Segmentation", label: "Semantic Segmentation", desc: "Label every pixel with a class" },
  { id: "Instance Segmentation", label: "Instance Segmentation", desc: "Separate individual object instances at pixel level" },
];

export const MODEL_CATEGORIES = {
  "Edge": {
    desc: "Lightweight models for mobile & embedded deployment",
    models: ["efficientnet_b0", "mobilenetv3_small_100", "efficientnet_lite0", "resnet18"],
  },
  "Balanced": {
    desc: "Good accuracy-speed tradeoff for general use",
    models: ["resnet50", "efficientnet_b2", "convnext_tiny", "swin_tiny_patch4_window7_224"],
  },
  "Cloud": {
    desc: "High-accuracy models for server-side inference",
    models: ["resnet101", "efficientnet_b4", "convnext_base", "swin_base_patch4_window7_224"],
  },
  "Research": {
    desc: "State-of-the-art transformer architectures",
    models: ["vit_base_patch16_224", "vit_small_patch16_224", "deit_base_patch16_224", "beit_base_patch16_224"],
  },
};

export const DETECTION_ARCHS = ["fcos", "yolox"];

export const SEG_HEAD_TYPES = ["deeplabv3plus", "fcn"];

// Dataset formats per task
export const DATASET_FORMATS = {
  "Classification": [
    { id: "Folder", label: "Folder", desc: "Subdirectory per class (ImageFolder)" },
    { id: "CSV", label: "CSV", desc: "Comma-separated file with image paths and labels" },
    { id: "JSONL", label: "JSONL", desc: "One JSON object per line with image and label" },
  ],
  "Multi-Label Classification": [
    { id: "CSV", label: "CSV", desc: "Image paths with pipe-separated labels" },
    { id: "JSONL", label: "JSONL", desc: "JSON objects with label arrays" },
  ],
  "Object Detection": [
    { id: "COCO JSON", label: "COCO JSON", desc: "Standard COCO format with annotations and categories" },
    { id: "CSV", label: "CSV", desc: "Rows with image path, bounding box, and label" },
    { id: "JSONL", label: "JSONL", desc: "JSON objects with bounding box lists" },
  ],
  "Semantic Segmentation": [
    { id: "PNG Masks", label: "PNG Masks", desc: "Pixel-value masks matching image filenames" },
    { id: "COCO", label: "COCO", desc: "COCO panoptic format with segmentation polygons" },
    { id: "Cityscapes", label: "Cityscapes", desc: "City-based folder layout with label ID masks" },
    { id: "VOC", label: "VOC", desc: "Pascal VOC layout with SegmentationClass masks" },
    { id: "CSV", label: "CSV", desc: "Image path to mask path mapping" },
    { id: "JSONL", label: "JSONL", desc: "JSON objects mapping images to masks" },
  ],
  "Instance Segmentation": [
    { id: "COCO JSON", label: "COCO JSON", desc: "COCO format with per-instance polygons and bboxes" },
    { id: "CSV", label: "CSV", desc: "Rows with image, mask path, label, and instance ID" },
    { id: "JSONL", label: "JSONL", desc: "JSON objects with instance annotation lists" },
  ],
};

// Open-source datasets per task for testing
export const OPENSOURCE_DATASETS = {
  "Classification": [
    { name: "ImageNet-1K", desc: "1.28M images, 1000 classes", format: "Folder" },
    { name: "CIFAR-10", desc: "60K images, 10 classes", format: "Folder" },
    { name: "CIFAR-100", desc: "60K images, 100 classes", format: "Folder" },
    { name: "Oxford Flowers-102", desc: "8K images, 102 flower species", format: "Folder" },
    { name: "Stanford Cars", desc: "16K images, 196 car models", format: "Folder" },
  ],
  "Multi-Label Classification": [
    { name: "Pascal VOC 2012", desc: "11K images, 20 object classes", format: "CSV" },
    { name: "MS-COCO Multi-Label", desc: "123K images, 80 categories", format: "CSV" },
    { name: "NUS-WIDE", desc: "270K images, 81 concepts", format: "CSV" },
  ],
  "Object Detection": [
    { name: "MS-COCO 2017", desc: "118K train images, 80 categories", format: "COCO JSON" },
    { name: "Pascal VOC 2012", desc: "11K images, 20 classes", format: "CSV" },
    { name: "Open Images v7", desc: "1.9M images, 600 classes", format: "COCO JSON" },
  ],
  "Semantic Segmentation": [
    { name: "ADE20K", desc: "25K images, 150 semantic classes", format: "PNG Masks" },
    { name: "Cityscapes", desc: "5K fine-annotated urban scenes", format: "Cityscapes" },
    { name: "Pascal VOC 2012", desc: "2.9K segmentation masks", format: "VOC" },
  ],
  "Instance Segmentation": [
    { name: "MS-COCO 2017", desc: "118K images, 80 categories", format: "COCO JSON" },
    { name: "LVIS v1", desc: "164K images, 1203 categories", format: "COCO JSON" },
    { name: "Cityscapes", desc: "5K fine instance annotations", format: "COCO JSON" },
  ],
};

// ── Wizard state ──

const defaultData = {
  sshCommand: "",
  name: "",
  taskType: "Classification",
  modelCategory: "",
  detectionArch: "fcos",
  segHeadType: "deeplabv3plus",
  datasetFormat: "",
  openSourceDataset: "",
};

export const STEP_COUNT = 6;

export const wizardOpen = signal(false);
export const wizardStep = signal(0);
export const wizardData = signal({ ...defaultData });

export const STEP_LABELS = [
  "SSH",
  "Name",
  "Task",
  "Backbone",
  "Dataset",
  "Confirm",
];

export const wizardCanProceed = computed(() => {
  const d = wizardData.value;
  const step = wizardStep.value;
  if (step === 0) return d.sshCommand.trim().length > 0;
  if (step === 1) return d.name.trim().length > 0;
  if (step === 2) return d.taskType !== "";
  if (step === 3) return d.modelCategory !== "";
  if (step === 4) return d.datasetFormat !== "";
  if (step === 5) return true;
  return false;
});

export function openWizard() {
  wizardData.value = { ...defaultData };
  wizardStep.value = 0;
  wizardOpen.value = true;
}

export function closeWizard() {
  wizardOpen.value = false;
}

export function wizardNext() {
  if (!wizardCanProceed.value) return;
  if (wizardStep.value < STEP_COUNT - 1) {
    wizardStep.value = wizardStep.value + 1;
  }
}

export function wizardBack() {
  if (wizardStep.value > 0) {
    wizardStep.value = wizardStep.value - 1;
  }
}

export function wizardSetField(field, value) {
  wizardData.value = { ...wizardData.value, [field]: value };
}

export function addProject(project) {
  projectList.value = [...projectList.value, project];
  currentProjectId.value = project.id;
}

export function wizardCreate() {
  if (!wizardCanProceed.value) return;
  const d = wizardData.value;
  const project = {
    id: `proj-${Date.now()}`,
    sshCommand: d.sshCommand.trim(),
    name: d.name.trim(),
    taskType: d.taskType,
    modelCategory: d.modelCategory,
    detectionArch: d.detectionArch,
    segHeadType: d.segHeadType,
    datasetFormat: d.datasetFormat,
  };
  addProject(project);
  closeWizard();
}

export function selectProject(id) {
  currentProjectId.value = id;
}

// ── Delete project state ──

export const deleteDialogOpen = signal(false);
export const deleteTargetId = signal(null);
export const deleteConfirmText = signal("");

export const deleteTarget = computed(() =>
  projectList.value.find((p) => p.id === deleteTargetId.value) || null
);

export const deleteConfirmed = computed(() =>
  deleteConfirmText.value.toLowerCase() === "delete"
);

export function openDeleteDialog(id) {
  deleteTargetId.value = id;
  deleteConfirmText.value = "";
  deleteDialogOpen.value = true;
}

export function closeDeleteDialog() {
  deleteDialogOpen.value = false;
  deleteTargetId.value = null;
  deleteConfirmText.value = "";
}

export function confirmDeleteProject() {
  if (!deleteConfirmed.value) return;
  const id = deleteTargetId.value;
  const list = projectList.value.filter((p) => p.id !== id);
  projectList.value = list;
  if (currentProjectId.value === id && list.length > 0) {
    currentProjectId.value = list[0].id;
  }
  closeDeleteDialog();
}
