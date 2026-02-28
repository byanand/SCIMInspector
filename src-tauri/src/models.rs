use serde::{Deserialize, Serialize};

// ── Server Configuration ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerConfig {
    pub id: String,
    pub name: String,
    pub base_url: String,
    pub auth_type: String, // "bearer", "basic", "apikey"
    pub auth_token: Option<String>,
    pub auth_username: Option<String>,
    pub auth_password: Option<String>,
    pub api_key_header: Option<String>,
    pub api_key_value: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

// ── Test Run ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestRun {
    pub id: String,
    pub server_config_id: String,
    pub run_type: String, // "validation" or "loadtest"
    pub status: String,   // "running", "completed", "failed", "cancelled"
    pub started_at: String,
    pub completed_at: Option<String>,
    pub summary_json: Option<String>,
}

// ── Validation ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidationResult {
    pub id: String,
    pub test_run_id: String,
    pub test_name: String,
    pub category: String,
    pub http_method: String,
    pub url: String,
    pub request_body: Option<String>,
    pub response_status: Option<i32>,
    pub response_body: Option<String>,
    pub duration_ms: i64,
    pub passed: bool,
    pub failure_reason: Option<String>,
    pub executed_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidationSummary {
    pub total: usize,
    pub passed: usize,
    pub failed: usize,
    pub skipped: usize,
    pub compliance_score: f64,
    pub duration_ms: i64,
    pub categories: Vec<CategorySummary>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CategorySummary {
    pub name: String,
    pub total: usize,
    pub passed: usize,
    pub failed: usize,
}

// ── Load Test ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoadTestConfig {
    pub server_config_id: String,
    pub scenario: Option<String>,  // single scenario (legacy)
    pub scenarios: Option<Vec<String>>,  // multi-scenario: run in parallel
    pub endpoints: Vec<LoadTestEndpoint>,
    pub total_requests: usize,
    pub concurrency: usize,
    pub ramp_up_seconds: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoadTestEndpoint {
    pub method: String,
    pub path: String,
    pub body_template: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoadTestResult {
    pub id: String,
    pub test_run_id: String,
    pub request_index: i64,
    pub http_method: String,
    pub url: String,
    pub request_body: Option<String>,
    pub status_code: Option<i32>,
    pub duration_ms: i64,
    pub success: bool,
    pub error_message: Option<String>,
    pub timestamp: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoadTestSummary {
    pub total_requests: usize,
    pub successful: usize,
    pub failed: usize,
    pub error_rate: f64,
    pub total_duration_ms: i64,
    pub min_latency_ms: i64,
    pub max_latency_ms: i64,
    pub avg_latency_ms: f64,
    pub p50_latency_ms: i64,
    pub p75_latency_ms: i64,
    pub p90_latency_ms: i64,
    pub p95_latency_ms: i64,
    pub p99_latency_ms: i64,
    pub requests_per_second: f64,
    pub status_code_distribution: std::collections::HashMap<i32, usize>,
}

// ── Validation Run Config ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidationRunConfig {
    pub server_config_id: String,
    pub categories: Vec<String>,
    pub field_mapping_rules: Option<Vec<FieldMappingRule>>,
    pub user_joining_property: Option<String>,   // e.g. "userName" (default)
    pub group_joining_property: Option<String>,  // e.g. "displayName" (default)
}

// ── IPC Events ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidationProgress {
    pub test_run_id: String,
    pub current_test: String,
    pub current_category: String,
    pub completed: usize,
    pub total: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoadTestProgress {
    pub test_run_id: String,
    pub phase: String,  // "creating", "updating", "reading", "deleting", "cleaning_up", "listing"
    pub completed: usize,
    pub total: usize,
    pub current_rps: f64,
    pub avg_latency_ms: f64,
    pub error_count: usize,
}

// ── Export ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportRequest {
    pub test_run_id: String,
    pub format: String, // "pdf", "csv", "json"
    pub output_path: String,
}

// ── Test Connection ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestConnectionResult {
    pub success: bool,
    pub status_code: Option<u16>,
    pub response_body: Option<String>,
    pub error: Option<String>,
    pub duration_ms: i64,
}

// ── Custom Schema Discovery ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiscoveredSchemaAttribute {
    pub schema_urn: String,
    pub schema_name: String,
    pub attr_name: String,
    pub attr_type: String,
}

// ── Field Mapping ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FieldMappingRule {
    pub id: String,
    pub server_config_id: String,
    pub scim_attribute: String,
    pub display_name: String,
    pub required: bool,
    pub format: String,             // "none", "email", "uri", "phone", "regex"
    pub regex_pattern: Option<String>,
    pub description: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

// ── SCIM Explorer ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExplorerRequest {
    pub server_config_id: String,
    pub method: String,
    pub path: String,
    pub body: Option<String>,
    pub query_params: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExplorerResponse {
    pub status: u16,
    pub status_text: String,
    pub headers: std::collections::HashMap<String, String>,
    pub body: String,
    pub duration_ms: i64,
    pub request_url: String,
}

// ── Sample Data ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SampleData {
    pub id: String,
    pub server_config_id: String,
    pub resource_type: String,  // "user" or "group"
    pub name: String,           // friendly label
    pub data_json: String,      // the SCIM JSON body
    pub is_default: bool,       // true = shipped with app
    pub created_at: String,
    pub updated_at: String,
}
