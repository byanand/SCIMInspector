import { Component, computed, inject, signal, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTableModule } from '@angular/material/table';
import { MatChipsModule } from '@angular/material/chips';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { TauriService } from '../../services/tauri.service';
import { ServerConfigService } from '../../services/server-config.service';
import { NotificationService } from '../../services/notification.service';
import { ValidationResult, ValidationSummary, ValidationProgress, ValidationRunConfig, CategorySummary, DiscoveredSchemaAttribute, ExportRequest } from '../../models/interfaces';

interface CategoryToggle {
  key: string;
  label: string;
  enabled: boolean;
}

@Component({
  selector: 'app-validation',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatCardModule, MatButtonModule, MatIconModule,
    MatCheckboxModule, MatProgressBarModule, MatTableModule, MatChipsModule,
    MatExpansionModule, MatDividerModule, MatTooltipModule, MatSelectModule,
    MatFormFieldModule, MatInputModule
  ],
  templateUrl: './validation.component.html',
  styleUrl: './validation.component.scss'
})
export class ValidationComponent implements OnInit, OnDestroy {
  private tauriService = inject(TauriService);
  readonly serverConfigService = inject(ServerConfigService);
  private notificationService = inject(NotificationService);

  // Joining property configuration (like Microsoft SCIM Validator)
  userJoiningProperty = signal('userName');
  groupJoiningProperty = signal('displayName');

  categories = signal<CategoryToggle[]>([
    { key: 'schema_discovery', label: 'Schema Discovery', enabled: true },
    { key: 'users_crud', label: 'Users CRUD', enabled: true },
    { key: 'groups_crud', label: 'Groups CRUD', enabled: true },
    { key: 'patch_operations', label: 'PATCH Operations', enabled: true },
    { key: 'filtering_pagination', label: 'Filtering & Pagination', enabled: true },
    { key: 'duplicate_detection', label: 'Duplicate Detection (409)', enabled: true },
    { key: 'soft_delete', label: 'Soft Delete (active=false)', enabled: true },
    { key: 'group_operations', label: 'Group PATCH & Membership', enabled: true },
    { key: 'field_mapping', label: 'Field Mapping Rules', enabled: true },
    { key: 'custom_schema', label: 'Custom Schema Properties', enabled: true }
  ]);

  running = signal(false);
  stopping = signal(false);
  progress = signal<ValidationProgress | null>(null);
  results = signal<ValidationResult[]>([]);
  summary = signal<ValidationSummary | null>(null);
  currentRunId = signal<string | null>(null);
  displayedColumns = ['status', 'category', 'test_name', 'duration_ms', 'message'];
  private unlistenProgress: (() => void) | null = null;

  // Result filtering & search
  resultFilter = signal<'all' | 'pass' | 'fail'>('all');
  searchQuery = signal('');
  failCount = computed(() => this.results().filter(r => !r.passed).length);
  groupedResults = computed(() => {
    const filter = this.resultFilter();
    const q = this.searchQuery().toLowerCase().trim();
    const filtered = this.results().filter(r => {
      if (filter === 'pass' && !r.passed) return false;
      if (filter === 'fail' && r.passed) return false;
      if (q && !r.test_name.toLowerCase().includes(q) && !r.category.toLowerCase().includes(q)) return false;
      return true;
    });
    const map = new Map<string, ValidationResult[]>();
    for (const r of filtered) {
      if (!map.has(r.category)) map.set(r.category, []);
      map.get(r.category)!.push(r);
    }
    return map;
  });
  sortedGroupKeys = computed(() => Array.from(this.groupedResults().keys()));

  // Custom schema discovery
  discoveredAttrs = signal<DiscoveredSchemaAttribute[]>([]);
  discoveryLoading = signal(false);
  discoveryLoaded = signal(false);
  discoveredTestCount = computed(() => {
    const attrs = this.discoveredAttrs();
    const boolCount = attrs.filter(a => a.attr_type === 'boolean').length;
    return boolCount * 2 + (attrs.length - boolCount);
  });

  async ngOnInit() {
    await this.serverConfigService.loadConfigs();
  }

  async ngOnDestroy() {
    if (this.unlistenProgress) {
      this.unlistenProgress();
    }
  }

  toggleCategory(index: number) {
    const updated = [...this.categories()];
    updated[index] = { ...updated[index], enabled: !updated[index].enabled };
    this.categories.set(updated);
  }

