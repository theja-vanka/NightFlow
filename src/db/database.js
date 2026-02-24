import { openDB, deleteDB } from "idb";

const DB_NAME = 'nightflow-db';
const DB_VERSION = 1;

// Initialize the database
export async function initDB() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // Create projects store
      if (!db.objectStoreNames.contains('projects')) {
        const projectStore = db.createObjectStore('projects', { keyPath: 'id' });
        projectStore.createIndex('name', 'name', { unique: false });
        projectStore.createIndex('taskType', 'taskType', { unique: false });
      }

      // Create runs store
      if (!db.objectStoreNames.contains('runs')) {
        const runStore = db.createObjectStore('runs', { keyPath: 'id' });
        runStore.createIndex('projectId', 'projectId', { unique: false });
        runStore.createIndex('status', 'status', { unique: false });
        runStore.createIndex('created', 'created', { unique: false });
      }
    },
  });
}

// ========================================
// Project CRUD Operations
// ========================================

export async function saveProject(project) {
  const db = await initDB();
  await db.put('projects', project);
  return project;
}

export async function getAllProjects() {
  const db = await initDB();
  return db.getAll('projects');
}

export async function getProject(id) {
  const db = await initDB();
  return db.get('projects', id);
}

export async function deleteProject(id) {
  const db = await initDB();
  const tx = db.transaction(['projects', 'runs'], 'readwrite');

  // Delete the project
  await tx.objectStore('projects').delete(id);

  // Delete all runs associated with this project
  const runStore = tx.objectStore('runs');
  const projectRuns = await runStore.index('projectId').getAllKeys(id);
  for (const runId of projectRuns) {
    await runStore.delete(runId);
  }

  await tx.done;
}

export async function updateProject(id, updates) {
  const db = await initDB();
  const project = await db.get('projects', id);
  if (!project) {
    throw new Error(`Project with id ${id} not found`);
  }
  const updated = { ...project, ...updates };
  await db.put('projects', updated);
  return updated;
}

// ========================================
// Run CRUD Operations
// ========================================

export async function saveRun(run) {
  const db = await initDB();
  await db.put('runs', run);
  return run;
}

export async function getAllRuns() {
  const db = await initDB();
  return db.getAll('runs');
}

export async function getRun(id) {
  const db = await initDB();
  return db.get('runs', id);
}

export async function getRunsByProject(projectId) {
  const db = await initDB();
  return db.getAllFromIndex('runs', 'projectId', projectId);
}

export async function deleteRun(id) {
  const db = await initDB();
  await db.delete('runs', id);
}

export async function updateRun(id, updates) {
  const db = await initDB();
  const run = await db.get('runs', id);
  if (!run) {
    throw new Error(`Run with id ${id} not found`);
  }
  const updated = { ...run, ...updates };
  await db.put('runs', updated);
  return updated;
}

// ========================================
// Bulk Operations
// ========================================

export async function clearAllData() {
  const db = await initDB();
  db.close();
  await deleteDB(DB_NAME);
}

export async function exportData() {
  const db = await initDB();
  const projects = await db.getAll('projects');
  const runs = await db.getAll('runs');
  return { projects, runs };
}

// ========================================
// Sync Metadata Operations
// ========================================

export async function saveSyncMetadata(projectId, metadata) {
  const db = await initDB();
  const project = await db.get('projects', projectId);
  if (!project) return;
  await db.put('projects', { ...project, syncMetadata: metadata });
}

export async function getSyncMetadata(projectId) {
  const db = await initDB();
  const project = await db.get('projects', projectId);
  return project?.syncMetadata || null;
}

export async function importData(data) {
  const db = await initDB();
  const tx = db.transaction(['projects', 'runs'], 'readwrite');

  // Clear existing data
  await tx.objectStore('projects').clear();
  await tx.objectStore('runs').clear();

  // Import new data
  if (data.projects) {
    for (const project of data.projects) {
      await tx.objectStore('projects').put(project);
    }
  }

  if (data.runs) {
    for (const run of data.runs) {
      await tx.objectStore('runs').put(run);
    }
  }

  await tx.done;
}
