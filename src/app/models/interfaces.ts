export interface ServerConfig {
  id: string;
  name: string;
  base_url: string;
  auth_type: 'bearer' | 'basic' | 'apikey';
  auth_token?: string;
  auth_username?: string;
  auth_password?: string;
  api_key_header?: string;
  api_key_value?: string;
  created_at: string;
  updated_at: string;
}

export interface TestRun {
  id: string;
  server_config_id: string;
  run_type: 'validation' | 'loadtest';
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  started_at: string;
  completed_at?: string;
  summary_json?: string;
}

export interface ValidationResult {
  id: string;
  test_run_id: string;
  test_name: string;
  category: string;
  http_method: string;
  url: string;
  request_body?: string;
  response_status?: number;
  response_body?: string;
  duration_ms: number;
  passed: boolean;
  failure_reason?: string;
  executed_at: string;
}

export interface ValidationSummary {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  compliance_score: number;
  duration_ms: number;
  categories: CategorySummary[];
}

export interface CategorySummary {
  name: string;
  total: number;
  passed: number;
  failed: number;
}

export type LoadTestScenario = 'create_users' | 'create_update' | 'full_lifecycle' | 'list_users' | 'create_groups' | 'group_lifecycle' | 'add_remove_members' | 'update_groups';

export interface LoadTestConfig {
  server_config_id: string;
  scenario?: LoadTestScenario;
  scenarios?: LoadTestScenario[];  // multi-scenario: run in parallel
  endpoints: LoadTestEndpoint[];
  total_requests: number;
  concurrency: number;
  ramp_up_seconds?: number;
}

export interface LoadTestEndpoint {
  method: string;
  path: string;
  body_template?: string;
  weight?: number;
}

export interface LoadTestResult {
  id: string;
  test_run_id: string;
  request_index: number;
  http_method: string;
  url: string;
  request_body?: string;
  status_code?: number;
  duration_ms: number;
  success: boolean;
  error_message?: string;
  timestamp: string;
}

export interface LoadTestSummary {
  total_requests: number;
  successful: number;
  failed: number;
  error_rate: number;
  total_duration_ms: number;
  min_latency_ms: number;
  max_latency_ms: number;
  avg_latency_ms: number;
  p50_latency_ms: number;
  p95_latency_ms: number;
  p99_latency_ms: number;
  requests_per_second: number;
  status_code_distribution: Record<number, number>;
}

export interface ValidationRunConfig {
  server_config_id: string;
  categories: string[];
  field_mapping_rules?: FieldMappingRule[];
  user_joining_property?: string;   // e.g. 'userName' (default)
  group_joining_property?: string;  // e.g. 'displayName' (default)
}

export interface ValidationProgress {
  test_run_id: string;
  current_test: string;
  current_category: string;
  completed: number;
  total: number;
}

export interface LoadTestProgress {
  test_run_id: string;
  phase: string;
  completed: number;
  total: number;
  current_rps: number;
  avg_latency_ms: number;
  error_count: number;
}

export interface TestConnectionResult {
  success: boolean;
  status_code?: number;
  response_body?: string;
  error?: string;
  duration_ms: number;
}

export interface ExportRequest {
  test_run_id: string;
  format: 'pdf' | 'csv' | 'json';
  output_path: string;
}

// ── Field Mapping ──

export type FieldFormat = 'none' | 'email' | 'uri' | 'phone' | 'boolean' | 'integer' | 'datetime' | 'regex';

export interface FieldMappingRule {
  id: string;
  server_config_id: string;
  scim_attribute: string;        // e.g. "userName", "emails[0].value"
  display_name: string;          // human-friendly label
  required: boolean;             // must be present in responses
  format: FieldFormat;           // format validation to apply
  regex_pattern?: string;        // custom regex when format = 'regex'
  description?: string;          // optional note from user
  created_at: string;
  updated_at: string;
}

export interface FieldMappingProfile {
  server_config_id: string;
  rules: FieldMappingRule[];
}

// ── Custom Schema Discovery ──

export interface DiscoveredSchemaAttribute {
  schema_urn: string;
  schema_name: string;
  attr_name: string;
  attr_type: string;
}

// ── SCIM Explorer ──

export interface ExplorerRequest {
  server_config_id: string;
  method: string;
  path: string;
  body?: string;
  query_params?: string;
}

export interface ExplorerResponse {
  status: number;
  status_text: string;
  headers: Record<string, string>;
  body: string;
  duration_ms: number;
  request_url: string;
}

export interface ScimOperation {
  id: string;
  name: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  pathTemplate: string;
  bodyTemplate?: string;
  description: string;
  icon: string;
  category: 'user' | 'group';
  needsId: boolean;
  needsGroupId?: boolean;
  aiGeneratable: boolean;
  aiOperation?: string;
}

export interface ExplorerHistoryEntry {
  id: string;
  operation: ScimOperation;
  method: string;
  path: string;
  requestBody?: string;
  response: ExplorerResponse;
  timestamp: string;
}

// ── Sample Data ──

export interface SampleData {
  id: string;
  server_config_id: string;
  resource_type: 'user' | 'group';
  name: string;
  data_json: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}