  toggleAll(enabled: boolean) {
    this.categories.set(this.categories().map(c => ({ ...c, enabled })));
  }

  get enabledCategories(): string[] {
    return this.categories().filter(c => c.enabled).map(c => c.key);
  }

  getUniqueSchemaUrns(): string[] {
    const urns = new Set(this.discoveredAttrs().map(a => a.schema_urn));
    return Array.from(urns);
  }

  async discoverCustomAttributes() {
    const configId = this.serverConfigService.getSelectedId();
    if (!configId) {
      this.notificationService.error('Please select a server profile first.');
      return;
    }
    this.discoveryLoading.set(true);
    try {
      const attrs = await this.tauriService.discoverCustomSchema(configId);
      this.discoveredAttrs.set(attrs);
      this.discoveryLoaded.set(true);
      if (attrs.length === 0) {
        this.notificationService.info('No custom/extension schema attributes found.');
      } else {
        const boolCount = attrs.filter(a => a.attr_type === 'boolean').length;
        const otherCount = attrs.length - boolCount;
        const testCount = boolCount * 2 + otherCount;
        this.notificationService.success(`Discovered ${attrs.length} custom attributes (${testCount} tests will be generated).`);
      }
    } catch (err: any) {
      this.notificationService.error('Discovery failed: ' + (err?.message || err));
    } finally {
      this.discoveryLoading.set(false);
    }
  }

  async runValidation() {
    const configId = this.serverConfigService.getSelectedId();
    if (!configId) {
      this.notificationService.error('Please select a server profile first.');
      return;
    }

    if (this.enabledCategories.length === 0) {
      this.notificationService.error('Please enable at least one test category.');
      return;
    }

    this.running.set(true);
    this.results.set([]);
    this.summary.set(null);
    this.resultFilter.set('all');
    this.searchQuery.set('');
    this.progress.set({ test_run_id: '', current_test: 'Starting...', current_category: '', completed: 0, total: 0 });

    try {
      this.unlistenProgress = await this.tauriService.onValidationProgress((p: ValidationProgress) => {
        this.progress.set(p);
      });

      const runId = await this.tauriService.runValidation({
        server_config_id: configId,
        categories: this.enabledCategories,
        user_joining_property: this.userJoiningProperty(),
        group_joining_property: this.groupJoiningProperty()
      });
      this.currentRunId.set(runId);
      this.notificationService.success('Validation completed!');

      // Load results
      const loadedResults = await this.tauriService.getValidationResults(runId);
      this.results.set(loadedResults);
      this.summary.set(this.computeValidationSummary(loadedResults));
    } catch (err: any) {
      const msg = (err?.message || String(err));
      if (msg.toLowerCase().includes('cancel')) {
        this.notificationService.info('Validation cancelled.');
      } else {
        this.notificationService.error('Validation failed: ' + msg);
      }
    } finally {
      this.running.set(false);
      if (this.unlistenProgress) {
        this.unlistenProgress();
        this.unlistenProgress = null;
      }
    }
  }

  async stopValidation() {
    const runId = this.currentRunId();
    if (!runId) return;
    this.stopping.set(true);
    try {
      await this.tauriService.stopValidation(runId);
    } catch { /* already done is fine */ }
    finally { this.stopping.set(false); }
  }

  async exportResults() {
    const runId = this.currentRunId();
    if (!runId) return;
    try {
      const { save } = await import('@tauri-apps/plugin-dialog');

      // Ask user which format they want via the save-dialog filter selection
      const outputPath = await save({
        defaultPath: 'validation-report.xlsx',
        filters: [
          { name: 'Excel Workbook (2 sheets + charts)', extensions: ['xlsx'] },
          { name: 'HTML Report (print to PDF)', extensions: ['html'] },
          { name: 'CSV',  extensions: ['csv']  },
          { name: 'JSON', extensions: ['json'] },
        ],
      });
      if (!outputPath) return;

      const ext = outputPath.split('.').pop()?.toLowerCase() ?? 'xlsx';
      const format = ext === 'xlsx' ? 'excel'
                   : ext === 'html' ? 'pdf'
                   : ext === 'csv'  ? 'csv'
                   : 'json';

      const request: ExportRequest = { test_run_id: runId, format, output_path: outputPath };
      await this.tauriService.exportReport(request);

      if (format === 'excel') {
        this.notificationService.success('Excel report exported and opened!');
      } else if (format === 'pdf') {
        this.notificationService.success('Report opened in browser. Use File \u2192 Print \u2192 Save as PDF.');
      } else {
        this.notificationService.success(`Report exported as ${ext.toUpperCase()}.`);
      }
    } catch (err: any) {
      this.notificationService.error('Export failed: ' + (err?.message || err));
    }
  }

