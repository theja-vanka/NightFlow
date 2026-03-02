import { useState, useEffect } from "preact/hooks";
import { invoke } from "@tauri-apps/api/core";
import { convertFileSrc } from "@tauri-apps/api/core";
import { currentProject } from "../state/projects.js";

const PAGE_SIZE = 50;

export function DatasetBrowserView() {
  const project = currentProject.value;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [offset, setOffset] = useState(0);
  const [classFilter, setClassFilter] = useState("");

  const datasetPath =
    project?.folderPath || project?.trainPath || "";
  const datasetFormat = project?.datasetFormat || "Folder";

  useEffect(() => {
    if (!datasetPath) return;
    setLoading(true);
    setError(null);
    invoke("browse_dataset", {
      path: datasetPath,
      format: datasetFormat,
      limit: PAGE_SIZE,
      offset,
      classFilter: classFilter || null,
    })
      .then((result) => {
        setData(result);
        setLoading(false);
      })
      .catch((err) => {
        setError(String(err));
        setLoading(false);
      });
  }, [datasetPath, datasetFormat, offset, classFilter]);

  if (!project) {
    return (
      <div class="dataset-browser-view">
        <div class="run-detail-error">No project selected.</div>
      </div>
    );
  }

  if (!datasetPath) {
    return (
      <div class="dataset-browser-view">
        <div class="run-detail-empty" style="padding:40px 0">
          No dataset path configured. Set a dataset path in Settings.
        </div>
      </div>
    );
  }

  const classCounts = data?.class_counts || {};
  const classNames = Object.keys(classCounts).sort();
  const totalAllClasses = Object.values(classCounts).reduce((s, n) => s + n, 0);
  const maxCount = Math.max(1, ...Object.values(classCounts));
  const images = data?.images || [];
  const total = data?.total || 0;

  function handleClassFilter(value) {
    setClassFilter(value);
    setOffset(0);
  }

  return (
    <div class="dataset-browser-view">
      {/* Filter bar — matches runs-filters pattern */}
      <div class="runs-filters">
        <select
          class="filter-select"
          value={classFilter}
          onChange={(e) => handleClassFilter(e.currentTarget.value)}
        >
          <option value="">All Classes</option>
          {classNames.map((c) => (
            <option key={c} value={c}>
              {c} ({classCounts[c]})
            </option>
          ))}
        </select>
        <span class="dataset-browser-stats">
          {classFilter
            ? `${total} of ${totalAllClasses} images`
            : `${totalAllClasses} images`}
          {" · "}{classNames.length} classes
        </span>
      </div>

      {error && <div class="training-panel-error">{error}</div>}

      {/* Class distribution */}
      {classNames.length > 0 && classNames.length <= 30 && (
        <div class="dataset-class-dist">
          {classNames.map((c) => (
            <button
              key={c}
              class={`dataset-class-bar-row${classFilter === c ? " active" : ""}`}
              onClick={() => handleClassFilter(classFilter === c ? "" : c)}
            >
              <span class="dataset-class-bar-label" title={c}>
                {c}
              </span>
              <div class="dataset-class-bar-track">
                <div
                  class="dataset-class-bar-fill"
                  style={{
                    width: `${((classCounts[c] || 0) / maxCount) * 100}%`,
                  }}
                />
              </div>
              <span class="dataset-class-bar-count">{classCounts[c]}</span>
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div class="run-detail-loading">Loading dataset images...</div>
      ) : (
        <>
          {images.length === 0 && (
            <div class="run-detail-empty">
              {classFilter
                ? `No images found for class "${classFilter}".`
                : "No images found in this dataset."}
            </div>
          )}

          <div class="dataset-browser-grid">
            {images.map((img) => (
              <div key={img.path} class="dataset-browser-card">
                <img
                  class="dataset-browser-thumb"
                  src={convertFileSrc(img.path)}
                  alt={img.label}
                  loading="lazy"
                />
                <div class="dataset-browser-card-label" title={img.label}>
                  {img.label}
                </div>
              </div>
            ))}
          </div>

          {total > PAGE_SIZE && (
            <div class="dataset-browser-pagination">
              <button
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              >
                &larr; Previous
              </button>
              <span class="dataset-browser-stats">
                {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {total}
              </span>
              <button
                disabled={offset + PAGE_SIZE >= total}
                onClick={() => setOffset(offset + PAGE_SIZE)}
              >
                Next &rarr;
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
