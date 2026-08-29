import { Component, inject, signal, computed, OnDestroy, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TauriService } from '../../services/tauri.service';
import { ServerConfigService } from '../../services/server-config.service';
import { NotificationService } from '../../services/notification.service';
import { NavCountsService } from '../../services/nav-counts.service';
import { BusyService } from '../../services/busy.service';
import { UI } from '../../ui';
import {
  LoadTestConfig,
  LoadTestScenario,
  LoadTestSummary,
  LoadTestProgress,
  LoadTestResult,
} from '../../models/interfaces';

interface ScenarioInfo {
  id: LoadTestScenario;
  name: string;
  icon: string;
  description: string;
  operations: string[];
}

/** Percentiles the design puts on the latency chart, in order. */
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

const CHART_HEIGHT = 116;

@Component({
  selector: 'app-load-test',
  imports: [FormsModule, MatTooltipModule, ...UI],
  templateUrl: './load-test.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './load-test.component.scss',
})
export class LoadTestComponent implements OnInit, OnDestroy {
  private readonly tauri = inject(TauriService);
  private readonly notify = inject(NotificationService);
  private readonly counts = inject(NavCountsService);
  readonly serverConfigService = inject(ServerConfigService);
  readonly busy = inject(BusyService);

  readonly totalRequests = signal(100);
  readonly concurrency = signal(10);
  readonly rampUpSeconds = signal(0);
  readonly selectedScenarios = signal<Set<LoadTestScenario>>(new Set(['create_users']));

  readonly scenarios: ScenarioInfo[] = [
    {
      id: 'create_users',
      name: 'Create Users',
      icon: 'person_add',
      description: 'Create users with auto-generated SCIM data, then clean up all created users.',
      operations: ['POST /Users', 'DELETE /Users/{id}'],
    },
    {
      id: 'create_update',
      name: 'Create + Update',
      icon: 'edit',
      description: 'Create users, then update each one. Tests ID chaining from create to update.',
      operations: ['POST /Users', 'PATCH /Users/{id}'],
    },
    {
      id: 'full_lifecycle',
      name: 'Full Lifecycle',
      icon: 'autorenew',
      description: 'Full CRUD per user: create, read, then delete. No separate cleanup needed.',
      operations: ['POST', 'GET', 'DELETE'],
    },
    {
      id: 'list_users',
      name: 'List Users',
      icon: 'list',
      description: 'Paginated listing of users. Tests read throughput with varying startIndex.',
      operations: ['GET /Users?startIndex=N'],
    },
    {
      id: 'create_groups',
      name: 'Create Groups',
      icon: 'group_add',
      description: 'Create groups with auto-generated names, then clean up.',
      operations: ['POST /Groups', 'DELETE /Groups/{id}'],
    },
    {
      id: 'group_lifecycle',
      name: 'Group Lifecycle',
      icon: 'sync',
      description: 'Full CRUD per group: create, read, then delete.',
      operations: ['POST', 'GET', 'DELETE'],
    },
    {
      id: 'add_remove_members',
      name: 'Add/Remove Members',
      icon: 'group_add',
      description: 'Create a group and users, then add/remove each user as a member.',
      operations: ['PATCH /Groups/{id}'],
    },
    {
      id: 'update_groups',
      name: 'Update Groups',
      icon: 'edit_note',
      description: 'Create groups, then update each with PATCH. Tests group update throughput.',
      operations: ['POST /Groups', 'PATCH /Groups/{id}'],
    },
  ];

  readonly running = signal(false);
  readonly progress = signal<LoadTestProgress | null>(null);
  readonly currentRunId = signal<string | null>(null);
  readonly summary = signal<LoadTestSummary | null>(null);

  private unlistenProgress: (() => void) | null = null;

  readonly scenarioCount = computed(() => this.selectedScenarios().size);

  readonly configHint = computed(() => {
    const ramp = this.rampUpSeconds();
    const c = this.concurrency();
    return ramp > 0
      ? `${c} simultaneous requests, ramped over ${ramp}s.`
      : `${c} simultaneous requests, all at once.`;
  });

  readonly progressPercent = computed(() => {
    const p = this.progress();
    return !p || p.total === 0 ? 0 : Math.round((p.completed / p.total) * 100);
  });

  /** The six headline figures above the charts. */
  readonly metrics = computed(() => {
    const s = this.summary();
    if (!s) return [];
    return [
      { label: 'Requests', value: s.total_requests.toLocaleString(), color: '' },
      { label: 'Throughput', value: `${s.requests_per_second.toFixed(1)} rps`, color: '' },
      { label: 'Avg latency', value: `${Math.round(s.avg_latency_ms)}ms`, color: '' },
      { label: 'p95', value: `${Math.round(s.p95_latency_ms)}ms`, color: '' },
      { label: 'p99', value: `${Math.round(s.p99_latency_ms)}ms`, color: '' },
      {
        label: 'Error rate',
        value: `${s.error_rate.toFixed(1)}%`,
        color: s.error_rate > 0 ? 'var(--fail)' : '',
      },
    ];
  });

