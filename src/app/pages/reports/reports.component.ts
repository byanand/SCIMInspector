import { Component, inject, signal, computed, OnInit, OnDestroy, ChangeDetectionStrategy } from '@angular/core';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatMenuModule } from '@angular/material/menu';
import { TauriService } from '../../services/tauri.service';
import { NotificationService } from '../../services/notification.service';
import { PageHeaderService } from '../../services/page-header.service';
import { NavCountsService } from '../../services/nav-counts.service';
import { BusyService } from '../../services/busy.service';
import { groupFailures, FailureGroup } from '../../services/failure-grouping';
import { UI, TabDef, Tone } from '../../ui';
import {
  TestRun,
  ServerConfig,
  ValidationResult,
  ValidationSummary,
  LoadTestResult,
  LoadTestSummary,
  ExportRequest,
} from '../../models/interfaces';

const EXPORT_FORMATS = [
  { id: 'excel', label: 'Excel', icon: 'table_view' },
  { id: 'pdf', label: 'PDF', icon: 'picture_as_pdf' },
  { id: 'csv', label: 'CSV', icon: 'table_chart' },
  { id: 'json', label: 'JSON', icon: 'data_object' },
] as const;

/** The subset of either summary shape the comparison reads. */
interface RunSummaryLike {
  compliance_score?: number;
  passed?: number;
  total?: number;
  requests_per_second?: number;
  p95_latency_ms?: number;
  error_rate?: number;
}

interface ComparisonPoint {
  id: string;
  label: string;
  server: string;
  value: number;
  display: string;
  secondary: string;
  pct: number;
}

interface ComparisonView {
  metric: string;
  unit: string;
  deltaLabel: string;
  deltaTone: Tone;
  points: ComparisonPoint[];
}

const LATENCY_KEYS = [
  ['min', 'min_latency_ms'],
  ['avg', 'avg_latency_ms'],
  ['p50', 'p50_latency_ms'],
  ['p75', 'p75_latency_ms'],
  ['p90', 'p90_latency_ms'],
  ['p95', 'p95_latency_ms'],
  ['p99', 'p99_latency_ms'],
  ['max', 'max_latency_ms'],
] as const;

@Component({
  selector: 'app-reports',
  imports: [MatTooltipModule, MatMenuModule, ...UI],
  templateUrl: './reports.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './reports.component.scss',
})
export class ReportsComponent implements OnInit, OnDestroy {
  private readonly tauri = inject(TauriService);
  private readonly notify = inject(NotificationService);
  private readonly header = inject(PageHeaderService);
  private readonly counts = inject(NavCountsService);
  readonly busy = inject(BusyService);

  readonly exportFormats = EXPORT_FORMATS;

  readonly testRuns = signal<TestRun[]>([]);
  readonly filterType = signal<'all' | 'validation' | 'loadtest'>('all');
  readonly selectedRuns = signal<Set<string>>(new Set());
  readonly confirmingDelete = signal<string | null>(null);
  readonly comparison = signal<ComparisonView | null>(null);
  private readonly serverConfigMap = signal<Map<string, ServerConfig>>(new Map());

  // ── Detail state ───────────────────────────────────────────────────────────
  readonly viewingRun = signal<TestRun | null>(null);
  readonly validationSummary = signal<ValidationSummary | null>(null);
  readonly validationResults = signal<ValidationResult[]>([]);
  readonly loadTestSummary = signal<LoadTestSummary | null>(null);

  readonly filters: TabDef[] = [
    { id: 'all', label: 'All' },
    { id: 'validation', label: 'Validation' },
    { id: 'loadtest', label: 'Load test' },
  ];

  readonly filteredRuns = computed(() => {
    const type = this.filterType();
    const runs = this.testRuns();
    return type === 'all' ? runs : runs.filter((r) => r.run_type === type);
  });

  readonly rows = computed(() =>
    this.filteredRuns().map((r) => ({
      run: r,
      id: r.id,
      icon: r.run_type === 'validation' ? 'verified' : 'speed',
      type: r.run_type === 'validation' ? 'Validation' : 'Load test',
      server: this.getServerName(r.server_config_id),
      status: r.status,
      tone: this.statusTone(r.status),
      date: this.formatDate(r.started_at),
      summary: this.summarise(r),
    }))
  );

  readonly countLabel = computed(() => {
    const n = this.filteredRuns().length;
    const sel = this.selectedRuns().size;
    return `${n} ${n === 1 ? 'run' : 'runs'}${sel > 0 ? ` · ${sel} selected` : ''}`;
  });

  readonly isValidationDetail = computed(() => this.viewingRun()?.run_type === 'validation');

