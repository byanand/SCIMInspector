<p align="center">
  <img src="src-tauri/icons/128x128.png" alt="SCIM Inspector" width="80" />
</p>

<h1 align="center">SCIM Inspector</h1>

<p align="center">
  A desktop app for testing, validating, and load-testing SCIM 2.0 endpoints.
  <br />
  Built with <strong>Angular 21</strong> + <strong>Tauri 2</strong> + <strong>Rust</strong>.
</p>

<p align="center">
  <a href="https://github.com/byanand/SCIMInspector/releases/latest"><img src="https://img.shields.io/github/v/release/byanand/SCIMInspector?style=flat-square" alt="Latest Release" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/byanand/SCIMInspector?style=flat-square" alt="License" /></a>
  <a href="https://github.com/byanand/SCIMInspector/actions/workflows/release.yml"><img src="https://img.shields.io/github/actions/workflow/status/byanand/SCIMInspector/release.yml?style=flat-square&label=build" alt="Build Status" /></a>
</p>

---

## What is SCIM Inspector?

**SCIM Inspector** is a free, open-source desktop application that helps identity engineers and developers work with [SCIM 2.0](https://tools.ietf.org/html/rfc7644) provisioning APIs. Think of it as a SCIM-specific Postman — with built-in compliance validation, load testing, and reporting.

### Key Features

| Feature | Description |
|---------|-------------|
| **SCIM Explorer** | Interactive API client with 13 pre-built SCIM operations for Users and Groups. Edit method, path, headers, and body before sending. |
| **AI-Powered Payloads** | Generate realistic SCIM User/Group JSON using OpenAI GPT-4o-mini. Just configure your API key in Settings. |
| **Schema Discovery** | Automatically discover custom and extension attributes from the server's `/Schemas` endpoint. |
| **Compliance Validation** | Run 7 test categories against any SCIM endpoint: schema discovery, CRUD operations, PATCH, filtering/pagination, custom schemas, and field mapping rules. |
| **Load Testing** | Configurable concurrency, total requests, and ramp-up. Real-time RPS, latency percentiles (p50/p95/p99), and error rates. Cancelable mid-run. |
| **Field Mapping Rules** | Define per-server validation rules with format enforcement (email, URI, phone, boolean, integer, datetime, regex). |
| **Reports & Export** | Browse test history with Chart.js visualizations. Export to JSON, CSV, or PDF. |
| **Multi-Auth** | Bearer token, Basic auth, and API-key header authentication. |
| **Dark / Light Theme** | Toggle in the top toolbar, persisted across sessions. |
| **Local-first** | All data stored in a local SQLite database. No cloud account required. |

---

## Download

Download the latest installer for your OS from the [Releases](https://github.com/byanand/SCIMInspector/releases/latest) page:

| Platform | File |
|----------|------|
| **Windows** (64-bit) | `SCIM-Inspector_x.x.x_x64-setup.exe` or `.msi` |
| **macOS** (Apple Silicon) | `SCIM-Inspector_x.x.x_aarch64.dmg` |
| **macOS** (Intel) | `SCIM-Inspector_x.x.x_x64.dmg` |
| **Linux** (64-bit) | `.AppImage` or `.deb` |

> **Windows note:** If SmartScreen shows a warning, click "More info" → "Run anyway". The app is not code-signed yet.

---

## Quick Start

### 1. Add a Server

Go to **Server Config** → add your SCIM endpoint URL and authentication credentials → click **Test Connection** to verify.

### 2. Explore

Switch to **Explorer** → select your server → choose an operation (e.g., "Create User") → edit the JSON body → click **Send Request**.

Use **Schema Discovery** to load extension attributes directly from the server, or **AI Generate** to create realistic payloads with OpenAI.

### 3. Set Up Field Mapping

Go to **Field Mapping** → pick common SCIM attributes or **Discover from Server** to load attributes from the `/Schemas` endpoint. Define required fields and format validation rules.

### 4. Validate

Go to **Validation** → select test categories → click **Run Validation**. Results show pass/fail per test with detailed messages.

### 5. Load Test

Go to **Load Test** → set concurrency, request count, and ramp-up → click **Start**. Monitor real-time metrics and stop anytime.

### 6. Review Reports

All test runs appear in **Reports**. Click any run for details with charts. Export as JSON, CSV, or PDF.

---

## Development

### Prerequisites

- **Node.js** 20+
- **Rust** 1.77+ ([rustup.rs](https://rustup.rs/))
- **Tauri 2 prerequisites** — see [Tauri docs](https://v2.tauri.app/start/prerequisites/)

### Run locally

```bash
git clone https://github.com/byanand/SCIMInspector.git
cd SCIMInspector
npm install
npx tauri dev
```

### Build installer

```bash
npx tauri build
```

Outputs are in `src-tauri/target/release/bundle/`.

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Angular 21, Angular Material 21, Chart.js |
| Desktop | Tauri 2 |
| Backend | Rust, reqwest, rusqlite (SQLite), serde |
| AI | OpenAI GPT-4o-mini (optional) |

---

## Architecture

```
┌──────────────────────────────────┐
│           Angular 21 UI          │
│  (Explorer, Validation, Reports) │
└──────────────┬───────────────────┘
               │ Tauri IPC (invoke/listen)
┌──────────────▼───────────────────┐
│         Rust Backend             │
│  ┌─────────┐ ┌────────────────┐  │
│  │  SQLite │ │  SCIM Client   │  │
│  │   DB    │ │  (reqwest)     │  │
│  └─────────┘ └────────────────┘  │
│  ┌─────────────────────────────┐ │
│  │  Validation Engine (7 cats) │ │
│  └─────────────────────────────┘ │
│  ┌─────────────────────────────┐ │
│  │  Load Test Engine           │ │
│  └─────────────────────────────┘ │
└──────────────────────────────────┘
```

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, code style, and how to submit changes.

---

## License

[MIT](LICENSE) — free for personal and commercial use.
