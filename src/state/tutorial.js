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
    body: "Use these icons to switch between views — Dashboard, Experiments, Charts, Terminal, Model Viewer, and Settings.",
    position: "right",
  },
  {
    target: ".sidebar-projects",
    title: "Projects",
    body: "All your projects live here. Click a project to switch to it, or use the \"+\" button to create a new one.",
    position: "right",
  },
  {
    target: ".header",
    title: "Header",
    body: "Shows the current page title and gives you quick access to the theme toggle for switching between dark and light mode.",
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
    body: "Click the Connect button to establish a connection to your remote machine (or localhost). The tutorial will continue once connected.",
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
    body: "After syncing, these cards show an overview of your runs — total count, completed, running, failed, and your best accuracy so far.",
    position: "top",
  },
  {
    target: ".start-training-section",
    title: "Launch Training",
    body: "Ready to train? Configure your model, dataset, and hyperparameters here, then kick off an experiment with one click.",
    position: "top",
  },
  {
    target: ".sidebar-nav",
    title: "More Views Unlocked",
    body: "Now that you're connected and synced, all navigation views are available — explore Experiments, Charts, Terminal, and the Model Viewer. You're all set!",
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
