import { useEffect } from "preact/hooks";
import { invoke } from "@tauri-apps/api/core";
import { currentPage } from "./state/router.js";
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

// Ensure state modules initialize
import "./state/theme.js";
import "./state/projects.js";
import { initTrainingListeners, cleanupTrainingListeners } from "./state/training.js";
import { CreateProjectWizard } from "./components/CreateProjectWizard.jsx";
import { DeleteProjectDialog } from "./components/DeleteProjectDialog.jsx";
import { EmptyProjectsScreen } from "./components/EmptyProjectsScreen.jsx";

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

    // Close splash screen after delay
    const timer = setTimeout(() => {
      invoke("close_splash");
    }, 2000);
    return () => {
      clearTimeout(timer);
      cleanupTrainingListeners();
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
    </>
  );
}