  readonly detailStats = computed(() => {
    const run = this.viewingRun();
    if (!run) return [];

    if (run.run_type === 'validation') {
      const s = this.validationSummary();
      if (!s) return [];
      return [
        { label: 'Compliance', value: `${s.compliance_score.toFixed(1)}%`, color: '' },
        { label: 'Passed', value: String(s.passed), color: 'var(--pass)' },
        { label: 'Failed', value: String(s.failed), color: s.failed > 0 ? 'var(--fail)' : '' },
        { label: 'Categories', value: String(s.categories?.length ?? 0), color: '' },
        { label: 'Duration', value: `${(s.duration_ms / 1000).toFixed(1)}s`, color: '' },
      ];
    }

    const s = this.loadTestSummary();
    if (!s) return [];
    return [
      { label: 'Requests', value: s.total_requests.toLocaleString(), color: '' },
      { label: 'Throughput', value: `${s.requests_per_second.toFixed(1)} rps`, color: '' },
      { label: 'p95', value: `${Math.round(s.p95_latency_ms)}ms`, color: '' },
      { label: 'p99', value: `${Math.round(s.p99_latency_ms)}ms`, color: 'var(--warn)' },
      {
        label: 'Errors',
        value: `${s.error_rate.toFixed(1)}%`,
        color: s.error_rate > 0 ? 'var(--fail)' : '',
      },
    ];
  });

  readonly detailCategories = computed(() => {
    const s = this.validationSummary();
    if (!s?.categories) return [];
    return s.categories.map((c) => {
      const pct = c.total > 0 ? Math.round((c.passed / c.total) * 100) : 0;
      const color = pct === 100 ? 'var(--pass)' : pct >= 75 ? 'var(--warn)' : 'var(--fail)';
      return {
        name: c.name,
        ratio: `${c.passed}/${c.total}`,
        pct,
        color,
        icon: pct === 100 ? 'check_circle' : 'error',
      };
    });
  });

  readonly detailFailures = computed<FailureGroup[]>(() =>
    groupFailures(this.validationResults())
  );

  readonly detailLatency = computed(() => {
    const s = this.loadTestSummary();
    if (!s) return [];
    const values = LATENCY_KEYS.map(([label, key]) => ({ label, value: s[key] }));
    const max = Math.max(...values.map((v) => v.value), 1);
    return values.map(({ label, value }) => ({
      label,
      value: `${Math.round(value)}ms`,
      pct: Math.round((value / max) * 100),
      color: value > s.p90_latency_ms ? 'var(--warn)' : 'var(--accent)',
    }));
  });

  readonly detailStatuses = computed(() => {
    const s = this.loadTestSummary();
    if (!s) return [];
    const dist = s.status_code_distribution ?? {};
    const total = Object.values(dist).reduce((a, b) => a + b, 0);
    if (total === 0) return [];

    return Object.entries(dist)
      .map(([code, count]) => ({ code: Number(code), count }))
      .sort((a, b) => a.code - b.code)
      .map(({ code, count }) => ({
        code: code === 0 ? 'no response' : String(code),
        count,
        pct: (count / total) * 100,
        color: this.statusColor(code),
      }));
  });

  readonly detailConfig = computed(() => {
    const run = this.viewingRun();
    if (!run) return '';

    if (run.run_type === 'validation') {
      const s = this.validationSummary();
      return s ? `${s.categories?.length ?? 0} categories · ${s.total} tests` : '';
    }

    const s = this.loadTestSummary();
    return s ? `${s.total_requests.toLocaleString()} requests · ${s.successful} succeeded` : '';
  });

  async ngOnInit(): Promise<void> {
    await this.loadServerConfigs();
    await this.loadRuns();
  }

  ngOnDestroy(): void {
    // The drill-in heading belongs to this view only.
    this.header.setHeading(null, null);
  }

  private async loadServerConfigs(): Promise<void> {
    try {
      const configs = await this.tauri.getServerConfigs();
      this.serverConfigMap.set(new Map(configs.map((c) => [c.id, c])));
    } catch {
      // Names fall back to a truncated id.
    }
  }

  async loadRuns(): Promise<void> {
    try {
      this.testRuns.set(await this.tauri.getTestRuns());
      await this.counts.refreshRuns();
    } catch (err) {
      this.notify.error('Failed to load test runs: ' + this.message(err));
    }
  }

  getServerName(configId: string): string {
    return this.serverConfigMap().get(configId)?.name ?? `${configId.slice(0, 12)}…`;
  }

  setFilter(type: string): void {
    this.filterType.set(type as 'all' | 'validation' | 'loadtest');
  }

  toggleSelect(runId: string, event: Event): void {
    event.stopPropagation();
    this.selectedRuns.update((set) => {
      const next = new Set(set);
      if (next.has(runId)) {
        next.delete(runId);
      } else {
        next.add(runId);
      }
      return next;
    });
    // The open comparison described the previous selection.
    this.comparison.set(null);
  }

