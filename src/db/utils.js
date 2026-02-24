import { exportData, importData, clearAllData } from "./database.js";

/**
 * Export all data to a JSON file
 */
export async function exportToJSON() {
  try {
    const data = await exportData();
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `nightflow-backup-${Date.now()}.json`;
    a.click();

    URL.revokeObjectURL(url);
    return true;
  } catch (error) {
    console.error("Failed to export data:", error);
    return false;
  }
}

/**
 * Import data from a JSON file
 */
export async function importFromJSON(file) {
  try {
    const text = await file.text();
    const data = JSON.parse(text);

    // Validate data structure
    if (!data.projects || !Array.isArray(data.projects)) {
      throw new Error("Invalid backup file: missing projects array");
    }
    if (!data.runs || !Array.isArray(data.runs)) {
      throw new Error("Invalid backup file: missing runs array");
    }

    await importData(data);
    return true;
  } catch (error) {
    console.error("Failed to import data:", error);
    return false;
  }
}

/**
 * Clear all data from the database (use with caution!)
 */
export async function clearDatabase() {
  try {
    await clearAllData();
    return true;
  } catch (error) {
    console.error("Failed to clear database:", error);
    return false;
  }
}

/**
 * Get database statistics
 */
export async function getDatabaseStats() {
  try {
    const data = await exportData();
    return {
      projectCount: data.projects.length,
      runCount: data.runs.length,
      totalSize: JSON.stringify(data).length,
    };
  } catch (error) {
    console.error("Failed to get database stats:", error);
    return null;
  }
}
