import { Injectable } from '@angular/core';
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
  SampleData,
} from '../models';

// Lazy-load Tauri APIs so the import doesn't break in browsers
let tauriInvoke: typeof import('@tauri-apps/api/core').invoke | undefined;
let tauriListen: typeof import('@tauri-apps/api/event').listen | undefined;

const tauriReady = (async () => {
  try {
    if ((window as any).__TAURI_INTERNALS__) {
      const core = await import('@tauri-apps/api/core');
      const event = await import('@tauri-apps/api/event');
      tauriInvoke = core.invoke;
      tauriListen = event.listen;
    }
  } catch {
    // Not running in Tauri – browser fallback will be used
  }
})();

function isTauri(): boolean {
  return typeof tauriInvoke === 'function';
}

// ── Browser-only localStorage helpers ──
function lsGet<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}
function lsSet(key: string, value: any): void {
  localStorage.setItem(key, JSON.stringify(value));
}
function uuid(): string {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
function nowIso(): string {
  return new Date().toISOString();
}

@Injectable({ providedIn: 'root' })
export class TauriService {

  /** Wait until we know whether Tauri is available */
  readonly ready = tauriReady;

  // ── Server Config ──

  async saveServerConfig(config: Partial<ServerConfig>): Promise<ServerConfig> {
    await this.ready;
    if (isTauri()) {
      return tauriInvoke!<ServerConfig>('save_server_config', { config: { id: '', created_at: '', updated_at: '', ...config } });
    }
    // localStorage fallback
    const configs: ServerConfig[] = lsGet('scim_server_configs', []);
    const now = nowIso();
    if (config.id) {
      const idx = configs.findIndex(c => c.id === config.id);
      if (idx >= 0) {
        configs[idx] = { ...configs[idx], ...config, updated_at: now } as ServerConfig;
        lsSet('scim_server_configs', configs);
        return configs[idx];
      }
    }
    const saved: ServerConfig = {
      id: uuid(), name: '', base_url: '', auth_type: 'bearer',
      created_at: now, updated_at: now,
      ...config,
    } as ServerConfig;
    configs.push(saved);
    lsSet('scim_server_configs', configs);
    return saved;
  }

  async getServerConfigs(): Promise<ServerConfig[]> {
    await this.ready;
    if (isTauri()) return tauriInvoke!<ServerConfig[]>('get_server_configs');
    return lsGet<ServerConfig[]>('scim_server_configs', []);
  }

  async getServerConfig(id: string): Promise<ServerConfig | null> {
    await this.ready;
    if (isTauri()) return tauriInvoke!<ServerConfig | null>('get_server_config', { id });
    const configs: ServerConfig[] = lsGet('scim_server_configs', []);
    return configs.find(c => c.id === id) ?? null;
  }

  async deleteServerConfig(id: string): Promise<void> {
    await this.ready;
    if (isTauri()) return tauriInvoke!<void>('delete_server_config', { id });
    const configs: ServerConfig[] = lsGet('scim_server_configs', []);
    lsSet('scim_server_configs', configs.filter(c => c.id !== id));
  }

  // ── Test Connection ──

  async testConnection(serverConfigId: string): Promise<TestConnectionResult> {
    await this.ready;
    if (isTauri()) return tauriInvoke!<TestConnectionResult>('test_connection', { serverConfigId });

    // Browser-mode fallback: test via fetch to ServiceProviderConfig
    const configs: ServerConfig[] = lsGet('scim_server_configs', []);
    const config = configs.find(c => c.id === serverConfigId);
    if (!config) throw new Error('Server config not found');

    const url = config.base_url.replace(/\/$/, '') + '/ServiceProviderConfig';
    const headers: Record<string, string> = { 'Accept': 'application/scim+json' };
    if (config.auth_type === 'bearer' && config.auth_token) {
      headers['Authorization'] = `Bearer ${config.auth_token}`;
    } else if (config.auth_type === 'basic' && config.auth_username) {
      headers['Authorization'] = `Basic ${btoa(config.auth_username + ':' + (config.auth_password ?? ''))}`;
    } else if (config.auth_type === 'apikey' && config.api_key_header && config.api_key_value) {
      headers[config.api_key_header] = config.api_key_value;
    }

    const start = performance.now();
    try {
      const resp = await fetch(url, { method: 'GET', headers });
      const duration_ms = Math.round(performance.now() - start);
      const body = await resp.text();
      return {
        success: resp.ok,
        status_code: resp.status,
        response_body: body,
        duration_ms,
      };
    } catch (err: any) {
      const duration_ms = Math.round(performance.now() - start);
      return {
        success: false,
        error: err?.message ?? 'Failed to reach server',
        duration_ms,
      };
    }
  }

  // ── Validation ──

  async runValidation(config: ValidationRunConfig): Promise<string> {
    await this.ready;
    if (isTauri()) return tauriInvoke!<string>('run_validation', { config });
    throw new Error('Validation is not available in browser mode. Run the app with Tauri.');
  }

  async getValidationResults(testRunId: string): Promise<ValidationResult[]> {
    await this.ready;
    if (isTauri()) return tauriInvoke!<ValidationResult[]>('get_validation_results', { testRunId });
    return [];
  }

  // ── Load Test ──

  async startLoadTest(config: LoadTestConfig): Promise<string> {
    await this.ready;
    if (isTauri()) return tauriInvoke!<string>('start_load_test', { config });
    throw new Error('Load testing is not available in browser mode. Run the app with Tauri.');
  }

  async stopLoadTest(testRunId: string): Promise<void> {
    await this.ready;
    if (isTauri()) return tauriInvoke!<void>('stop_load_test', { testRunId });
  }

  async getLoadTestResults(testRunId: string): Promise<LoadTestResult[]> {
    await this.ready;
    if (isTauri()) return tauriInvoke!<LoadTestResult[]>('get_load_test_results', { testRunId });
    return [];
  }

  // ── Test Runs ──

  async getTestRuns(serverConfigId?: string, runType?: string): Promise<TestRun[]> {
    await this.ready;
    if (isTauri()) return tauriInvoke!<TestRun[]>('get_test_runs', { serverConfigId: serverConfigId ?? null, runType: runType ?? null });
    return [];
  }

  async getTestRun(id: string): Promise<TestRun | null> {
    await this.ready;
    if (isTauri()) return tauriInvoke!<TestRun | null>('get_test_run', { id });
    return null;
  }

  async deleteTestRun(id: string): Promise<void> {
    await this.ready;
    if (isTauri()) return tauriInvoke!<void>('delete_test_run', { id });
  }

  // ── Export ──

  async exportReport(request: ExportRequest): Promise<void> {
    await this.ready;
    if (isTauri()) return tauriInvoke!<void>('export_report', { request });
    throw new Error('Export is not available in browser mode. Run the app with Tauri.');
  }

  // ── Field Mapping ──

  async saveFieldMappingRule(rule: Partial<FieldMappingRule> & { server_config_id: string; scim_attribute: string; display_name: string; format: string }): Promise<FieldMappingRule> {
    await this.ready;
    if (isTauri()) return tauriInvoke!<FieldMappingRule>('save_field_mapping_rule', { rule: { id: '', created_at: '', updated_at: '', required: false, ...rule } });
    throw new Error('Field mapping is not available in browser mode. Run the app with Tauri.');
  }

  async getFieldMappingRules(serverConfigId: string): Promise<FieldMappingRule[]> {
    await this.ready;
    if (isTauri()) return tauriInvoke!<FieldMappingRule[]>('get_field_mapping_rules', { serverConfigId });
    return [];
  }

  async deleteFieldMappingRule(id: string): Promise<void> {
    await this.ready;
    if (isTauri()) return tauriInvoke!<void>('delete_field_mapping_rule', { id });
  }

  // ── Custom Schema Discovery ──

  async discoverCustomSchema(serverConfigId: string): Promise<DiscoveredSchemaAttribute[]> {
    await this.ready;
    if (isTauri()) return tauriInvoke!<DiscoveredSchemaAttribute[]>('discover_custom_schema', { serverConfigId });
    return [];
  }

  async fetchScimSchemas(serverConfigId: string): Promise<any[]> {
    await this.ready;
    if (isTauri()) return tauriInvoke!<any[]>('get_scim_schemas', { serverConfigId });
    return [];
  }

  // ── Utility ──

  async clearAllData(): Promise<void> {
    await this.ready;
    if (isTauri()) return tauriInvoke!<void>('clear_all_data');
    localStorage.removeItem('scim_server_configs');
    localStorage.removeItem('scim_app_settings');
  }

  // ── Event Listeners ──

  async onValidationProgress(callback: (progress: ValidationProgress) => void): Promise<() => void> {
    await this.ready;
    if (isTauri() && tauriListen) {
      return tauriListen<ValidationProgress>('validation-progress', (event) => callback(event.payload));
    }
    return () => {}; // no-op unsubscribe in browser mode
  }

  async onLoadTestProgress(callback: (progress: LoadTestProgress) => void): Promise<() => void> {
    await this.ready;
    if (isTauri() && tauriListen) {
      return tauriListen<LoadTestProgress>('loadtest-progress', (event) => callback(event.payload));
    }
    return () => {};
  }

  // ── App Settings ──

  async getAppSetting(key: string): Promise<string | null> {
    await this.ready;
    if (isTauri()) return tauriInvoke!<string | null>('get_app_setting', { key });
    const settings: Record<string, string> = lsGet('scim_app_settings', {});
    return settings[key] ?? null;
  }

  async saveAppSetting(key: string, value: string): Promise<void> {
    await this.ready;
    if (isTauri()) return tauriInvoke!<void>('save_app_setting', { key, value });
    const settings: Record<string, string> = lsGet('scim_app_settings', {});
    settings[key] = value;
    lsSet('scim_app_settings', settings);
  }

  async deleteAppSetting(key: string): Promise<void> {
    await this.ready;
    if (isTauri()) return tauriInvoke!<void>('delete_app_setting', { key });
    const settings: Record<string, string> = lsGet('scim_app_settings', {});
    delete settings[key];
    lsSet('scim_app_settings', settings);
  }

  // ── SCIM Explorer ──

  async executeScimRequest(request: ExplorerRequest): Promise<ExplorerResponse> {
    await this.ready;
    if (isTauri()) return tauriInvoke!<ExplorerResponse>('execute_scim_request', { request });

    // Browser-mode fallback: execute via fetch
    const configs: ServerConfig[] = lsGet('scim_server_configs', []);
    const config = configs.find(c => c.id === request.server_config_id);
    if (!config) throw new Error('Server config not found');

    const url = new URL(request.path, config.base_url.replace(/\/$/, '') + '/');
    if (request.query_params) {
      request.query_params.split('&').filter(Boolean).forEach(p => {
        const [k, v] = p.split('=');
        if (k) url.searchParams.set(decodeURIComponent(k), decodeURIComponent(v ?? ''));
      });
    }

    const headers: Record<string, string> = { 'Content-Type': 'application/scim+json' };
    if (config.auth_type === 'bearer' && config.auth_token) {
      headers['Authorization'] = `Bearer ${config.auth_token}`;
    } else if (config.auth_type === 'basic' && config.auth_username) {
      headers['Authorization'] = `Basic ${btoa(config.auth_username + ':' + (config.auth_password ?? ''))}`;
    } else if (config.auth_type === 'apikey' && config.api_key_header && config.api_key_value) {
      headers[config.api_key_header] = config.api_key_value;
    }

    const start = performance.now();
    try {
      const resp = await fetch(url.toString(), {
        method: request.method,
        headers,
        body: request.body && ['POST', 'PUT', 'PATCH'].includes(request.method) ? request.body : undefined,
      });
      const duration_ms = Math.round(performance.now() - start);
      const body = await resp.text();
      const respHeaders: Record<string, string> = {};
      resp.headers.forEach((v, k) => { respHeaders[k] = v; });

      return {
        status: resp.status,
        status_text: resp.statusText,
        headers: respHeaders,
        body,
        duration_ms,
        request_url: url.toString(),
      };
    } catch (err: any) {
      const duration_ms = Math.round(performance.now() - start);
      return {
        status: 0,
        status_text: 'Network Error',
        headers: {},
        body: err?.message ?? 'Failed to reach server',
        duration_ms,
        request_url: url.toString(),
      };
    }
  }

  async generateScimData(operation: string): Promise<string> {
    await this.ready;
    if (isTauri()) return tauriInvoke!<string>('generate_scim_data', { operation });
    return '{}';
  }

  // ── Sample Data ──

  async getSampleData(serverConfigId: string): Promise<SampleData[]> {
    await this.ready;
    if (isTauri()) return tauriInvoke!<SampleData[]>('get_sample_data', { serverConfigId });
    return lsGet<SampleData[]>(`scim_sample_data_${serverConfigId}`, []);
  }

  async saveSampleData(item: Partial<SampleData> & { server_config_id: string; resource_type: string; name: string; data_json: string }): Promise<SampleData> {
    await this.ready;
    if (isTauri()) return tauriInvoke!<SampleData>('save_sample_data', { item: { id: '', is_default: false, created_at: '', updated_at: '', ...item } });
    // localStorage fallback
    const key = `scim_sample_data_${item.server_config_id}`;
    const items: SampleData[] = lsGet(key, []);
    const now = nowIso();
    const saved: SampleData = {
      id: item.id || uuid(),
      server_config_id: item.server_config_id,
      resource_type: item.resource_type as any,
      name: item.name,
      data_json: item.data_json,
      is_default: item.is_default ?? false,
      created_at: item.created_at || now,
      updated_at: now,
    };
    const idx = items.findIndex(i => i.id === saved.id);
    if (idx >= 0) { items[idx] = saved; } else { items.push(saved); }
    lsSet(key, items);
    return saved;
  }

  async deleteSampleData(id: string, serverConfigId: string): Promise<void> {
    await this.ready;
    if (isTauri()) return tauriInvoke!<void>('delete_sample_data', { id });
    const key = `scim_sample_data_${serverConfigId}`;
    const items: SampleData[] = lsGet(key, []);
    lsSet(key, items.filter(i => i.id !== id));
  }

  async seedSampleData(serverConfigId: string): Promise<void> {
    await this.ready;
    if (isTauri()) return tauriInvoke!<void>('seed_sample_data', { serverConfigId });

    // Browser fallback – seed default sample data into localStorage
    const defaults: Array<{ resource_type: 'user' | 'group'; name: string; data_json: string }> = [
      {
        resource_type: 'user', name: 'Standard User',
        data_json: JSON.stringify({
          schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
          userName: 'jane.smith@example.com',
          name: { givenName: 'Jane', familyName: 'Smith', formatted: 'Jane Smith' },
          displayName: 'Jane Smith',
          emails: [{ value: 'jane.smith@example.com', type: 'work', primary: true }],
          phoneNumbers: [{ value: '+1-555-0101', type: 'work' }],
          title: 'Software Engineer',
          active: true
        }, null, 2)
      },
      {
        resource_type: 'user', name: 'Admin User',
        data_json: JSON.stringify({
          schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
          userName: 'admin@example.com',
          name: { givenName: 'Admin', familyName: 'User', formatted: 'Admin User' },
          displayName: 'Admin User',
          emails: [{ value: 'admin@example.com', type: 'work', primary: true }],
          title: 'System Administrator',
          active: true
        }, null, 2)
      },
      {
        resource_type: 'user', name: 'Contractor',
        data_json: JSON.stringify({
          schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
          userName: 'contractor@external.com',
          name: { givenName: 'Alex', familyName: 'Contractor' },
          displayName: 'Alex Contractor',
          emails: [{ value: 'contractor@external.com', type: 'work', primary: true }],
          title: 'External Contractor',
          active: true
        }, null, 2)
      },
      {
        resource_type: 'group', name: 'Engineering Team',
        data_json: JSON.stringify({
          schemas: ['urn:ietf:params:scim:schemas:core:2.0:Group'],
          displayName: 'Engineering Team',
          members: []
        }, null, 2)
      },
      {
        resource_type: 'group', name: 'Marketing Team',
        data_json: JSON.stringify({
          schemas: ['urn:ietf:params:scim:schemas:core:2.0:Group'],
          displayName: 'Marketing Team',
          members: []
        }, null, 2)
      }
    ];

    for (const d of defaults) {
      await this.saveSampleData({ server_config_id: serverConfigId, ...d, is_default: true });
    }
  }
}
