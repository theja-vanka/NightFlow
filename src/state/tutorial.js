import { signal } from "@preact/signals";
import { sshConnected, dashboardSynced } from "./dashboard.js";

const STORAGE_KEY = "nightflow-tutorial-done";

export const tutorialActive = signal(false);
export const tutorialStep = signal(0);

export const tutorialSteps = [
  {
    target: ".sidebar-logo",
    title: "Welcome to NightFlow",
    body: "Your desktop hub for managing and analyzing deep learning experiments. Let's take a quick tour of the interface.",
    position: "right",
  },
  {
    target: ".sidebar-nav",
    title: "Navigation",
    body: "Use these icons to switch between views — Dashboard, Experiments, Dataset Browser, Interpretation, Model Viewer, Terminal, and Settings. Use Ctrl+1–7 to jump between them, or Ctrl+K to see all shortcuts.",
    position: "right",
  },
  {
    target: ".sidebar-projects",
    title: "Projects",
    body: "All your projects live here. Click a project to switch to it, or use the \"+\" button to create a new one. You can export and import project configs from Settings.",
    position: "right",
  },
  {
    target: ".header",
    title: "Header & Theme",
    body: "Shows the current page title and project name. Use the theme toggle to switch between dark and light mode — charts automatically adapt their color palette.",
    position: "bottom",
  },
  {
    target: ".app-content",
    title: "Main Content",
    body: "This is the main content area where each view renders. Let's connect to your machine next!",
    position: "left",
  },
  {
    target: ".ssh-status-banner",
    title: "Connect",
    body: "Click the Connect button to establish a connection to your remote machine (or localhost). You can manage your SSH keys in Settings. The tutorial will continue once connected.",
    position: "bottom",
    waitFor: () => sshConnected.value,
  },
  {
    target: ".dashboard-sync-card",
    title: "Sync",
    body: "Now hit Sync to pull your project environment and experiment data. This sets up your Python environment and discovers any existing runs.",
    position: "bottom",
    waitFor: () => dashboardSynced.value,
  },
  {
    target: ".summary-grid",
    title: "Summary Cards",
    body: "After syncing, these cards show an overview of your runs — total count, running, and your best validation and test accuracy.",
    position: "top",
  },
  {
    target: ".start-training-section",
    title: "Launch Training",
    body: "Configure your model, dataset, and hyperparameters, then start training with one click. You can also queue multiple runs to execute sequentially. An ETA will show after the first epoch, and you'll get an OS notification when training finishes.",
    position: "top",
  },
  {
    target: ".sidebar-nav",
    title: "Experiments & Run Details",
    body: "The Experiments view lists all your runs with filtering and sorting. Click a run to see its charts, hyperparameters, model info (params & FLOPs), confusion matrix, and per-class metrics. You can tag runs, add notes, and export data as CSV or JSON.",
    position: "right",
  },
  {
    target: ".sidebar-nav",
    title: "Dataset Browser",
    body: "Browse your training dataset with a visual thumbnail grid. See class distribution at a glance, click a class bar to filter, and paginate through images.",
    position: "right",
  },
  {
    target: ".sidebar-nav",
    title: "Interpretation & Augmentation",
    body: "Use the Interpretation view to run GradCAM and other visualizations on your trained models. In Settings, you can preview what augmentation presets do to your images before training.",
    position: "right",
  },
  {
    target: ".sidebar-nav",
    title: "You're All Set!",
    body: "Explore all the views now that you're connected and synced. Check Settings for GPU selection, SSH key management, and project config export/import. Happy experimenting!",
    position: "right",
  },
];

export function startTutorial() {
  localStorage.removeItem(STORAGE_KEY);
  tutorialStep.value = 0;
  tutorialActive.value = true;
}

export function nextStep() {
  const next = tutorialStep.value + 1;
  if (next >= tutorialSteps.length) {
    completeTutorial();
  } else {
    tutorialStep.value = next;
  }
}

export function prevStep() {
  if (tutorialStep.value > 0) {
    tutorialStep.value = tutorialStep.value - 1;
  }
}

export function skipTutorial() {
  completeTutorial();
}

function completeTutorial() {
  tutorialActive.value = false;
  tutorialStep.value = 0;
  localStorage.setItem(STORAGE_KEY, "true");
}

export function maybeStartTutorial() {
  if (localStorage.getItem(STORAGE_KEY)) return;

  // Wait for the sidebar to exist in the DOM before starting
  const check = () => {
    if (document.querySelector(".sidebar")) {
      startTutorial();
    } else {
      requestAnimationFrame(check);
    }
  };
  // Small delay so the app shell has time to render
  setTimeout(check, 500);
}
