import { signal, computed } from "@preact/signals";
import { currentProjectId } from "./projects.js";
import {
  getAllRuns,
  saveRun,
  updateRun as dbUpdateRun,
  deleteRun as dbDeleteRun,
} from "../db/database.js";

export const allRuns = signal([]);

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
