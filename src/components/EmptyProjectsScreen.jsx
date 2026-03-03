import { openWizard } from "../state/projects.js";

export function EmptyProjectsScreen() {
  return (
    <div class="empty-projects-screen">
      <div class="empty-projects-content">
        <div class="empty-projects-logo">
          <img src="/assets/image.png" alt="NightFlow" width="140" />
        </div>
        <h1 class="empty-projects-title">Welcome to NightFlow</h1>
        <p class="empty-projects-desc">
          Your unified platform for computer vision model training. Create your
          first project to get started.
        </p>
        <button class="empty-projects-btn" onClick={openWizard}>
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Create Your First Project
        </button>
        <div class="empty-projects-features">
          <div class="empty-projects-feature">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M12 6v6l4 2" />
            </svg>
            <div class="empty-projects-feature-text">
              <strong>Track Experiments</strong>
              <span>Monitor training metrics in real-time</span>
            </div>
          </div>
          <div class="empty-projects-feature">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
            <div class="empty-projects-feature-text">
              <strong>Visualize Results</strong>
              <span>Beautiful charts for loss and accuracy</span>
            </div>
          </div>
          <div class="empty-projects-feature">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
              <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
              <line x1="12" y1="22.08" x2="12" y2="12" />
            </svg>
            <div class="empty-projects-feature-text">
              <strong>Manage Models</strong>
              <span>Compare architectures and configurations</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
