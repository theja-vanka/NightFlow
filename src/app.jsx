import { useEffect } from "preact/hooks";
import { invoke } from "@tauri-apps/api/core";
import { currentPage } from "./state/router.js";
import { Sidebar } from "./components/Sidebar.jsx";
import { Header } from "./components/Header.jsx";
import { DashboardView } from "./views/DashboardView.jsx";
import { ExperimentsView } from "./views/ExperimentsView.jsx";
import { ChartsView } from "./views/ChartsView.jsx";
import { SettingsView } from "./views/SettingsView.jsx";
import { NetronView } from "./views/NetronView.jsx";
import { InterpretationView } from "./views/InterpretationView.jsx";
import { TerminalView } from "./views/TerminalView.jsx";

// Ensure state modules initialize
import "./state/theme.js";
import "./state/projects.js";
import { CreateProjectWizard } from "./components/CreateProjectWizard.jsx";
import { DeleteProjectDialog } from "./components/DeleteProjectDialog.jsx";

function CurrentView() {
  switch (currentPage.value) {
    case "dashboard":
      return <DashboardView />;
    case "experiments":
      return <ExperimentsView />;
    case "charts":
      return <ChartsView />;
    case "interpretation":
      return <InterpretationView />;
    case "netron":
      return <NetronView />;
    case "terminal":
      return <TerminalView />;
    case "settings":
      return <SettingsView />;
    default:
      return <DashboardView />;
  }
}

export function App() {
  useEffect(() => {
    const timer = setTimeout(() => {
      invoke("close_splash");
    }, 2000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div class="app-shell">
      <Sidebar />
      <div class="app-main">
        <Header />
        <div class="app-content">
          <CurrentView />
        </div>
      </div>
      <CreateProjectWizard />
      <DeleteProjectDialog />
    </div>
  );
}
