import { signal, computed } from "@preact/signals";
import { invoke } from "@tauri-apps/api/core";
import { currentProjectId, projectList } from "./projects.js";
import {
  getAllRuns,
  saveRun,
  updateRun as dbUpdateRun,
  deleteRun as dbDeleteRun,
} from "../db/database.js";

export const allRuns = signal([]);

// MLflow-style random run name generator
const RUN_ADJECTIVES = [
  "abundant", "aged", "ambitious", "ancient", "artistic", "atomic", "autumn",
  "bald", "beloved", "blazing", "bold", "brave", "bright", "bronze",
  "calm", "caring", "celestial", "charming", "clever", "coastal", "coral", "cosmic", "crimson", "crystal",
  "daring", "dazzling", "deep", "defiant", "delicate", "desert", "divine",
  "eager", "earthy", "electric", "elegant", "enchanted", "endless", "epic",
  "fair", "fearless", "fiery", "floral", "flying", "fortunate", "frosty",
  "gentle", "gifted", "gleaming", "glorious", "golden", "graceful", "granite",
  "hallowed", "hardy", "harmonic", "hearty", "hidden", "honest", "humbled",
  "icy", "illustrious", "immense", "indigo", "infinite", "ivory",
  "jade", "jazzy", "jolly", "jovial", "joyful", "jubilant",
  "keen", "kind", "knowing",
  "lasting", "lavish", "learned", "legendary", "light", "lively", "lucky", "lunar",
  "magnetic", "majestic", "marble", "mellow", "mighty", "misty", "moonlit",
  "nebular", "nimble", "noble", "northern",
  "obsidian", "oceanic", "onyx", "opal", "ornate",
  "pacific", "patient", "pearly", "phantom", "placid", "polished", "proud",
  "quaint", "quartz", "quiet",
  "radiant", "rapid", "resilient", "rogue", "rosy", "royal", "rustic",
  "sacred", "scarlet", "scenic", "serene", "sharp", "shining", "silent", "silver", "skilled", "sleek", "solar", "splendid", "stellar", "stoic", "stormy", "sturdy", "subtle", "sunny", "swift",
  "teal", "tender", "thriving", "tidal", "tranquil", "twilight",
  "unique", "upbeat", "upward",
  "valiant", "verdant", "vibrant", "vigilant", "vintage", "violet", "vivid",
  "wandering", "warm", "wary", "wealthy", "whispering", "wild", "wintry", "wise", "wondrous",
  "young",
  "zealous", "zesty",
];

const RUN_NOUNS = [
  "alpaca", "antelope", "aurora",
  "badger", "basilisk", "bear", "beetle", "bison", "blaze",
  "canary", "caribou", "cedar", "cheetah", "cobra", "condor", "cougar", "crane", "crest",
  "dagger", "dawn", "deer", "dolphin", "dove", "dragon", "drift", "dusk",
  "eagle", "eclipse", "elm", "ember", "enigma",
  "falcon", "fern", "finch", "flame", "flare", "fox", "frost",
  "galaxy", "garnet", "gazelle", "glacier", "glow", "gorilla", "grove",
  "harbor", "hare", "hawk", "haze", "heron", "horizon",
  "ibex", "iris",
  "jackal", "jaguar", "jay", "jewel",
  "kestrel", "kingfisher", "kite",
  "lark", "leopard", "lightning", "lion", "lotus", "lynx",
  "magnet", "maple", "marsh", "meadow", "meteor", "mist", "monarch", "moon", "moth",
  "nebula", "newt", "nighthawk",
  "oasis", "onyx", "orbit", "orca", "osprey", "otter", "owl",
  "panther", "peak", "pelican", "phoenix", "pine", "plover", "prism", "pulse", "puma",
  "quail", "quasar",
  "raven", "reef", "ridge", "river", "robin", "rose",
  "sage", "salmon", "scepter", "sequoia", "shadow", "shark", "sky", "slate", "snow", "sparrow", "sphinx", "spruce", "star", "storm", "summit", "swan",
  "tempest", "terra", "thistle", "thunder", "tiger", "torch", "trout", "tundra",
  "urchin",
  "vale", "vapor", "viper", "void", "volt", "vortex", "vulture",
  "walrus", "wave", "whisper", "willow", "wind", "wing", "wolf", "wren",
  "yak",
  "zephyr", "zenith",
];

export function generateRunName() {
  const adj = RUN_ADJECTIVES[Math.floor(Math.random() * RUN_ADJECTIVES.length)];
  const noun = RUN_NOUNS[Math.floor(Math.random() * RUN_NOUNS.length)];
  const num = Math.floor(Math.random() * 900) + 100; // 100–999
  return `${adj}-${noun}-${num}`;
}