  getStatusIcon(status: string): string {
    switch (status) {
      case 'pass': return 'check_circle';
      case 'fail': return 'cancel';
      case 'skip': return 'remove_circle';
      case 'error': return 'error';
      default: return 'help';
    }
  }

  getStatusColor(status: string): string {
    switch (status) {
      case 'pass': return 'green';
      case 'fail': return 'red';
      case 'skip': return 'orange';
      case 'error': return 'red';
      default: return 'grey';
    }
  }

  getProgressPercent(): number {
    const p = this.progress();
    if (!p || p.total === 0) return 0;
    return Math.round((p.completed / p.total) * 100);
  }

  getScoreColor(score: number): string {
    if (score >= 90) return 'green';
    if (score >= 70) return 'orange';
    return 'red';
  }

  getCurlCommand(result: ValidationResult): string {
    return this.buildCurl(result, false);
  }

  getCurlCommandDisplay(result: ValidationResult): string {
    return this.buildCurl(result, true);
  }

  private buildCurl(result: ValidationResult, masked: boolean): string {
    const config = this.serverConfigService.selectedConfig();
    if (!config) return '';

    const fullUrl = `${config.base_url.replace(/\/$/, '')}${result.url.startsWith('/') ? '' : '/'}${result.url}`;
    let parts = [`curl -X ${result.http_method}`];
    parts.push(`  '${fullUrl}'`);
    parts.push(`  -H 'Content-Type: application/scim+json'`);
    parts.push(`  -H 'Accept: application/scim+json'`);

    switch (config.auth_type) {
      case 'bearer':
        if (config.auth_token) {
          parts.push(`  -H 'Authorization: Bearer ${ masked ? '***' : config.auth_token }'`);
        }
        break;
      case 'basic':
        if (config.auth_username && config.auth_password) {
          parts.push(masked ? `  -u '***:***'` : `  -u '${config.auth_username}:${config.auth_password}'`);
        }
        break;
      case 'apikey':
        if (config.api_key_header && config.api_key_value) {
          parts.push(`  -H '${config.api_key_header}: ${ masked ? '***' : config.api_key_value }'`);
        }
        break;
    }

    if (result.request_body) {
      try {
        const pretty = JSON.stringify(JSON.parse(result.request_body), null, 2);
        parts.push(`  -d '${pretty}'`);
      } catch {
        parts.push(`  -d '${result.request_body}'`);
      }
    }

    return parts.join(' \\\n');
  }

  getGroupResults(catKey: string): ValidationResult[] {
    return this.groupedResults().get(catKey) ?? [];
  }

  getGroupFailCount(catKey: string): number {
    return this.getGroupResults(catKey).filter(r => !r.passed).length;
  }

  getGroupPassCount(catKey: string): number {
    return this.getGroupResults(catKey).filter(r => r.passed).length;
  }

  async copyCurl(result: ValidationResult) {
    const cmd = this.getCurlCommand(result);
    try {
      await navigator.clipboard.writeText(cmd);
      this.notificationService.success('Curl command copied to clipboard!');
    } catch {
      this.notificationService.error('Failed to copy to clipboard.');
    }
  }

  private computeValidationSummary(results: ValidationResult[]): ValidationSummary {
    const total = results.length;
    const passed = results.filter(r => r.passed).length;
    const failed = total - passed;
    const duration_ms = results.reduce((sum, r) => sum + r.duration_ms, 0);
    const compliance_score = total > 0 ? (passed / total) * 100 : 0;

    const catMap = new Map<string, { total: number; passed: number; failed: number }>();
    for (const r of results) {
      if (!catMap.has(r.category)) {
        catMap.set(r.category, { total: 0, passed: 0, failed: 0 });
      }
      const cat = catMap.get(r.category)!;
      cat.total++;
      if (r.passed) cat.passed++;
      else cat.failed++;
    }

    const categories: CategorySummary[] = Array.from(catMap.entries()).map(([name, stats]) => ({
      name,
      ...stats
    }));

    return { total, passed, failed, skipped: 0, compliance_score, duration_ms, categories };
  }
}
