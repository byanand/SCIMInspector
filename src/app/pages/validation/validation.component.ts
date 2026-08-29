import { Component, computed, inject, signal, OnDestroy, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TauriService } from '../../services/tauri.service';
import { ServerConfigService } from '../../services/server-config.service';
import { NotificationService } from '../../services/notification.service';
import { NavCountsService } from '../../services/nav-counts.service';
import { BusyService } from '../../services/busy.service';
import { groupFailures } from '../../services/failure-grouping';
import { VALIDATION_CATEGORIES, categoryLabel } from '../../services/validation-categories';
import { UI, TabDef } from '../../ui';
import {
  ValidationResult,
  ValidationSummary,
  ValidationProgress,
  CategorySummary,
  TestRun,
  ExportRequest,
} from '../../models/interfaces';

interface CategoryToggle {
  key: string;
  label: string;
  enabled: boolean;
}

type ValidationView = 'triage' | 'audit' | 'compare';

const VIEW_HINTS: Record<ValidationView, string> = {
  triage: 'Failures grouped by root cause, with the change that resolves each.',
  audit: 'Every category and its pass rate, whether or not anything failed.',
  compare: 'This run against the previous one on the same server.',
};

@Component({
  selector: 'app-validation',
  imports: [FormsModule, MatTooltipModule, ...UI],
  templateUrl: './validation.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './validation.component.scss',
})
export class ValidationComponent implements OnInit, OnDestroy {
  private readonly tauri = inject(TauriService);
  private readonly notify = inject(NotificationService);
  private readonly counts = inject(NavCountsService);
  private readonly router = inject(Router);
  readonly serverConfigService = inject(ServerConfigService);
  readonly busy = inject(BusyService);

  readonly userJoiningProperty = signal('userName');
  readonly groupJoiningProperty = signal('displayName');
  readonly configOpen = signal(false);

  readonly categories = signal<CategoryToggle[]>(
    VALIDATION_CATEGORIES.map((c) => ({ ...c, enabled: true }))
  );

  readonly running = signal(false);
  readonly progress = signal<ValidationProgress | null>(null);
  readonly results = signal<ValidationResult[]>([]);
  readonly summary = signal<ValidationSummary | null>(null);
  readonly currentRunId = signal<string | null>(null);
  readonly view = signal<ValidationView>('triage');
  /** Category summaries from the previous run on this server, for Compare. */
  readonly previousSummary = signal<ValidationSummary | null>(null);

  private unlistenProgress: (() => void) | null = null;

  readonly views: TabDef[] = [
    { id: 'triage', label: 'Triage' },
    { id: 'audit', label: 'Audit' },
    { id: 'compare', label: 'Compare' },
  ];

  readonly viewHint = computed(() => VIEW_HINTS[this.view()]);

  readonly enabledCategories = computed(() =>
    this.categories()
      .filter((c) => c.enabled)
      .map((c) => c.key)
  );

  readonly configSummary = computed(() => {
    const on = this.enabledCategories().length;
    const all = this.categories().length;
    return `${on} of ${all} categories · joining on ${this.userJoiningProperty()} / ${this.groupJoiningProperty()}`;
  });

  readonly scoreStats = computed(() => {
    const s = this.summary();
    if (!s) return [];
    return [
      { label: 'Passed', value: String(s.passed), color: 'var(--pass)' },
      { label: 'Failed', value: String(s.failed), color: s.failed > 0 ? 'var(--fail)' : '' },
      { label: 'Categories', value: String(s.categories?.length ?? 0), color: '' },
      { label: 'Duration', value: `${(s.duration_ms / 1000).toFixed(1)}s`, color: '' },
    ];
  });

  /** The heart of Triage: N failures collapsed into their handful of causes. */
  readonly failGroups = computed(() => groupFailures(this.results()));

  readonly passedNote = computed(() => {
    const s = this.summary();
    if (!s) return '';
    const cats = s.categories?.length ?? 0;
    return `${s.passed} ${s.passed === 1 ? 'test' : 'tests'} passed across ${cats} ${cats === 1 ? 'category' : 'categories'}`;
  });

  readonly auditRows = computed(() => {
    const s = this.summary();
    if (!s?.categories) return [];

    const durationByCategory = new Map<string, number>();
    for (const r of this.results()) {
      durationByCategory.set(r.category, (durationByCategory.get(r.category) ?? 0) + r.duration_ms);
    }

    return s.categories.map((c) => {
      const pct = c.total > 0 ? Math.round((c.passed / c.total) * 100) : 0;
      const color = pct === 100 ? 'var(--pass)' : pct >= 75 ? 'var(--warn)' : 'var(--fail)';
      return {
        name: categoryLabel(c.name),
        ratio: `${c.passed}/${c.total}`,
        pct,
        color,
        icon: pct === 100 ? 'check_circle' : 'error',
        ms: Math.round(durationByCategory.get(c.name) ?? 0),
      };
    });
  });

