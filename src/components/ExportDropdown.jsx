import { useState } from "preact/hooks";
import {
  exportRunsAsCSV,
  exportRunsAsJSON,
  downloadFile,
} from "../utils/exportRuns.js";

export function ExportDropdown({ runs, filenamePrefix = "runs" }) {
  const [open, setOpen] = useState(false);

  if (!runs || runs.length === 0) return null;

  function handleExport(format) {
    setOpen(false);
    if (format === "csv") {
      const csv = exportRunsAsCSV(Array.isArray(runs) ? runs : [runs]);
      downloadFile(csv, `${filenamePrefix}.csv`, "text/csv");
    } else {
      const json = exportRunsAsJSON(Array.isArray(runs) ? runs : [runs]);
      downloadFile(json, `${filenamePrefix}.json`, "application/json");
    }
  }

  return (
    <div class="export-dropdown-wrap">
      <button class="export-btn" onClick={() => setOpen(!open)}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
        Export
      </button>
      {open && (
        <div class="export-dropdown-menu">
          <button class="export-dropdown-item" onClick={() => handleExport("csv")}>
            CSV
          </button>
          <button class="export-dropdown-item" onClick={() => handleExport("json")}>
            JSON
          </button>
        </div>
      )}
    </div>
  );
}
