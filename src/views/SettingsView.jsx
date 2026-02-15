import { theme, toggleTheme } from "../state/theme.js";

export function SettingsView() {
  return (
    <div class="settings-view">
      <div class="settings-section">
        <h2 class="settings-heading">Appearance</h2>
        <div class="settings-row">
          <div>
            <div class="settings-label">Theme</div>
            <div class="settings-desc">Switch between dark and light mode</div>
          </div>
          <button class="theme-switch" onClick={toggleTheme}>
            {theme.value === "dark" ? "Dark" : "Light"}
          </button>
        </div>
      </div>
      <div class="settings-section">
        <h2 class="settings-heading">About</h2>
        <div class="settings-row">
          <div>
            <div class="settings-label">NightForge</div>
            <div class="settings-desc">ML Experiment Tracker — v0.1.0</div>
          </div>
        </div>
      </div>
    </div>
  );
}