  isSelected(runId: string): boolean {
    return this.selectedRuns().has(runId);
  }

  // ── Deletion ───────────────────────────────────────────────────────────────
  askDelete(runId: string, event: Event): void {
    event.stopPropagation();
    this.confirmingDelete.set(runId);
  }

  cancelDelete(event: Event): void {
    event.stopPropagation();
    this.confirmingDelete.set(null);
  }

  async confirmDelete(runId: string, event: Event): Promise<void> {
    event.stopPropagation();
    try {
      await this.tauri.deleteTestRun(runId);
      this.confirmingDelete.set(null);
      this.selectedRuns.update((set) => {
        const next = new Set(set);
        next.delete(runId);
        return next;
      });
      if (this.viewingRun()?.id === runId) this.closeDetail();
      await this.loadRuns();
      this.notify.success('Test run deleted.');
    } catch (err) {
      this.notify.error('Failed to delete: ' + this.message(err));
    }
  }

  // ── Export ─────────────────────────────────────────────────────────────────
  async exportReport(runId: string, format: string, event?: Event): Promise<void> {
    event?.stopPropagation();
    if (!this.testRuns().some((r) => r.id === runId)) return;

    await this.busy.run('export', async () => {
      try {
        const { save } = await import('@tauri-apps/plugin-dialog');
        // PDF is produced as printable HTML; Excel as xlsx.
        const ext = format === 'pdf' ? 'html' : format === 'excel' ? 'xlsx' : format;
        const filterName =
          format === 'pdf'
            ? 'HTML Report (print to PDF)'
            : format === 'excel'
              ? 'Excel Workbook'
              : format.toUpperCase();

        const outputPath = await save({
          defaultPath: `report.${ext}`,
          filters: [{ name: filterName, extensions: [ext] }],
        });
        if (!outputPath) return;

        const request: ExportRequest = {
          test_run_id: runId,
          format: format as ExportRequest['format'],
          output_path: outputPath,
        };
        await this.tauri.exportReport(request);

        this.notify.success(
          format === 'pdf'
            ? 'Report opened in browser. Use File → Print → Save as PDF to export.'
            : 'Report exported successfully.'
        );
      } catch (err) {
        this.notify.error('Export failed: ' + this.message(err));
      }
    });
  }

  /** Exports each selected run in turn, under one lock. */
  async exportSelected(format: string): Promise<void> {
    const ids = [...this.selectedRuns()];
    if (ids.length === 0) {
      this.notify.info('Select at least one run to export.');
      return;
    }
    for (const id of ids) {
      await this.exportReport(id, format);
    }
  }

  // ── Comparison ─────────────────────────────────────────────────────────────
  /**
   * Compares the selected runs on the metric that matters for their type. The
   * design shows this as a set of rows rather than a plotted series — with a
   * handful of runs, the numbers side by side are easier to read than a line.
   */
  async compareSelected(): Promise<void> {
    const ids = this.selectedRuns();
    if (ids.size < 2) {
      this.notify.error('Select at least 2 runs to compare.');
      return;
    }

    const runs = this.testRuns().filter((r) => ids.has(r.id));
    if (!runs.every((r) => r.run_type === runs[0].run_type)) {
      this.notify.error('Can only compare runs of the same type.');
      return;
    }

    await this.busy.run('compare', async () => {
      this.comparison.set(this.buildComparison(runs));
    });
  }

  closeComparison(): void {
    this.comparison.set(null);
  }

