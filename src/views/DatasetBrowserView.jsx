import { useState, useEffect, useCallback } from "preact/hooks";
import { invoke } from "@tauri-apps/api/core";
import { convertFileSrc } from "@tauri-apps/api/core";
import { currentProject } from "../state/projects.js";

const PAGE_SIZE = 50;

function extractFilename(filePath) {
  if (!filePath) return "";
  const parts = filePath.replace(/\\/g, "/").split("/");
  return parts[parts.length - 1] || "";
}

export function DatasetBrowserView() {
  const project = currentProject.value;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [offset, setOffset] = useState(0);
  const [selectedClasses, setSelectedClasses] = useState(new Set());
  const [lightbox, setLightbox] = useState(null);
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const isCsvOrJsonl = project?.datasetFormat === "CSV" || project?.datasetFormat === "JSONL";
  const datasetPath = isCsvOrJsonl
    ? (project?.trainPath || "")
    : (project?.folderPath || project?.trainPath || "");
  const datasetFormat = project?.datasetFormat || "Folder";
  const imageFolderPath = project?.imageFolderPath || "";

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => setSearchQuery(searchInput), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Serialize selectedClasses to a stable string for dependency tracking
  const filterKey = [...selectedClasses].sort().join("\0");

  useEffect(() => {
    if (!datasetPath) return;
    setLoading(true);
    setError(null);
    const classFilter = selectedClasses.size > 0 ? [...selectedClasses] : null;
    invoke("browse_dataset", {
      path: datasetPath,
      format: datasetFormat,
      limit: PAGE_SIZE,
      offset,
      classFilter,
      imageFolder: imageFolderPath || null,
      search: searchQuery || null,
    })
      .then((result) => {
        setData(result);
        setLoading(false);
      })
      .catch((err) => {
        setError(String(err));
        setLoading(false);
      });
  }, [datasetPath, datasetFormat, offset, filterKey, imageFolderPath, searchQuery]);

  // Close lightbox on Escape
  useEffect(() => {
    if (!lightbox) return;
    function onKey(e) {
      if (e.key === "Escape") setLightbox(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox]);

  const toggleClass = useCallback((className) => {
    setSelectedClasses((prev) => {
      const next = new Set(prev);
      if (next.has(className)) {
        next.delete(className);
      } else {
        next.add(className);
      }
      return next;
    });
    setOffset(0);
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedClasses(new Set());
    setOffset(0);
  }, []);

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

  return (
    <div class="dataset-browser-view">
      {error && <div class="training-panel-error">{error}</div>}

      {/* 3-column body: sidebar (class dist) + main (images) */}
      <div class="dataset-browser-body">
        {/* Column 1 — Class distribution sidebar */}
        {classNames.length > 0 && (
          <div class="dataset-browser-sidebar">
            <div class="dataset-browser-sidebar-scroll">
              <div class="dataset-sidebar-meta">
                <div class="dataset-sidebar-meta-row">
                  <span class="dataset-sidebar-meta-label">Total Images</span>
                  <span class="dataset-sidebar-meta-value">{totalAllClasses.toLocaleString()}</span>
                </div>
                <div class="dataset-sidebar-meta-row">
                  <span class="dataset-sidebar-meta-label">Classes</span>
                  <span class="dataset-sidebar-meta-value">{classNames.length.toLocaleString()}</span>
                </div>
                <div class="dataset-sidebar-meta-row">
                  <span class="dataset-sidebar-meta-label">Avg / Class</span>
                  <span class="dataset-sidebar-meta-value">
                    {classNames.length > 0 ? Math.round(totalAllClasses / classNames.length).toLocaleString() : "—"}
                  </span>
                </div>
              </div>
              <div class="dataset-section-heading-row">
                <h4 class="dataset-section-heading">Class Distribution</h4>
                {selectedClasses.size > 0 && (
                  <button class="dataset-clear-filter" onClick={clearSelection}>
                    Clear ({selectedClasses.size})
                  </button>
                )}
              </div>
              <div class="dataset-class-dist">
                {classNames.map((c, i) => {
                  const hue = (i * 137.508) % 360;
                  return (
                    <button
                      key={c}
                      class={`dataset-class-bar-row${selectedClasses.has(c) ? " active" : ""}`}
                      style={{ "--class-hue": `${hue}` }}
                      onClick={() => toggleClass(c)}
                    >
                      <span class="dataset-class-bar-label" title={c}>
                        {c}
                      </span>
                      <div class="dataset-class-bar-track">
                        <div
                          class="dataset-class-bar-fill"
                          style={{
                            width: `${((classCounts[c] || 0) / maxCount) * 100}%`,
                            background: `hsl(${hue}, 65%, 58%)`,
                          }}
                        />
                      </div>
                      <span class="dataset-class-bar-count">{classCounts[c]}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Columns 2-3 — Image grid */}
        <div class="dataset-browser-main">
          <div class="dataset-search-bar">
            <svg class="dataset-search-icon" viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="8.5" cy="8.5" r="5.5" />
              <line x1="13" y1="13" x2="18" y2="18" />
            </svg>
            <input
              type="text"
              class="dataset-search-input"
              placeholder="Search by filename or label..."
              value={searchInput}
              onInput={(e) => {
                setSearchInput(e.target.value);
                setOffset(0);
              }}
            />
            {searchInput && (
              <button
                class="dataset-search-clear"
                onClick={() => { setSearchInput(""); setSearchQuery(""); setOffset(0); }}
                title="Clear search"
              >✕</button>
            )}
          </div>
          {loading ? (
            <div class="run-detail-loading">Loading dataset images...</div>
          ) : (
            <>
              {images.length === 0 && (
                <div class="run-detail-empty">
                  {searchInput
                    ? `No images matching "${searchInput}".`
                    : selectedClasses.size > 0
                      ? "No images found for the selected classes."
                      : "No images found in this dataset."}
                </div>
              )}

              {images.length > 0 && (
                <h4 class="dataset-section-heading">Images</h4>
              )}

              <div class="dataset-browser-grid">
                {images.map((img) => {
                  const filename = extractFilename(img.path);
                  return (
                    <div
                      key={img.path}
                      class="dataset-browser-card"
                      onClick={() => setLightbox(img)}
                      title={`${img.label} — ${filename}`}
                    >
                      <img
                        class="dataset-browser-thumb"
                        src={convertFileSrc(img.path)}
                        alt={img.label}
                        loading="lazy"
                      />
                      <div class="dataset-browser-card-info">
                        <div class="dataset-browser-card-label" title={img.label}>
                          {img.label}
                        </div>
                        {filename && (
                          <div class="dataset-browser-card-filename" title={filename}>
                            {filename}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {total > PAGE_SIZE && (() => {
                const currentPage = Math.floor(offset / PAGE_SIZE);
                const totalPages = Math.ceil(total / PAGE_SIZE);

                // Generate page numbers to show: always first, last, and nearby
                const getPageNumbers = () => {
                  const pages = new Set();
                  pages.add(0);
                  pages.add(totalPages - 1);
                  for (let d = -2; d <= 2; d++) {
                    const p = currentPage + d;
                    if (p >= 0 && p < totalPages) pages.add(p);
                  }
                  return [...pages].sort((a, b) => a - b);
                };

                const pageNums = getPageNumbers();

                return (
                  <div class="dataset-browser-pagination">
                    <div class="dataset-pagination-inner">
                      <button
                        class="dataset-pagination-arrow"
                        disabled={currentPage === 0}
                        onClick={() => setOffset(0)}
                        title="First page"
                      >⟨⟨</button>
                      <button
                        class="dataset-pagination-arrow"
                        disabled={currentPage === 0}
                        onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                        title="Previous page"
                      >⟨</button>

                      {pageNums.map((p, idx) => {
                        const prev = idx > 0 ? pageNums[idx - 1] : -1;
                        return (
                          <>
                            {prev >= 0 && p - prev > 1 && (
                              <span class="dataset-pagination-ellipsis">…</span>
                            )}
                            <button
                              key={p}
                              class={p === currentPage ? "active" : ""}
                              onClick={() => setOffset(p * PAGE_SIZE)}
                            >
                              {p + 1}
                            </button>
                          </>
                        );
                      })}

                      <button
                        class="dataset-pagination-arrow"
                        disabled={currentPage >= totalPages - 1}
                        onClick={() => setOffset(offset + PAGE_SIZE)}
                        title="Next page"
                      >⟩</button>
                      <button
                        class="dataset-pagination-arrow"
                        disabled={currentPage >= totalPages - 1}
                        onClick={() => setOffset((totalPages - 1) * PAGE_SIZE)}
                        title="Last page"
                      >⟩⟩</button>
                    </div>
                    <span class="dataset-pagination-info">
                      {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {total.toLocaleString()}
                    </span>
                  </div>
                );
              })()}
            </>
          )}
        </div>
      </div>

      {/* Lightbox modal */}
      {lightbox && (
        <div
          class="dataset-lightbox-overlay"
          onClick={() => setLightbox(null)}
        >
          <div
            class="dataset-lightbox-content"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              class="dataset-lightbox-img"
              src={convertFileSrc(lightbox.path)}
              alt={lightbox.label}
            />
            <div class="dataset-lightbox-caption">
              <span class="dataset-lightbox-label">{lightbox.label}</span>
              <span class="dataset-lightbox-filename">
                {extractFilename(lightbox.path)}
              </span>
            </div>
          </div>
          <button
            class="dataset-lightbox-close"
            onClick={() => setLightbox(null)}
            title="Close (Esc)"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
