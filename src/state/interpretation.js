import { signal, computed } from "@preact/signals";
import { projectRuns } from "./experiments.js";

export const INTERPRETATION_METHODS = [
  { id: "gradcam", label: "GradCAM", desc: "Class activation mapping" },
  { id: "gradcampp", label: "GradCAM++", desc: "Better for multiple objects" },
  {
    id: "integrated_gradients",
    label: "Integrated Gradients",
    desc: "Pixel-level attribution",
  },
  { id: "smoothgrad", label: "SmoothGrad", desc: "Noise-reduced gradients" },
  {
    id: "attention_rollout",
    label: "Attention Rollout",
    desc: "For Vision Transformers",
  },
  {
    id: "attention_flow",
    label: "Attention Flow",
    desc: "Transformer attention flow",
  },
];

export const completedRuns = computed(() =>
  projectRuns.value.filter((r) => r.status === "completed"),
);

export const selectedRunId = signal("");
export const selectedRun = computed(
  () => completedRuns.value.find((r) => r.id === selectedRunId.value) || null,
);

export const uploadedImage = signal(null);
export const selectedMethod = signal("gradcam");

export function selectRun(id) {
  selectedRunId.value = id;
}

export function setMethod(id) {
  selectedMethod.value = id;
}

export function setImage(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    uploadedImage.value = { name: file.name, url: e.target.result };
  };
  reader.readAsDataURL(file);
}

export function clearImage() {
  uploadedImage.value = null;
}
