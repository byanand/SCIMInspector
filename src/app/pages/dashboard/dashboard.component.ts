import { Component, OnInit, computed, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TauriService } from '../../services/tauri.service';
import { ServerConfigService } from '../../services/server-config.service';
import { BusyService } from '../../services/busy.service';
import { UI } from '../../ui';
import { TestRun, ValidationSummary, LoadTestSummary, CategorySummary } from '../../models';

interface RunRow {
  id: string;
  icon: string;
  title: string;
  server: string;
  date: string;
  summary: string;
  status: string;
  tone: 'pass' | 'warn' | 'fail' | 'neutral';
}

interface CategoryBar {
  name: string;
  ratio: string;
  pct: number;
  color: string;
}

const EM_DASH = '—';

@Component({
  selector: 'app-dashboard',
  imports: [RouterLink, ...UI],
  templateUrl: './dashboard.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent implements OnInit {
  private readonly tauri = inject(TauriService);
  private readonly servers = inject(ServerConfigService);
  private readonly router = inject(Router);
  readonly busy = inject(BusyService);

  private readonly runs = signal<TestRun[]>([]);
  private readonly lastValidation = signal<ValidationSummary | null>(null);
  private readonly lastLoadTest = signal<LoadTestSummary | null>(null);

  readonly hasServer = computed(() => this.servers.serverConfigs().length > 0);

  /**
   * The four headline figures. The redesign leads with compliance and failures
   * rather than with inventory counts — the question on opening the app is
   * "what is broken", not "how many profiles do I have".
   */
  readonly stats = computed(() => {
    const v = this.lastValidation();
    const l = this.lastLoadTest();
    const serverCount = this.servers.serverConfigs().length;

    return [
      {
        label: 'Compliance',
        value: v ? v.compliance_score.toFixed(1) : EM_DASH,
        unit: v ? '%' : '',
        color: '',
        note: v ? `${v.passed} of ${v.total} tests passed` : 'No validation run yet',
      },
      {
        label: 'Failures',
        value: v ? String(v.failed) : EM_DASH,
        unit: '',
        color: v && v.failed > 0 ? 'var(--fail)' : '',
        note: v ? `${this.affectedCategories(v)} categories affected` : 'Nothing to review',
      },
      {
        label: 'Throughput',
        value: l ? l.requests_per_second.toFixed(1) : EM_DASH,
        unit: l ? 'rps' : '',
        color: '',
        note: l
          ? `p95 ${Math.round(l.p95_latency_ms)}ms · p99 ${Math.round(l.p99_latency_ms)}ms`
          : 'No load test yet',
      },
      {
        label: 'Stored runs',
        value: String(this.runs().length),
        unit: '',
        color: '',
        note: `Across ${serverCount} ${serverCount === 1 ? 'server' : 'servers'}`,
      },
    ];
  });

  readonly recentRuns = computed<RunRow[]>(() =>
    this.runs()
      .slice(0, 6)
      .map((r) => ({
        id: r.id,
        icon: r.run_type === 'validation' ? 'verified' : 'speed',
        title: r.run_type === 'validation' ? 'Validation run' : 'Load test',
        server: this.serverName(r.server_config_id),
        date: this.formatDate(r.started_at),
        summary: this.summarise(r),
        status: r.status,
        tone: this.statusTone(r.status),
      }))
  );

  /** Six worst-performing categories, so the panel shows where to look. */
  readonly categoryBars = computed<CategoryBar[]>(() => {
    const v = this.lastValidation();
    if (!v?.categories?.length) return [];

    return [...v.categories]
      .sort((a, b) => this.ratio(a) - this.ratio(b))
      .slice(0, 6)
      .map((c) => {
        const pct = c.total > 0 ? Math.round((c.passed / c.total) * 100) : 0;
        return {
          name: c.name,
          ratio: `${c.passed}/${c.total}`,
          pct,
          color: pct === 100 ? 'var(--pass)' : pct >= 75 ? 'var(--warn)' : 'var(--fail)',
        };
      });
  });

  /**
   * The single next action. It is only worth showing when there is something
   * specific to say, so it stays absent rather than nagging.
   */
  readonly nextStep = computed(() => {
    if (!this.hasServer()) {
      return {
        text: 'No server profiles yet. Add an endpoint and credentials to start testing.',
        label: 'Add server',
        route: '/server-config',
      };
    }

    const v = this.lastValidation();
    if (!v) {
      return {
        text: 'No validation has run against this server yet. The 10 compliance categories take about a minute.',
        label: 'Run validation',
        route: '/validation',
      };
    }

    if (v.failed > 0) {
      const cats = this.affectedCategories(v);
      return {
        text: `${v.failed} ${v.failed === 1 ? 'test' : 'tests'} failed across ${cats} ${cats === 1 ? 'category' : 'categories'}. Triage groups them by cause.`,
        label: 'Review failures',
        route: '/validation',
      };
    }

    return null;
  });

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  private async load(): Promise<void> {
    const [runs] = await Promise.all([
      this.tauri.getTestRuns().catch(() => [] as TestRun[]),
      this.servers.loadConfigs(),
    ]);
    this.runs.set(runs);

    this.lastValidation.set(
      this.parseSummary<ValidationSummary>(runs, 'validation')
    );
    this.lastLoadTest.set(this.parseSummary<LoadTestSummary>(runs, 'loadtest'));
  }

  /** Newest completed run of a type, or null when its summary will not parse. */
  private parseSummary<T>(runs: TestRun[], type: TestRun['run_type']): T | null {
    const run = runs.find((r) => r.run_type === type && r.status === 'completed');
    if (!run?.summary_json) return null;
    try {
      return JSON.parse(run.summary_json) as T;
    } catch {
      return null;
    }
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

  private affectedCategories(v: ValidationSummary): number {
    return v.categories?.filter((c) => c.failed > 0).length ?? 0;
  }

  private ratio(c: CategorySummary): number {
    return c.total > 0 ? c.passed / c.total : 1;
  }

  private serverName(id: string): string {
    return this.servers.serverConfigs().find((c) => c.id === id)?.name ?? 'Unknown server';
  }

  private statusTone(status: string): RunRow['tone'] {
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

  private formatDate(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  openRun(): void {
    void this.router.navigate(['/reports']);
  }
}
