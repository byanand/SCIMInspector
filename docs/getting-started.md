# Getting Started

## Installation

### Download a Pre-built Release

Go to the [Releases](https://github.com/byanand/SCIMInspector/releases/latest) page and download the installer for your OS:

- **Windows**: `.exe` installer or `.msi`
- **macOS**: `.dmg` (separate builds for Apple Silicon and Intel)
- **Linux**: `.AppImage` or `.deb`

> **Windows SmartScreen Warning**
>
> When you run the installer, Windows may show a "Windows protected your PC" warning because the app is not code-signed with a commercial certificate. This is normal for open-source software.
>
> To proceed: click **"More info"** → **"Run anyway"**.
>
> The app is fully open-source — you can review all code in this repository or build from source yourself.

### Build from Source

```bash
# Prerequisites: Node.js 20+, Rust 1.77+, Tauri 2 system deps
git clone https://github.com/byanand/SCIMInspector.git
cd SCIMInspector
npm install
npx tauri build
```

The built installer is in `src-tauri/target/release/bundle/`.

---

## First Steps

### 1. Configure a Server

1. Open the app and go to **Server Config** in the sidebar.
2. Click **Add Server**.
3. Fill in:
   - **Name**: A friendly label (e.g., "Okta Dev").
   - **Base URL**: Your SCIM endpoint (e.g., `https://your-idp.com/scim/v2`).
   - **Auth Type**: Choose Bearer Token, Basic Auth, or API Key.
   - **Credentials**: Enter the token, username/password, or API key + header name.
4. Click **Test Connection** — the app calls `/ServiceProviderConfig` and shows the result.
5. Click **Save**.

### 2. Explore the API

1. Go to **Explorer**.
2. Select your server from the dropdown.
3. Pick an operation (e.g., "List Users" or "Create User").
4. Edit the request body if needed.
5. Click **Send Request**.
6. View the response (status, headers, body) on the right panel.

### 3. Set Up Field Mappings

1. Go to **Field Mapping**.
2. Select your server.
3. Add rules from **Common SCIM Attributes** presets, or click **Discover from Server** to load attributes from the `/Schemas` endpoint.
4. Set format validation (email, boolean, regex, etc.) and mark fields as required.
5. These rules are enforced during Validation runs.

### 4. Run Validation

1. Go to **Validation**.
2. Select your server and check the test categories you want.
3. Click **Run Validation**.
4. Watch real-time progress — results show pass/fail with detailed messages.

### 5. Run a Load Test

1. Go to **Load Test**.
2. Select your server.
3. Configure:
   - **Total requests**: How many SCIM calls to make.
   - **Concurrency**: How many parallel requests.
   - **Ramp-up**: Seconds to gradually increase to full concurrency.
   - **Scenario**: Which SCIM operation to load test.
4. Click **Start** and monitor live metrics.
5. Click **Stop** to cancel early if needed.

### 6. View Reports

1. Go to **Reports** to see all past validation and load-test runs.
2. Click any run to view detailed results with charts.
3. Export to **JSON**, **CSV**, or **PDF**.

---

## Settings

### Theme

Toggle dark/light mode from the sun/moon button in the top toolbar.

### OpenAI Integration

1. Go to **Settings**.
2. Enter your OpenAI API key.
3. Click **Save & Test** to verify.
4. In the Explorer, you'll see an **AI Generate** button on create/update operations that generates realistic SCIM payloads.

### Clear Data

Use **Settings → Clear All Data** to wipe all server configs, test results, and settings. This is irreversible.