  private buildComparison(runs: TestRun[]): ComparisonView {
    const isValidation = runs[0].run_type === 'validation';
    // Oldest first, so the rows read as a progression.
    const ordered = [...runs].sort(
      (a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime()
    );

    const metric = isValidation ? 'Compliance' : 'Throughput';
    const unit = isValidation ? '%' : 'rps';

    const points = ordered.map((run) => {
      const s = this.parse(run.summary_json);
      const value = isValidation ? (s?.compliance_score ?? 0) : (s?.requests_per_second ?? 0);
      return {
        id: run.id,
        label: this.formatDate(run.started_at),
        server: this.getServerName(run.server_config_id),
        value,
        display: value.toFixed(1),
        secondary: isValidation
          ? `${s?.passed ?? 0}/${s?.total ?? 0} passed`
          : `p95 ${Math.round(s?.p95_latency_ms ?? 0)}ms · ${(s?.error_rate ?? 0).toFixed(1)}% errors`,
      };
    });

    const max = Math.max(...points.map((p) => p.value), 1);
    const first = points[0]?.value ?? 0;
    const last = points[points.length - 1]?.value ?? 0;
    const delta = last - first;

    return {
      metric,
      unit,
      // Higher is better for both compliance and throughput.
      deltaLabel: `${delta >= 0 ? '+' : ''}${delta.toFixed(1)}${unit} across ${points.length} runs`,
      deltaTone: delta > 0 ? 'pass' : delta < 0 ? 'fail' : 'neutral',
      points: points.map((p) => ({ ...p, pct: Math.round((p.value / max) * 100) })),
    };
  }

  private parse(json: string | undefined): RunSummaryLike | null {
    if (!json) return null;
    try {
      return JSON.parse(json) as RunSummaryLike;
    } catch {
      return null;
    }
  }

  // ── Detail ─────────────────────────────────────────────────────────────────
  async viewRun(run: TestRun): Promise<void> {
    this.viewingRun.set(run);
    this.header.setHeading(
      run.run_type === 'validation' ? 'Validation run' : 'Load test run',
      `${this.getServerName(run.server_config_id)} · ${this.formatDate(run.started_at)}`
    );

    if (run.run_type === 'validation') {
      await this.loadValidationDetail(run);
    } else {
      await this.loadLoadTestDetail(run);
    }
  }

  closeDetail(): void {
    this.viewingRun.set(null);
    this.validationResults.set([]);
    this.validationSummary.set(null);
    this.loadTestSummary.set(null);
    this.header.setHeading(null, null);
  }

  private async loadValidationDetail(run: TestRun): Promise<void> {
    try {
      this.validationResults.set(await this.tauri.getValidationResults(run.id));
      this.validationSummary.set(
        run.summary_json ? (JSON.parse(run.summary_json) as ValidationSummary) : null
      );
    } catch (err) {
      this.notify.error('Failed to load results: ' + this.message(err));
    }
  }

  private async loadLoadTestDetail(run: TestRun): Promise<void> {
    try {
      const results = await this.tauri.getLoadTestResults(run.id);
      this.loadTestSummary.set(this.computeLoadTestSummary(results));
    } catch (err) {
      this.notify.error('Failed to load results: ' + this.message(err));
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  statusTone(status: string): Tone {
    switch (status) {
      case 'completed':
        return 'pass';
      case 'failed':
        return 'fail';
      case 'cancelled':
        return 'warn';
      default:
        return 'neutral';
    }
  }

  private statusColor(code: number): string {
    if (code >= 200 && code < 300) return 'var(--pass)';
    if (code >= 300 && code < 500) return 'var(--warn)';
    return 'var(--fail)';
  }

  private summarise(run: TestRun): string {
    if (!run.summary_json) return '';
    try {
      if (run.run_type === 'validation') {
        const s = JSON.parse(run.summary_json) as ValidationSummary;
        return `${s.passed}/${s.total} · ${s.compliance_score.toFixed(1)}%`;
      }
      const s = JSON.parse(run.summary_json) as LoadTestSummary;
      return `${s.requests_per_second.toFixed(1)} rps · p95 ${Math.round(s.p95_latency_ms)}ms`;
    } catch {
      return '';
    }
  }

  formatDate(iso: string): string {
    return new Date(iso).toLocaleString(undefined, {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  private computeLoadTestSummary(results: LoadTestResult[]): LoadTestSummary {
    const total = results.length;
    if (total === 0) {
      return {
        total_requests: 0, successful: 0, failed: 0, error_rate: 0,
        total_duration_ms: 0, min_latency_ms: 0, max_latency_ms: 0, avg_latency_ms: 0,
        p50_latency_ms: 0, p75_latency_ms: 0, p90_latency_ms: 0, p95_latency_ms: 0,
        p99_latency_ms: 0, requests_per_second: 0, status_code_distribution: {},
      };
    }

    const successful = results.filter((r) => r.success).length;
    const durations = results.map((r) => r.duration_ms).sort((a, b) => a - b);
    const sum = durations.reduce((a, b) => a + b, 0);
    const at = (q: number) => durations[Math.min(Math.floor(total * q), total - 1)];

    const timestamps = results.map((r) => new Date(r.timestamp).getTime());
    const timeSpan = Math.max(...timestamps) - Math.min(...timestamps);

    const status_code_distribution: Record<number, number> = {};
    for (const r of results) {
      const code = r.status_code ?? 0;
      status_code_distribution[code] = (status_code_distribution[code] || 0) + 1;
    }

    return {
      total_requests: total,
      successful,
      failed: total - successful,
      error_rate: ((total - successful) / total) * 100,
      total_duration_ms: sum,
      min_latency_ms: durations[0],
      max_latency_ms: durations[total - 1],
      avg_latency_ms: sum / total,
      p50_latency_ms: at(0.5),
      p75_latency_ms: at(0.75),
      p90_latency_ms: at(0.9),
      p95_latency_ms: at(0.95),
      p99_latency_ms: at(0.99),
      requests_per_second: timeSpan > 0 ? total / (timeSpan / 1000) : total,
      status_code_distribution,
    };
  }

  private message(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
  }
}
