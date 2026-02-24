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

// Load scalars from a run's JSONL file on disk and persist to IndexedDB
export async function loadRunScalarsFromJsonl(run) {
  if (!run?.name) return null;
  const project = projectList.value.find((p) => p.id === run.projectId);
  if (!project?.projectPath) return null;
  try {
    const scalars = await invoke("parse_run_jsonl", {
      projectPath: project.projectPath,
      runId: run.id,
    });
    if (scalars && Object.keys(scalars).length > 0) {
      // Persist to the run so future opens are instant
      await updateRun(run.id, { scalars });
      return scalars;
    }
    return null;
  } catch (err) {
    console.error("Failed to load run scalars from JSONL:", err);
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
