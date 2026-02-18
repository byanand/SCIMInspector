import { Injectable } from '@angular/core';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import {
  ServerConfig,
  TestRun,
  ValidationResult,
  ValidationRunConfig,
  LoadTestConfig,
  LoadTestResult,
  TestConnectionResult,
  ExportRequest,
  ValidationProgress,
  LoadTestProgress,
  FieldMappingRule,
  DiscoveredSchemaAttribute,
  ExplorerRequest,
  ExplorerResponse,
} from '../models';

@Injectable({ providedIn: 'root' })
export class TauriService {
  // ── Server Config ──

  async saveServerConfig(config: Partial<ServerConfig>): Promise<ServerConfig> {
    return invoke<ServerConfig>('save_server_config', { config: { id: '', created_at: '', updated_at: '', ...config } });
  }

  async getServerConfigs(): Promise<ServerConfig[]> {
    return invoke<ServerConfig[]>('get_server_configs');
  }

  async getServerConfig(id: string): Promise<ServerConfig | null> {
    return invoke<ServerConfig | null>('get_server_config', { id });
  }

  async deleteServerConfig(id: string): Promise<void> {
    return invoke<void>('delete_server_config', { id });
  }

  // ── Test Connection ──

  async testConnection(serverConfigId: string): Promise<TestConnectionResult> {
    return invoke<TestConnectionResult>('test_connection', { serverConfigId });
  }

  // ── Validation ──

  async runValidation(config: ValidationRunConfig): Promise<string> {
    return invoke<string>('run_validation', { config });
  }

  async getValidationResults(testRunId: string): Promise<ValidationResult[]> {
    return invoke<ValidationResult[]>('get_validation_results', { testRunId });
  }

  // ── Load Test ──

  async startLoadTest(config: LoadTestConfig): Promise<string> {
    return invoke<string>('start_load_test', { config });
  }

  async stopLoadTest(testRunId: string): Promise<void> {
    return invoke<void>('stop_load_test', { testRunId });
  }

  async getLoadTestResults(testRunId: string): Promise<LoadTestResult[]> {
    return invoke<LoadTestResult[]>('get_load_test_results', { testRunId });
  }

  // ── Test Runs ──

  async getTestRuns(serverConfigId?: string, runType?: string): Promise<TestRun[]> {
    return invoke<TestRun[]>('get_test_runs', { serverConfigId: serverConfigId ?? null, runType: runType ?? null });
  }

  async getTestRun(id: string): Promise<TestRun | null> {
    return invoke<TestRun | null>('get_test_run', { id });
  }

  async deleteTestRun(id: string): Promise<void> {
    return invoke<void>('delete_test_run', { id });
  }

  // ── Export ──

  async exportReport(request: ExportRequest): Promise<void> {
    return invoke<void>('export_report', { request });
  }

  // ── Field Mapping ──

  async saveFieldMappingRule(rule: Partial<FieldMappingRule> & { server_config_id: string; scim_attribute: string; display_name: string; format: string }): Promise<FieldMappingRule> {
    return invoke<FieldMappingRule>('save_field_mapping_rule', { rule: { id: '', created_at: '', updated_at: '', required: false, ...rule } });
  }

  async getFieldMappingRules(serverConfigId: string): Promise<FieldMappingRule[]> {
    return invoke<FieldMappingRule[]>('get_field_mapping_rules', { serverConfigId });
  }

  async deleteFieldMappingRule(id: string): Promise<void> {
    return invoke<void>('delete_field_mapping_rule', { id });
  }

  // ── Custom Schema Discovery ──

  async discoverCustomSchema(serverConfigId: string): Promise<DiscoveredSchemaAttribute[]> {
    return invoke<DiscoveredSchemaAttribute[]>('discover_custom_schema', { serverConfigId });
  }

  // ── Utility ──

  async clearAllData(): Promise<void> {
    return invoke<void>('clear_all_data');
  }

  // ── Event Listeners ──

  async onValidationProgress(callback: (progress: ValidationProgress) => void): Promise<UnlistenFn> {
    return listen<ValidationProgress>('validation-progress', (event) => callback(event.payload));
  }

  async onLoadTestProgress(callback: (progress: LoadTestProgress) => void): Promise<UnlistenFn> {
    return listen<LoadTestProgress>('loadtest-progress', (event) => callback(event.payload));
  }

  // ── App Settings ──

  async getAppSetting(key: string): Promise<string | null> {
    return invoke<string | null>('get_app_setting', { key });
  }

  async saveAppSetting(key: string, value: string): Promise<void> {
    return invoke<void>('save_app_setting', { key, value });
  }

  async deleteAppSetting(key: string): Promise<void> {
    return invoke<void>('delete_app_setting', { key });
  }

  // ── SCIM Explorer ──

  async executeScimRequest(request: ExplorerRequest): Promise<ExplorerResponse> {
    return invoke<ExplorerResponse>('execute_scim_request', { request });
  }

  async generateScimData(operation: string): Promise<string> {
    return invoke<string>('generate_scim_data', { operation });
  }
}
