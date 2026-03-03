/**
 * Shared OS notification utility for NightFlow.
 *
 * Uses the Tauri notification plugin (Rust-side invoke) to avoid
 * Web Notification API issues in Tauri v2 webviews.
 */
import { invoke } from "@tauri-apps/api/core";

let _allowed = false;

export async function initNotifications() {
    try {
        const granted = await invoke("plugin:notification|is_permission_granted");
        if (granted) {
            _allowed = true;
        } else {
            const result = await invoke("plugin:notification|request_permission");
            _allowed = result === "granted";
        }
    } catch {
        _allowed = false;
    }
}

export function notify(title, body) {
    if (!_allowed) return;
    try {
        invoke("plugin:notification|notify", { options: { title, body } }).catch(() => { });
    } catch {
        // notification may fail silently
    }
}
