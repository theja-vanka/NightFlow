import { filteredRuns, filterText, filterStatus, sortField, sortDir, toggleSort } from "../state/experiments.js";
import { StatusBadge } from "./StatusBadge.jsx";
import { Sparkline } from "./Sparkline.jsx";

const columns = [
  { key: "id", label: "Run" },
  { key: "status", label: "Status" },
  { key: "model", label: "Model" },
  { key: "dataset", label: "Dataset" },
  { key: "bestAcc", label: "Best Acc" },
  { key: "valLoss", label: "Val Loss" },
  { key: "epochs", label: "Epochs" },
  { key: "lr", label: "LR" },
  { key: "loss", label: "Loss Curve", sortable: false },
];

function SortIcon({ field }) {
  if (sortField.value !== field) return <span class="sort-icon dim">&udarr;</span>;
  return <span class="sort-icon">{sortDir.value === "asc" ? "\u2191" : "\u2193"}</span>;
}

export function RunsTable() {
  return (
    <div class="runs-table-wrapper">
      <div class="runs-filters">
        <input
          type="text"
          class="filter-input"
          placeholder="Filter by ID, model, dataset..."
          value={filterText}
          onInput={(e) => (filterText.value = e.currentTarget.value)}
        />
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
      </div>
      <div class="table-scroll">
        <table class="runs-table">
          <thead>
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  class={col.sortable === false ? "" : "sortable"}
                  onClick={col.sortable === false ? undefined : () => toggleSort(col.key)}
                >
                  {col.label}
                  {col.sortable !== false && <SortIcon field={col.key} />}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredRuns.value.map((run) => (
              <tr key={run.id}>
                <td class="mono">{run.name || run.id}</td>
                <td><StatusBadge status={run.status} /></td>
                <td>{run.model}</td>
                <td>{run.dataset}</td>
                <td class="mono">{run.bestAcc != null ? run.bestAcc.toFixed(4) : "—"}</td>
                <td class="mono">{run.valLoss != null ? run.valLoss.toFixed(4) : "—"}</td>
                <td class="mono">{run.epochs}</td>
                <td class="mono">{run.lr}</td>
                <td><Sparkline data={run.lossCurve} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
