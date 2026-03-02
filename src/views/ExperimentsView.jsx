import { RunsTable } from "../components/RunsTable.jsx";
import { ExportDropdown } from "../components/ExportDropdown.jsx";
import { filteredRuns } from "../state/experiments.js";

export function ExperimentsView() {
  return (
    <div class="experiments-view">
      <div style="display:flex;justify-content:flex-end;margin-bottom:8px">
        <ExportDropdown runs={filteredRuns.value} filenamePrefix="experiments" />
      </div>
      <RunsTable />
    </div>
  );
}