  readonly compareRows = computed(() => {
    const current = this.summary();
    const previous = this.previousSummary();
    if (!current?.categories || !previous?.categories) return [];

    const prevByName = new Map(previous.categories.map((c) => [c.name, c]));

    return current.categories.map((c) => {
      const prev = prevByName.get(c.name);
      const after = this.pct(c);
      const before = prev ? this.pct(prev) : null;
      const delta = before === null ? null : after - before;

      return {
        name: categoryLabel(c.name),
        before: before === null ? '—' : `${before}%`,
        after: `${after}%`,
        delta: delta === null ? 'new' : `${delta > 0 ? '+' : ''}${delta}%`,
        deltaIcon: delta === null ? 'add' : delta > 0 ? 'trending_up' : delta < 0 ? 'trending_down' : 'trending_flat',
        deltaColor:
          delta === null
            ? 'var(--ink-3)'
            : delta > 0
              ? 'var(--pass)'
              : delta < 0
                ? 'var(--fail)'
                : 'var(--ink-3)',
      };
    });
  });

  readonly hasPrevious = computed(() => this.previousSummary() !== null);

  readonly progressPercent = computed(() => {
    const p = this.progress();
    return !p || p.total === 0 ? 0 : Math.round((p.completed / p.total) * 100);
  });

  async ngOnInit(): Promise<void> {
    await this.serverConfigService.loadConfigs();
  }

  ngOnDestroy(): void {
    this.unlistenProgress?.();
  }

  private pct(c: CategorySummary): number {
    return c.total > 0 ? Math.round((c.passed / c.total) * 100) : 0;
  }

  // ── Configuration ──────────────────────────────────────────────────────────
  toggleConfig(): void {
    this.configOpen.update((v) => !v);
  }

  toggleCategory(index: number): void {
    this.categories.update((cats) =>
      cats.map((c, i) => (i === index ? { ...c, enabled: !c.enabled } : c))
    );
  }

  setView(view: string): void {
    this.view.set(view as ValidationView);
  }