// Load runs from database on initialization
export async function loadRuns() {
  try {
    const runs = await getAllRuns();
    allRuns.value = runs;
  } catch (error) {
    console.error("Failed to load runs:", error);
  }
}

// Add a new run
export async function addRun(run) {
  try {
    await saveRun(run);
    allRuns.value = [...allRuns.value, run];
  } catch (error) {
    console.error("Failed to save run:", error);
    throw error;
  }
}

// Update an existing run
export async function updateRun(id, updates) {
  try {
    await dbUpdateRun(id, updates);
    allRuns.value = allRuns.value.map((r) =>
      r.id === id ? { ...r, ...updates } : r
    );
  } catch (error) {
    console.error("Failed to update run:", error);
    throw error;
  }
}

// Delete a run
export async function deleteRun(id) {
  try {
    await dbDeleteRun(id);
    allRuns.value = allRuns.value.filter((r) => r.id !== id);
  } catch (error) {
    console.error("Failed to delete run:", error);
    throw error;
  }
}

// Import TensorBoard runs parsed by the Rust backend
export async function importTensorboardRuns(tbRuns, projectId, project) {
  const existingIds = new Set(allRuns.value.map((r) => r.id));

  for (const run of tbRuns) {
    const id = `tb-${run.version}`;
    if (existingIds.has(id)) continue;

    const scalars = run.scalars || {};

    // Find loss curve: prefer "train/loss", fallback to "loss"
    const lossTag = scalars["train/loss"] || scalars["loss"] || [];
    const lossCurve = lossTag
      .slice()
      .sort((a, b) => a.step - b.step)
      .map((s) => s.value);

    // Find accuracy curve: prefer "val/accuracy", fallback to "val/acc"
    const accTag = scalars["val/accuracy"] || scalars["val/acc"] || [];
    const accCurve = accTag
      .slice()
      .sort((a, b) => a.step - b.step)
      .map((s) => s.value);

    // Val loss
    const valLossTag = scalars["val/loss"] || [];
    const valLoss =
      valLossTag.length > 0
        ? valLossTag.sort((a, b) => a.step - b.step).at(-1).value
        : null;

    const bestAcc = accCurve.length > 0 ? Math.max(...accCurve) : null;

    const newRun = {
      id,
      name: generateRunName(),
      projectId,
      status: "completed",
      model: project?.modelCategory || "unknown",
      dataset: project?.datasetName || "unknown",
      lossCurve,
      accCurve,
      bestAcc,
      valLoss,
      epochs: lossCurve.length || accCurve.length,
      created: Date.now(),
      source: "tensorboard",
      tbVersion: run.version,
    };

    try {
      await addRun(newRun);
    } catch (err) {
      console.error(`Failed to import TB run ${id}:`, err);
    }
  }
}

// Load all scalar tags for a single run on-demand via the Rust backend
export async function loadRunScalars(run) {
  if (!run?.tbVersion) return null;
  const project = projectList.value.find((p) => p.id === run.projectId);
  if (!project?.path) return null;
  try {
    const tbRun = await invoke("scan_tensorboard_run", {
      projectPath: project.path,
      version: run.tbVersion,
    });
    return tbRun?.scalars || null;
  } catch (err) {
    console.error("Failed to load run scalars:", err);
    return null;
  }
}

export const projectRuns = computed(() =>
  allRuns.value.filter((r) => r.projectId === currentProjectId.value)
);

export const filterText = signal("");
export const filterStatus = signal("all");
export const sortField = signal("created");
export const sortDir = signal("desc");

export const filteredRuns = computed(() => {
  let result = projectRuns.value;

  const q = filterText.value.toLowerCase();
  if (q) {
    result = result.filter(
      (r) =>
        r.id.toLowerCase().includes(q) ||
        (r.name && r.name.toLowerCase().includes(q)) ||
        r.model.toLowerCase().includes(q) ||
        r.dataset.toLowerCase().includes(q)
    );
  }

  if (filterStatus.value !== "all") {
    result = result.filter((r) => r.status === filterStatus.value);
  }

  const field = sortField.value;
  const dir = sortDir.value === "asc" ? 1 : -1;
  result = [...result].sort((a, b) => {
    const va = a[field] ?? "";
    const vb = b[field] ?? "";
    if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
    return String(va).localeCompare(String(vb)) * dir;
  });

  return result;
});

export function toggleSort(field) {
  if (sortField.value === field) {
    sortDir.value = sortDir.value === "asc" ? "desc" : "asc";
  } else {
    sortField.value = field;
    sortDir.value = "desc";
  }
}
