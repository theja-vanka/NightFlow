import { signal } from "@preact/signals";
import {
  filteredRuns,
  filterText,
  filterStatus,
  sortField,
  sortDir,
  toggleSort,
  deleteRun,
} from "../state/experiments.js";
import { navigate } from "../state/router.js";
import { StatusBadge } from "./StatusBadge.jsx";

export const selectedRunIds = signal(new Set());

const columns = [
  { key: "_check", label: "", sortable: false },
  { key: "id", label: "Run" },
  { key: "created", label: "Started" },
  { key: "status", label: "Status" },
  { key: "model", label: "Model" },
  { key: "dataset", label: "Dataset" },
  { key: "bestAcc", label: "Val Acc" },
  { key: "testAcc", label: "Test Acc" },
  { key: "valLoss", label: "Val Loss" },
];

function SortIcon({ field }) {
  if (sortField.value !== field)
    return <span class="sort-icon dim">{"\u2195"}</span>;
  return (
    <span class="sort-icon">
      {sortDir.value === "asc" ? "\u2191" : "\u2193"}
    </span>
  );
}

function toggleSelect(runId, e) {
  e.stopPropagation();
  const next = new Set(selectedRunIds.value);
  if (next.has(runId)) next.delete(runId);
  else next.add(runId);
  selectedRunIds.value = next;
}

function toggleSelectAll() {
  const ids = filteredRuns.value.map((r) => r.id);
  const allSelected =
    ids.length > 0 && ids.every((id) => selectedRunIds.value.has(id));
  selectedRunIds.value = allSelected ? new Set() : new Set(ids);
}

async function deleteSelected() {
  const ids = [...selectedRunIds.value];
  for (const id of ids) {
    await deleteRun(id);
  }
  selectedRunIds.value = new Set();
}

export function RunsTable() {
  const ids = filteredRuns.value.map((r) => r.id);
  const allChecked =
    ids.length > 0 && ids.every((id) => selectedRunIds.value.has(id));
  const someChecked = selectedRunIds.value.size > 0;

  return (
    <div class="runs-table-wrapper">
      <div class="runs-filters">
        <div class="filter-input-wrap">
          <span class="filter-input-icon">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </span>
          <input
            type="text"
            class="filter-input"
            placeholder="Filter by ID, model, dataset..."
            value={filterText}
            onInput={(e) => (filterText.value = e.currentTarget.value)}
          />
        </div>
        <select
          class="filter-select"
          value={filterStatus}
          onChange={(e) => (filterStatus.value = e.currentTarget.value)}
        >
          <option value="all">All Status</option>
          <option value="completed">Completed</option>
          <option value="running">Running</option>
          <option value="failed">Failed</option>
          <option value="queued">Queued</option>
        </select>
        {someChecked && (
          <>
            {selectedRunIds.value.size >= 2 && (
              <button
                class="runs-compare-selected"
                onClick={() =>
                  navigate("compare-runs", { runIds: [...selectedRunIds.value] })
                }
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M3 3v18h18" />
                  <path d="m19 9-5 5-4-4-3 3" />
                </svg>
                Compare {selectedRunIds.value.size} selected
              </button>
            )}
            <button class="runs-delete-selected" onClick={deleteSelected}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6l-1 14H6L5 6" />
                <path d="M10 11v6M14 11v6" />
                <path d="M9 6V4h6v2" />
              </svg>
              Delete {selectedRunIds.value.size} selected
            </button>
          </>
        )}
      </div>
      <div class="table-scroll">
        <table class="runs-table">
          <thead>
            <tr>
              {columns.map((col) =>
                col.key === "_check" ? (
                  <th key="_check" class="check-col">
                    <input
                      type="checkbox"
                      checked={allChecked}
                      onChange={toggleSelectAll}
                    />
                  </th>
                ) : (
                  <th
                    key={col.key}
                    class={col.sortable === false ? "" : "sortable"}
                    onClick={
                      col.sortable === false
                        ? undefined
                        : () => toggleSort(col.key)
                    }
                  >
                    {col.label}
                    {col.sortable !== false && <SortIcon field={col.key} />}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {filteredRuns.value.map((run) => (
              <tr
                key={run.id}
                class={`clickable-row${selectedRunIds.value.has(run.id) ? " selected" : ""}`}
                onClick={() => navigate("run-detail", { runId: run.id })}
              >
                <td class="check-col" onClick={(e) => toggleSelect(run.id, e)}>
                  <input
                    type="checkbox"
                    checked={selectedRunIds.value.has(run.id)}
                    onChange={() => { }}
                  />
                </td>
                <td class="mono">{run.name || run.id}</td>
                <td class="mono">
                  {run.created
                    ? new Date(run.created).toLocaleString()
                    : "\u2014"}
                </td>
                <td>
                  <StatusBadge status={run.status} />
                </td>
                <td>{run.model}</td>
                <td>{run.dataset}</td>
                <td class="mono">
                  {run.bestAcc != null ? run.bestAcc.toFixed(4) : "\u2014"}
                </td>
                <td class="mono">
                  {run.testAcc != null ? run.testAcc.toFixed(4) : "\u2014"}
                </td>
                <td class="mono">
                  {run.valLoss != null ? run.valLoss.toFixed(4) : "\u2014"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
