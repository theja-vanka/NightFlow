import { useEffect } from "preact/hooks";
import { signal } from "@preact/signals";
import { invoke } from "@tauri-apps/api/core";
import { currentPage, navigate } from "./state/router.js";
import { projectList, loadProjects } from "./state/projects.js";
import { loadRuns } from "./state/experiments.js";
import { Sidebar } from "./components/Sidebar.jsx";
import { Header } from "./components/Header.jsx";
import { DashboardView } from "./views/DashboardView.jsx";
import { ExperimentsView } from "./views/ExperimentsView.jsx";
import { SettingsView } from "./views/SettingsView.jsx";
import { NetronView } from "./views/NetronView.jsx";
import { InterpretationView } from "./views/InterpretationView.jsx";
import { TerminalView } from "./views/TerminalView.jsx";
import { RunDetailView } from "./views/RunDetailView.jsx";
import { CompareRunsView } from "./views/CompareRunsView.jsx";
import { DatasetBrowserView } from "./views/DatasetBrowserView.jsx";
import { KeyboardShortcutsModal } from "./components/KeyboardShortcutsModal.jsx";

// Ensure state modules initialize
import "./state/theme.js";
import "./state/projects.js";
import {
  initTrainingListeners,
  cleanupTrainingListeners,
} from "./state/training.js";
import { CreateProjectWizard } from "./components/CreateProjectWizard.jsx";
import { DeleteProjectDialog } from "./components/DeleteProjectDialog.jsx";
import { EmptyProjectsScreen } from "./components/EmptyProjectsScreen.jsx";
import { TutorialOverlay } from "./components/TutorialOverlay.jsx";
import { maybeStartTutorial } from "./state/tutorial.js";

const shortcutsOpen = signal(false);

function CurrentView() {
  switch (currentPage.value) {
    case "dashboard":
      return <DashboardView />;
    case "experiments":
      return <ExperimentsView />;
    case "interpretation":
      return <InterpretationView />;
    case "netron":
      return <NetronView />;
    case "terminal":
      return <TerminalView />;
    case "settings":
      return <SettingsView />;
    case "run-detail":
      return <RunDetailView />;
    case "compare-runs":
      return <CompareRunsView />;
    case "dataset-browser":
      return <DatasetBrowserView />;
    default:
      return <DashboardView />;
  }
}

export function App() {
  useEffect(() => {
    // Load data from database
    loadProjects();
    loadRuns();

    // Start listening for training events
    initTrainingListeners();

    // Start tutorial for first-time users
    maybeStartTutorial();

    // Close splash screen after delay
    const timer = setTimeout(() => {
      invoke("close_splash");
    }, 2000);

    // Keyboard shortcuts
    const NAV_MAP = {
      "1": "dashboard",
      "2": "experiments",
      "3": "interpretation",
      "4": "netron",
      "5": "terminal",
      "6": "settings",
      "7": "dataset-browser",
    };

    function handleKeyDown(e) {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;

      // Skip when focus is in input/textarea
      const tag = e.target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      if (e.key === "k" || e.key === "K") {
        e.preventDefault();
        shortcutsOpen.value = !shortcutsOpen.value;
        return;
      }

      if (NAV_MAP[e.key]) {
        e.preventDefault();
        navigate(NAV_MAP[e.key]);
        return;
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      clearTimeout(timer);
      cleanupTrainingListeners();
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const hasProjects = projectList.value.length > 0;

  return (
    <>
      {!hasProjects ? (
        <EmptyProjectsScreen />
      ) : (
        <div class="app-shell">
          <Sidebar />
          <div class="app-main">
            <Header />
            <div class="app-content">
              <CurrentView />
            </div>
          </div>
        </div>
      )}
      <CreateProjectWizard />
      <DeleteProjectDialog />
      <TutorialOverlay />
      <KeyboardShortcutsModal
        open={shortcutsOpen.value}
        onClose={() => (shortcutsOpen.value = false)}
      />
    </>
  );
}