  /**
   * Latency bars, scaled against the slowest value so the shape of the tail is
   * legible. The design draws these in CSS rather than loading a chart library
   * for eight bars.
   */
  readonly latencyBars = computed(() => {
    const s = this.summary();
    if (!s) return [];

    const values = LATENCY_KEYS.map(([label, key]) => ({ label, value: s[key] }));
    const max = Math.max(...values.map((v) => v.value), 1);

    return values.map(({ label, value }) => ({
      label,
      value: `${Math.round(value)}ms`,
      height: Math.max(2, Math.round((value / max) * CHART_HEIGHT)),
      // The tail percentiles are what a reader is looking for, so they carry
      // the accent while the body of the distribution stays quiet.
      color: label === 'p95' || label === 'p99' || label === 'max' ? 'var(--accent)' : 'var(--line-2)',
    }));
  });

  readonly statusSlices = computed(() => {
    const s = this.summary();
    if (!s) return [];

    const dist = s.status_code_distribution ?? {};
    const total = Object.values(dist).reduce((a, b) => a + b, 0);
    if (total === 0) return [];

    return Object.entries(dist)
      .map(([code, count]) => ({ code: Number(code), count }))
      .sort((a, b) => a.code - b.code)
      .map(({ code, count }) => ({
        code: code === 0 ? 'no response' : `HTTP ${code}`,
        count,
        pct: (count / total) * 100,
        label: `${Math.round((count / total) * 100)}%`,
        color: this.statusColor(code),
      }));
  });

  async ngOnInit(): Promise<void> {
    await this.serverConfigService.loadConfigs();
  }

  ngOnDestroy(): void {
    this.unlistenProgress?.();
  }

  toggleScenario(id: LoadTestScenario): void {
    this.selectedScenarios.update((set) => {
      const next = new Set(set);
      if (next.has(id)) {
        // Never leave the run with nothing to do.
        if (next.size > 1) next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  isScenarioSelected(id: LoadTestScenario): boolean {
    return this.selectedScenarios().has(id);
  }

  async startLoadTest(): Promise<void> {
    const configId = this.serverConfigService.getSelectedId();
    if (!configId) {
      this.notify.error('Please select a server profile first.');
      return;
    }

    await this.busy.run('loadtest', async () => {
      this.running.set(true);
      this.summary.set(null);
      this.progress.set({
        test_run_id: '',
        phase: 'Starting',
        completed: 0,
        total: this.totalRequests(),
        current_rps: 0,
        avg_latency_ms: 0,
        error_count: 0,
      });

      try {
        this.unlistenProgress = await this.tauri.onLoadTestProgress((p) => this.progress.set(p));

        const selected = Array.from(this.selectedScenarios());
        const config: LoadTestConfig = {
          server_config_id: configId,
          total_requests: this.totalRequests(),
          concurrency: this.concurrency(),
          ramp_up_seconds: this.rampUpSeconds(),
          endpoints: [],
          scenario: selected[0] ?? 'create_users',
          scenarios: selected.length > 1 ? selected : undefined,
        };

        const runId = await this.tauri.startLoadTest(config);
        this.currentRunId.set(runId);

        const results = await this.tauri.getLoadTestResults(runId);
        this.summary.set(this.computeSummary(results));
        await this.counts.refreshRuns();
        this.notify.success('Load test completed.');
      } catch (err) {
        this.notify.error('Load test failed: ' + this.message(err));
      } finally {
        this.running.set(false);
        this.progress.set(null);
        this.unlistenProgress?.();
        this.unlistenProgress = null;
      }
    });
  }

  async stopLoadTest(): Promise<void> {
    const runId = this.currentRunId();
    if (!runId) return;
    try {
      await this.tauri.stopLoadTest(runId);
      this.notify.info('Load test stopped.');
    } catch (err) {
      this.notify.error('Error stopping test: ' + this.message(err));
    }
  }

  private statusColor(code: number): string {
    if (code >= 200 && code < 300) return 'var(--pass)';
    if (code >= 300 && code < 500) return 'var(--warn)';
    return 'var(--fail)';
  }

  private computeSummary(results: LoadTestResult[]): LoadTestSummary {
    const total = results.length;
    if (total === 0) {
      return {
        total_requests: 0, successful: 0, failed: 0, error_rate: 0,
        total_duration_ms: 0, min_latency_ms: 0, max_latency_ms: 0,
        avg_latency_ms: 0, p50_latency_ms: 0, p75_latency_ms: 0, p90_latency_ms: 0,
        p95_latency_ms: 0, p99_latency_ms: 0, requests_per_second: 0,
        status_code_distribution: {},
      };
    }

    const successful = results.filter((r) => r.success).length;
    const failed = total - successful;

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
      failed,
      error_rate: (failed / total) * 100,
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
