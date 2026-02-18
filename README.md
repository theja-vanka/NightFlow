<p align="center">
  <img src="assets/night_forge.png" width="128" alt="NightForge logo" />
</p>

<h1 align="center">NightForge</h1>

<p align="center">
  A native desktop application for managing, running, and analyzing deep-learning experiments.
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#download">Download</a> •
  <a href="#development">Development</a> •
  <a href="#tech-stack">Tech Stack</a> •
  <a href="#license">License</a>
</p>

---

## Features

- **Project Management** — Create and organize ML projects with dataset, model, and training configurations.
- **Experiment Tracking** — View runs, metrics, and training history in a structured table.
- **Charts & Visualization** — Interactive charts for loss curves, accuracy, and other metrics.
- **Model Interpretation** — Built-in tools for model interpretability analysis.
- **Netron Integration** — Visualize neural network architectures directly in the app.
- **Integrated Terminal** — Full PTY terminal with SSH support for remote training servers.
- **Dashboard** — At-a-glance summary cards showing project health and run status.
- **Cross-Platform** — Runs natively on macOS, Windows, and Linux.

## Download

Grab the latest release for your platform from the [Releases](../../releases) page:

| Platform | Format |
| --- | --- |
| macOS | `.dmg` |
| Windows | `.exe` (installer) |
| Linux | `.AppImage`, `.deb` |

## Development

### Prerequisites

- [Node.js](https://nodejs.org/) 22+
- [Bun](https://bun.sh/) (used by Tauri build commands)
- [Rust](https://rustup.rs/) stable
- Platform-specific dependencies for Tauri — see the [Tauri v2 prerequisites](https://v2.tauri.app/start/prerequisites/)

### Setup

```bash
# Clone the repository
git clone https://github.com/<your-org>/NightForge.git
cd NightForge

# Install frontend dependencies
npm install --legacy-peer-deps

# Run in development mode
npx tauri dev
```

### Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start Vite dev server |
| `npm run build` | Build frontend for production |
| `npm run lint` | Lint frontend code with ESLint |
| `npx tauri dev` | Launch the app in development mode |
| `npx tauri build` | Build distributable app bundles |

### Project Structure

```
src/                  # Frontend (Preact + Signals)
├── components/       # Reusable UI components
├── views/            # Page-level views
├── state/            # Application state (Preact Signals)
├── db/               # IndexedDB persistence layer
└── hooks/            # Custom hooks (terminal, etc.)

src-tauri/            # Rust backend (Tauri v2)
└── src/main.rs       # PTY management, SSH, file validation
```

## Tech Stack

| Layer | Technology |
| --- | --- |
| UI Framework | [Preact](https://preactjs.com/) + [Preact Signals](https://preactjs.com/guide/v10/signals/) |
| Build Tool | [Vite](https://vitejs.dev/) |
| Desktop Runtime | [Tauri v2](https://v2.tauri.app/) |
| Terminal | [xterm.js](https://xtermjs.org/) with WebGL rendering |
| Storage | IndexedDB via [idb](https://github.com/nicolo-ribaudo/idb) |
| Backend | Rust with [portable-pty](https://crates.io/crates/portable-pty) |

## License

[Apache License 2.0](LICENSE)