  // ── Run ────────────────────────────────────────────────────────────────────
  async runValidation(): Promise<void> {
    const configId = this.serverConfigService.getSelectedId();
    if (!configId) {
      this.notify.error('Please select a server profile first.');
      return;
    }

    if (this.enabledCategories().length === 0) {
      this.notify.error('Please enable at least one test category.');
      return;
    }

    await this.busy.run('validation', async () => {
      this.running.set(true);
      this.results.set([]);
      this.summary.set(null);
      this.progress.set({
        test_run_id: '',
        current_test: 'Starting…',
        current_category: '',
        completed: 0,
        total: 0,
      });

      // Captured before the new run lands, so Compare has something to sit against.
      await this.loadPreviousSummary(configId);

      try {
        this.unlistenProgress = await this.tauri.onValidationProgress((p) => this.progress.set(p));

        const runId = await this.tauri.runValidation({
          server_config_id: configId,
          categories: this.enabledCategories(),
          user_joining_property: this.userJoiningProperty(),
          group_joining_property: this.groupJoiningProperty(),
        });
        this.currentRunId.set(runId);

        const results = await this.tauri.getValidationResults(runId);
        this.results.set(results);
        this.summary.set(this.computeSummary(results));
        this.configOpen.set(false);
        await this.counts.refreshRuns();
        this.notify.success('Validation completed.');
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.toLowerCase().includes('cancel')) {
          this.notify.info('Validation cancelled.');
        } else {
          this.notify.error('Validation failed: ' + msg);
        }
      } finally {
        this.running.set(false);
        this.progress.set(null);
        this.unlistenProgress?.();
        this.unlistenProgress = null;
      }
    });
  }

  async stopValidation(): Promise<void> {
    const runId = this.currentRunId();
    if (!runId) return;
    try {
      await this.tauri.stopValidation(runId);
    } catch {
      // Already finished is fine.
    }
  }

  /** Most recent completed validation on this server, before the run about to start. */
  private async loadPreviousSummary(configId: string): Promise<void> {
    try {
      const runs = await this.tauri.getTestRuns();
      const previous = runs.find(
        (r: TestRun) =>
          r.run_type === 'validation' &&
          r.status === 'completed' &&
          r.server_config_id === configId &&
          r.summary_json
      );
      this.previousSummary.set(
        previous?.summary_json ? (JSON.parse(previous.summary_json) as ValidationSummary) : null
      );
    } catch {
      this.previousSummary.set(null);
    }
  }

  // ── Per-failure actions ────────────────────────────────────────────────────
  async copyCurl(result: ValidationResult): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.buildCurl(result, false));
      this.notify.success('Curl command copied to clipboard.');
    } catch {
      this.notify.error('Failed to copy to clipboard.');
    }
  }

  /**
   * Hands the failing request to the Explorer so it can be re-sent and edited,
   * which is the usual next step after reading a cause.
   */
  openInExplorer(result: ValidationResult): void {
    void this.router.navigate(['/explorer'], {
      state: {
        method: result.http_method,
        path: result.url,
        body: result.request_body ?? '',
      },
    });
  }

  private buildCurl(result: ValidationResult, masked: boolean): string {
    const config = this.serverConfigService.selectedConfig();
    if (!config) return '';

    const base = config.base_url.replace(/\/$/, '');
    const fullUrl = `${base}${result.url.startsWith('/') ? '' : '/'}${result.url}`;
    const parts = [
      `curl -X ${result.http_method}`,
      `  '${fullUrl}'`,
      `  -H 'Content-Type: application/scim+json'`,
      `  -H 'Accept: application/scim+json'`,
    ];

    switch (config.auth_type) {
      case 'bearer':
        if (config.auth_token) {
          parts.push(`  -H 'Authorization: Bearer ${masked ? '***' : config.auth_token}'`);
        }
        break;
      case 'basic':
        if (config.auth_username && config.auth_password) {
          parts.push(
            masked ? `  -u '***:***'` : `  -u '${config.auth_username}:${config.auth_password}'`
          );
        }
        break;
      case 'apikey':
        if (config.api_key_header && config.api_key_value) {
          parts.push(`  -H '${config.api_key_header}: ${masked ? '***' : config.api_key_value}'`);
        }
        break;
    }

    if (result.request_body) {
      try {
        parts.push(`  -d '${JSON.stringify(JSON.parse(result.request_body), null, 2)}'`);
      } catch {
        parts.push(`  -d '${result.request_body}'`);
      }
    }

    return parts.join(' \\\n');
  }

  // ── Export ─────────────────────────────────────────────────────────────────
  async exportResults(): Promise<void> {
    const runId = this.currentRunId();
    if (!runId) return;

    await this.busy.run('export', async () => {
      try {
        const { save } = await import('@tauri-apps/plugin-dialog');
        const outputPath = await save({
          defaultPath: 'validation-report.xlsx',
          filters: [
            { name: 'Excel Workbook (2 sheets + charts)', extensions: ['xlsx'] },
            { name: 'HTML Report (print to PDF)', extensions: ['html'] },
            { name: 'CSV', extensions: ['csv'] },
            { name: 'JSON', extensions: ['json'] },
          ],
        });
        if (!outputPath) return;

        const ext = outputPath.split('.').pop()?.toLowerCase() ?? 'xlsx';
        const format: ExportRequest['format'] =
          ext === 'xlsx' ? 'excel' : ext === 'html' ? 'pdf' : ext === 'csv' ? 'csv' : 'json';

        await this.tauri.exportReport({
          test_run_id: runId,
          format,
          output_path: outputPath,
        });

        this.notify.success(
          format === 'pdf'
            ? 'Report opened in browser. Use File → Print → Save as PDF.'
            : `Report exported as ${ext.toUpperCase()}.`
        );
      } catch (err) {
        this.notify.error('Export failed: ' + (err instanceof Error ? err.message : String(err)));
      }
    });
  }

  private computeSummary(results: ValidationResult[]): ValidationSummary {
    const total = results.length;
    const passed = results.filter((r) => r.passed).length;
    const duration_ms = results.reduce((sum, r) => sum + r.duration_ms, 0);

    const catMap = new Map<string, { total: number; passed: number; failed: number }>();
    for (const r of results) {
      const cat = catMap.get(r.category) ?? { total: 0, passed: 0, failed: 0 };
      cat.total++;
      r.passed ? cat.passed++ : cat.failed++;
      catMap.set(r.category, cat);
    }

    return {
      total,
      passed,
      failed: total - passed,
      skipped: 0,
      compliance_score: total > 0 ? (passed / total) * 100 : 0,
      duration_ms,
      categories: [...catMap.entries()].map(([name, stats]) => ({ name, ...stats })),
    };
  }
}
