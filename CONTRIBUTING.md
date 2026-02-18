# Contributing to SCIM Inspector

Thank you for your interest in contributing! This guide will help you get started.

## Development Setup

### Prerequisites

- **Node.js** 20+ and npm
- **Rust** 1.77+ (via [rustup](https://rustup.rs/))
- **Tauri CLI** (`npm install -g @tauri-apps/cli@latest`)
- **System dependencies** for Tauri:
  - **Windows**: Microsoft Visual Studio C++ Build Tools, WebView2
  - **macOS**: Xcode Command Line Tools
  - **Linux**: `webkit2gtk-4.1`, `libappindicator3-dev`, `librsvg2-dev`, `patchelf`

### Getting Started

```bash
# Clone the repo
git clone https://github.com/byanand/SCIMInspector.git
cd SCIMInspector

# Install frontend dependencies
npm install

# Run in development mode (starts Angular + Tauri together)
npx tauri dev
```

### Project Structure

```
SCIMInspector/
├── src/                      # Angular 21 frontend
│   ├── app/
│   │   ├── pages/            # Route components (dashboard, explorer, etc.)
│   │   ├── services/         # TauriService, ServerConfigService, etc.
│   │   └── models/           # TypeScript interfaces
│   └── styles.scss           # Global styles
├── src-tauri/                # Rust backend
│   ├── src/
│   │   ├── main.rs           # Entry point
│   │   ├── lib.rs            # Command registration
│   │   ├── commands.rs       # Tauri IPC command handlers
│   │   ├── db.rs             # SQLite database layer
│   │   ├── models.rs         # Rust data structures
│   │   ├── scim_client.rs    # HTTP client for SCIM endpoints
│   │   └── validation.rs     # SCIM 2.0 validation engine
│   ├── Cargo.toml            # Rust dependencies
│   └── tauri.conf.json       # Tauri configuration
├── .github/workflows/        # CI/CD pipelines
└── docs/                     # Documentation
```

## Making Changes

1. **Fork** the repository and create a branch from `main`.
2. Make your changes with clear, descriptive commits.
3. Ensure the project builds without errors:
   ```bash
   npm run build          # Angular frontend
   cd src-tauri && cargo build   # Rust backend
   ```
4. Open a **Pull Request** with a clear description of what changed and why.

## Code Style

- **TypeScript/Angular**: Follow Angular style guide. Use signals for state management.
- **Rust**: Run `cargo fmt` and `cargo clippy` before committing.
- **SCSS**: Follow existing patterns. Include dark theme variants for new components.

## Reporting Bugs

Open an issue with:
- Steps to reproduce
- Expected vs. actual behavior
- OS and app version
- Screenshots if applicable

## Feature Requests

Open an issue with the `enhancement` label describing the use case and proposed solution.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
