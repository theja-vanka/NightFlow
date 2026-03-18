import { signal } from "@preact/signals";
import { getVersion } from "@tauri-apps/api/app";

const GITHUB_OWNER = "theja-vanka";
const GITHUB_REPO = "NightFlow";
const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000; // 4 hours
const DISMISSED_KEY = "nightflow_update_dismissed";

/** @type {import("@preact/signals").Signal<string|null>} */
export const latestVersion = signal(null);

/** @type {import("@preact/signals").Signal<string|null>} */
export const currentVersion = signal(null);

/** @type {import("@preact/signals").Signal<boolean>} */
export const updateAvailable = signal(false);

/** @type {import("@preact/signals").Signal<string|null>} */
export const releaseUrl = signal(null);

/** @type {import("@preact/signals").Signal<boolean>} */
export const updateDismissed = signal(false);

/**
 * Compare two semver strings. Returns true if remote > local.
 */
function isNewer(remote, local) {
  const parse = (v) => v.replace(/^v/, "").split(".").map(Number);
  const r = parse(remote);
  const l = parse(local);
  for (let i = 0; i < 3; i++) {
    if ((r[i] || 0) > (l[i] || 0)) return true;
    if ((r[i] || 0) < (l[i] || 0)) return false;
  }
  return false;
}

export async function checkForUpdate() {
  try {
    const current = await getVersion();
    currentVersion.value = current;

    const resp = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`,
      { headers: { Accept: "application/vnd.github.v3+json" } }
    );
    if (!resp.ok) return;

    const data = await resp.json();
    const tag = data.tag_name; // e.g. "v0.2.0"
    latestVersion.value = tag.replace(/^v/, "");
    releaseUrl.value = data.html_url;

    const dismissed = localStorage.getItem(DISMISSED_KEY);
    if (dismissed === tag) {
      updateDismissed.value = true;
      updateAvailable.value = false;
      return;
    }

    updateAvailable.value = isNewer(tag, current);
    updateDismissed.value = false;
  } catch {
    // Silently fail — no network, rate-limited, etc.
  }
}

export function dismissUpdate() {
  if (latestVersion.value) {
    localStorage.setItem(DISMISSED_KEY, `v${latestVersion.value}`);
  }
  updateDismissed.value = true;
  updateAvailable.value = false;
}

let intervalId = null;

export function startUpdateChecker() {
  checkForUpdate();
  intervalId = setInterval(checkForUpdate, CHECK_INTERVAL_MS);
}

export function stopUpdateChecker() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}
