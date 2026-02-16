import { signal, computed } from "@preact/signals";
import {
  getAllProjects,
  saveProject,
  updateProject as dbUpdateProject,
  deleteProject as dbDeleteProject,
} from "../db/database.js";

export const projectList = signal([]);
export const currentProjectId = signal(null);

// Load projects from database on initialization
export async function loadProjects() {
  try {
    const projects = await getAllProjects();
    projectList.value = projects;
    if (projects.length > 0 && !currentProjectId.value) {
      currentProjectId.value = projects[0].id;
    }
  } catch (error) {
    console.error("Failed to load projects:", error);
  }
}

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
  connectionType: "localhost",
  sshCommand: "localhost",
  name: "",
  taskType: "Classification",
  modelCategory: "",
  detectionArch: "fcos",
  segHeadType: "deeplabv3plus",
  datasetFormat: "",
  openSourceDataset: "",
  folderPath: "",
  trainPath: "",
  valPath: "",
  testPath: "",
};

export const STEP_COUNT = 6;

export const wizardOpen = signal(false);
export const wizardStep = signal(0);
export const wizardData = signal({ ...defaultData });

// Path validation error signals
export const folderPathError = signal("");
export const trainPathError = signal("");
export const valPathError = signal("");
export const testPathError = signal("");

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
  if (step === 0) return true; // empty = localhost
  if (step === 1) return d.name.trim().length > 0;
  if (step === 2) return d.taskType !== "";
  if (step === 3) return d.modelCategory !== "";
  if (step === 4) {
    if (!d.datasetFormat) return false;
    // For Folder format, require folder path and check validation
    if (d.datasetFormat === "Folder") {
      return d.folderPath.trim().length > 0 && folderPathError.value === "";
    }
    // For CSV and JSONL, require train and test paths (val is optional) and check validation
    if (d.datasetFormat === "CSV" || d.datasetFormat === "JSONL") {
      const hasRequiredPaths = d.trainPath.trim().length > 0 && d.testPath.trim().length > 0;
      const noErrors = trainPathError.value === "" && testPathError.value === "";
      // Val is optional, only check if it's filled
      const valValid = d.valPath.trim() === "" || valPathError.value === "";
      return hasRequiredPaths && noErrors && valValid;
    }
    return true;
  }
  if (step === 5) return true;
  return false;
});

export function openWizard() {
  wizardData.value = { ...defaultData };
  wizardStep.value = 0;
  wizardOpen.value = true;
  // Reset validation errors
  folderPathError.value = "";
  trainPathError.value = "";
  valPathError.value = "";
  testPathError.value = "";
}

export function closeWizard() {
  wizardOpen.value = false;
  // Reset validation errors
  folderPathError.value = "";
  trainPathError.value = "";
  valPathError.value = "";
  testPathError.value = "";
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

export async function addProject(project) {
  try {
    await saveProject(project);
    projectList.value = [...projectList.value, project];
    currentProjectId.value = project.id;
  } catch (error) {
    console.error("Failed to save project:", error);
    throw error;
  }
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
    folderPath: d.folderPath.trim(),
    trainPath: d.trainPath.trim(),
    valPath: d.valPath.trim(),
    testPath: d.testPath.trim(),
  };
  addProject(project);
  closeWizard();
}

export async function updateProject(id, fields) {
  try {
    await dbUpdateProject(id, fields);
    projectList.value = projectList.value.map((p) =>
      p.id === id ? { ...p, ...fields } : p
    );
  } catch (error) {
    console.error("Failed to update project:", error);
    throw error;
  }
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

export async function confirmDeleteProject() {
  if (!deleteConfirmed.value) return;
  const id = deleteTargetId.value;
  try {
    await dbDeleteProject(id);
    const list = projectList.value.filter((p) => p.id !== id);
    projectList.value = list;
    if (currentProjectId.value === id) {
      currentProjectId.value = list.length > 0 ? list[0].id : null;
    }
    closeDeleteDialog();
  } catch (error) {
    console.error("Failed to delete project:", error);
    throw error;
  }
}
