<div align="center">

<img src="assets/night_forge.png" width="140" alt="NightForge logo" />

**A native desktop application for managing, running, and analyzing deep-learning experiments.**

[![CI](https://img.shields.io/github/actions/workflow/status/your-org/NightForge/ci.yml?branch=dev&label=CI&style=flat-square)](../../actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/your-org/NightForge?style=flat-square&color=blue)](../../releases/latest)
[![License](https://img.shields.io/badge/license-Apache%202.0-green?style=flat-square)](LICENSE)

[Features](#-features) · [Download](#-download) · [Development](#-development) · [Tech Stack](#-tech-stack) · [License](#-license)

</div>

<br />

## ✨ Features

<table>
<tr>
<td width="50%">

### Organize & Track

- **Project Management** — Create and organize ML projects with dataset, model, and training configurations
- **Experiment Tracking** — View runs, metrics, and training history in a structured table
- **Dashboard** — At-a-glance summary cards showing project health and run status

</td>
<td width="50%">

### Visualize & Analyze

- **Charts** — Interactive loss curves, accuracy plots, and custom metrics
- **Model Interpretation** — Built-in tools for interpretability analysis
- **Netron Integration** — Visualize neural network architectures directly in-app

</td>
</tr>
<tr>
<td width="50%">

### Connect & Run

- **Integrated Terminal** — Full PTY terminal with SSH support for remote training servers
- **SSH Management** — One-click connection to remote machines

</td>
<td width="50%">

### Cross-Platform

- 🍎 **macOS** — Native `.app` bundle (Intel & Apple Silicon)
- 🪟 **Windows** — NSIS installer
- 🐧 **Linux** — AppImage & `.deb` packages

</td>
</tr>
<tr>
<td width="50%">

### Privacy & Trust

- **100% Offline** — Works entirely without an internet connection
- **No Telemetry** — Zero tracking, zero analytics, zero phone-home
- **Your Data Stays Yours** — All data is stored locally on your machine using IndexedDB — nothing leaves your device
- **No Account Required** — No sign-up, no login, no cloud dependency

</td>
<td width="50%">

### Built Right

- **Open Source** — Apache 2.0 licensed, fully auditable code
- **Lightweight** — Small binary size thanks to Tauri (no Electron bloat)
- **Fast** — Native Rust backend with Preact frontend for snappy performance
- **No Ads, No Upsells** — Clean, distraction-free experience

</td>
</tr>
</table>

<br />

## 📦 Download

Grab the latest build from the **[Releases](../../releases/latest)** page.

| Platform | Architecture | Format |
| :---: | :---: | :---: |
| macOS | ARM64 / x64 | `.dmg` |
| Windows | x64 | `.exe` |
| Linux | x64 | `.AppImage` · `.deb` |

<br />

## 🛠 Development

### Prerequisites

| Tool | Version |
| :--- | :--- |
| [Node.js](https://nodejs.org/) | 22+ |
| [Bun](https://bun.sh/) | latest |
| [Rust](https://rustup.rs/) | stable |

> **Note:** You also need platform-specific dependencies for Tauri — see the [Tauri v2 prerequisites](https://v2.tauri.app/start/prerequisites/).

### Quick Start

```bash
# Clone
git clone https://github.com/<your-org>/NightForge.git && cd NightForge

# Install dependencies
npm install --legacy-peer-deps

# Launch in dev mode
npx tauri dev
```

### Available Scripts

```
npm run dev          →  Start Vite dev server
npm run build        →  Build frontend for production
npm run lint         →  Lint frontend with ESLint
npx tauri dev        →  Launch app in development mode
npx tauri build      →  Build distributable bundles
```

### Project Structure

```
NightForge/
│
├─ src/                       # Frontend (Preact + Signals)
│  ├─ components/             #   Reusable UI components
│  ├─ views/                  #   Page-level views
│  ├─ state/                  #   Reactive state (Preact Signals)
│  ├─ db/                     #   IndexedDB persistence layer
│  └─ hooks/                  #   Custom hooks (terminal, etc.)
│
├─ src-tauri/                 # Rust backend (Tauri v2)
│  └─ src/main.rs             #   PTY management, SSH, file validation
│
├─ .github/workflows/
│  ├─ ci.yml                  #   Build check on push to dev
│  └─ release.yml             #   Build & publish on version tags
│
└─ package.json
```

<br />

## 🧩 Tech Stack

| Layer | Technology |
| :--- | :--- |
| **UI** | [Preact](https://preactjs.com/) · [Preact Signals](https://preactjs.com/guide/v10/signals/) |
| **Bundler** | [Vite](https://vitejs.dev/) |
| **Desktop** | [Tauri v2](https://v2.tauri.app/) |
| **Terminal** | [xterm.js](https://xtermjs.org/) with WebGL rendering |
| **Storage** | IndexedDB via [idb](https://github.com/nicolo-ribaudo/idb) |
| **Backend** | Rust · [portable-pty](https://crates.io/crates/portable-pty) · [Tokio](https://tokio.rs/) |

<br />

## 📄 License

Released under the [Apache License 2.0](LICENSE).

---

<div align="center">
<sub>Built with 🔥 by the NightForge team</sub>
</div>
