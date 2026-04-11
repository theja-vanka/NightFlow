import { openUrl } from "@tauri-apps/plugin-opener";
import { invoke } from "@tauri-apps/api/core";
import { theme, toggleTheme } from "../state/theme.js";
import { currentPage } from "../state/router.js";
import { currentProject } from "../state/projects.js";
import { platform } from "../state/dashboard.js";
import {
  updateAvailable,
  latestVersion,
  releaseUrl,
  dismissUpdate,
} from "../state/update.js";

const titles = {
  dashboard: "Dashboard",
  experiments: "Experiments",
  "dataset-browser": "Dataset Browser",
  interpretation: "Interpretation",
  netron: "Model Viewer",
  charts: "Charts",
  terminal: "Terminal",
  settings: "Project Settings",
  "run-detail": "Run Detail",
  "compare-runs": "Compare Runs",
};

const sunIcon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`;
const moonIcon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;

const minimizeIcon = `<svg width="12" height="12" viewBox="0 0 12 12"><rect x="1" y="5.5" width="10" height="1" fill="currentColor"/></svg>`;
const maximizeIcon = `<svg width="12" height="12" viewBox="0 0 12 12"><rect x="1.5" y="1.5" width="9" height="9" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>`;
const closeIcon = `<svg width="12" height="12" viewBox="0 0 12 12"><path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`;

export function Header() {
  const isWindows = platform.value === "windows";

  return (
    <header class={`header ${isWindows ? "header--windows" : ""}`} data-tauri-drag-region>
      <div class="header-title-group">
        <h1 class="header-title">{titles[currentPage.value] || "NightFlow"}</h1>
        {currentProject.value && (
          <span class="header-project-badge">{currentProject.value.name}</span>
        )}
      </div>
      <div class="header-actions">
        {updateAvailable.value && (
          <div class="update-badge">
            <span class="update-badge-dot" />
            <span class="update-badge-text">v{latestVersion.value} available</span>
            <button
              class="update-badge-btn"
              onClick={() => openUrl(releaseUrl.value)}
            >
              Download
            </button>
            <button
              class="update-badge-dismiss"
              onClick={dismissUpdate}
              title="Dismiss"
            >
              &times;
            </button>
          </div>
        )}
        <button
          class="theme-toggle"
          onClick={toggleTheme}
          aria-label="Toggle theme"
        >
          <span
            dangerouslySetInnerHTML={{
              __html: theme.value === "dark" ? sunIcon : moonIcon,
            }}
          />
        </button>
        {isWindows && (
          <div class="win-controls">
            <button
              class="win-control-btn"
              onClick={() => invoke("window_minimize")}
              aria-label="Minimize"
            >
              <span dangerouslySetInnerHTML={{ __html: minimizeIcon }} />
            </button>
            <button
              class="win-control-btn"
              onClick={() => invoke("window_maximize")}
              aria-label="Maximize"
            >
              <span dangerouslySetInnerHTML={{ __html: maximizeIcon }} />
            </button>
            <button
              class="win-control-btn win-control-btn--close"
              onClick={() => invoke("window_close")}
              aria-label="Close"
            >
              <span dangerouslySetInnerHTML={{ __html: closeIcon }} />
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
