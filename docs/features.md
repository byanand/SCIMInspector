# Features Guide

## Dashboard

The landing page shows at a glance:

- Number of configured servers
- Last validation compliance score (%)
- Last load test RPS
- 10 most recent test runs with quick links

---

## SCIM Explorer

An interactive API client purpose-built for SCIM 2.0.

### Pre-built Operations (13)

| # | Operation | Method | Path |
|---|-----------|--------|------|
| 1 | Create User | POST | `/Users` |
| 2 | List Users | GET | `/Users` |
| 3 | Get User | GET | `/Users/{id}` |
| 4 | Update User (PUT) | PUT | `/Users/{id}` |
| 5 | Patch User | PATCH | `/Users/{id}` |
| 6 | Delete User | DELETE | `/Users/{id}` |
| 7 | Create Group | POST | `/Groups` |
| 8 | List Groups | GET | `/Groups` |
| 9 | Get Group | GET | `/Groups/{id}` |
| 10 | Update Group (PUT) | PUT | `/Groups/{id}` |
| 11 | Patch Group | PATCH | `/Groups/{id}` |
| 12 | Delete Group | DELETE | `/Groups/{id}` |
| 13 | Add Member to Group | PATCH | `/Groups/{id}` |

### Custom Fields

When you select a server and an operation with a request body, two sections appear:

1. **Custom Fields** — Toggleable chips from your Field Mapping rules. Click to merge/remove from the JSON body.
2. **Schema Attributes** — Click "Load from Server" to discover attributes from the SCIM `/Schemas` endpoint. Toggle individual attributes or click "Apply All".

Extension attributes are automatically added with the correct URN namespace:

```json
{
  "schemas": [
    "urn:ietf:params:scim:schemas:core:2.0:User",
    "urn:ietf:params:scim:schemas:extension:enterprise:2.0:User"
  ],
  "userName": "john@example.com",
  "urn:ietf:params:scim:schemas:extension:enterprise:2.0:User": {
    "department": "Engineering"
  }
}
```

### AI-Powered Body Generation

With an OpenAI API key configured (in Settings), create/update operations show an **AI Generate** button that calls GPT-4o-mini to generate realistic SCIM JSON bodies.

### Request History

Click **History** to toggle the session history panel. Every request you send is recorded (in-memory for the current session). Click any entry to reload that request/response.

---

## Field Mapping

Define per-server rules that control which SCIM attributes are validated and in what format.

### Adding Rules

Three ways to add rules:

1. **Common Presets** — Click a preset chip (e.g., "Given Name", "Primary Email") to pre-fill the editor.
2. **Discover from Server** — Click "Load from Server" to fetch all attributes from the SCIM `/Schemas` endpoint. Click any discovered attribute to add it as a rule, or use "Add All".
3. **Custom Attribute** — Click "Custom Attribute" and enter any SCIM path manually.

### Format Validation

| Format | Description |
|--------|-------------|
| None | Accept any value |
| Email | Must be a valid email address |
| URI / URL | Must start with `http://`, `https://`, or `urn:` |
| Phone | Must match E.164 or common phone patterns |
| Boolean | Must be `true` or `false` |
| Integer | Must be a whole number |
| DateTime | Must be ISO 8601 format |
| Regex | Must match a custom regular expression |

### How Rules Are Used

- During **Validation** → "Field Mapping" test category checks every rule against actual SCIM responses.
- In the **Explorer** → Custom Fields chips let you toggle mapped attributes into request bodies.

---

## Validation

Automated SCIM 2.0 compliance testing across 7 categories:

| Category | What It Tests |
|----------|--------------|
| Schema Discovery | `/Schemas`, `/ServiceProviderConfig`, `/ResourceTypes` endpoints respond correctly |
| Users CRUD | Full User lifecycle: create → get → list → update (PUT) → delete |
| Groups CRUD | Full Group lifecycle: create → get → list → update → member management → delete |
| Patch Operations | SCIM PATCH add/replace/remove on User and Group resources |
| Filtering & Pagination | `filter`, `startIndex`, `count`, `sortBy`, `sortOrder` query support |
| Custom Schema | Extension/custom schema attributes discovered from `/Schemas` are properly handled |
| Field Mapping | Responses satisfy your field-mapping rules (required fields, format constraints) |

Results stream in real-time via Tauri events. Each test shows pass/fail with a detailed message.

---

## Load Testing

Stress-test your SCIM endpoint with configurable parameters:

- **Total Requests**: Number of SCIM calls to execute
- **Concurrency**: Maximum parallel requests
- **Ramp-up (seconds)**: Gradually increase concurrency over this duration
- **Scenario**: Which SCIM operation to test (List Users, Get User, Create + Delete User, etc.)

### Live Metrics

While running, the UI shows:
- Requests per second (RPS)
- Average latency
- Error count and rate
- Progress bar

### Results

After completion, results include:
- p50, p95, p99 latency percentiles
- Status code distribution
- Total duration
- Success/error counts

---

## Reports

Browse all past test runs (validation and load test) with:

- **Filter** by type (validation / load test)
- **Detail view** with Chart.js visualizations:
  - Latency histogram (bar chart)
  - Status code distribution (doughnut chart)
- **Export** to:
  - **JSON** — Full structured data
  - **CSV** — Tabular format for spreadsheets
  - **PDF** — Formatted report for sharing
- **Bulk delete** for cleanup

---

## Settings

| Setting | Description |
|---------|-------------|
| Theme | Dark / Light mode toggle (persisted) |
| OpenAI API Key | Required for AI-powered body generation in the Explorer |
| Clear All Data | Removes all server configs, test runs, results, and settings |

---

## Authentication

SCIM Inspector supports three authentication methods:

| Method | How It Works |
|--------|-------------|
| **Bearer Token** | Sends `Authorization: Bearer <token>` header |
| **Basic Auth** | Sends `Authorization: Basic <base64(user:pass)>` header |
| **API Key** | Sends a custom header (e.g., `X-API-Key: <value>`) |

Configure per-server in **Server Config**.
