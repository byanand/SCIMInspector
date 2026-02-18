import { Component, inject, signal, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatDividerModule } from '@angular/material/divider';
import { MatSliderModule } from '@angular/material/slider';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTooltipModule } from '@angular/material/tooltip';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration, ChartData } from 'chart.js';
import { TauriService } from '../../services/tauri.service';
import { ServerConfigService } from '../../services/server-config.service';
import { NotificationService } from '../../services/notification.service';
import { ServerConfig, LoadTestConfig, LoadTestScenario, LoadTestSummary, LoadTestProgress, LoadTestResult } from '../../models/interfaces';

interface ScenarioInfo {
  id: LoadTestScenario;
  name: string;
  icon: string;
  description: string;
  operations: string[];
  requestLabel: string;
}

@Component({
  selector: 'app-load-test',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatCardModule, MatButtonModule, MatIconModule,
    MatFormFieldModule, MatInputModule, MatSelectModule, MatProgressBarModule,
    MatDividerModule, MatSliderModule, MatTabsModule, MatTooltipModule, BaseChartDirective
  ],
  templateUrl: './load-test.component.html',
  styleUrl: './load-test.component.scss'
})
export class LoadTestComponent implements OnInit, OnDestroy {
  private tauriService = inject(TauriService);
  readonly serverConfigService = inject(ServerConfigService);
  private notificationService = inject(NotificationService);

  // Inline server selector
  showQuickConnect = signal(false);
  quickConnect = signal({ name: '', base_url: '', auth_type: 'bearer' as 'bearer' | 'basic' | 'apikey', auth_token: '' });

  // Config form
  totalRequests = signal(100);
  concurrency = signal(10);
  rampUpSeconds = signal(0);
  selectedScenario = signal<LoadTestScenario>('create_users');

  scenarios: ScenarioInfo[] = [
    {
      id: 'create_users',
      name: 'Create Users',
      icon: 'person_add',
      description: 'Create users with auto-generated SCIM data, then clean up all created users.',
      operations: ['POST /Users', 'DELETE /Users/{id} (cleanup)'],
      requestLabel: 'Users to create'
    },
    {
      id: 'create_update',
      name: 'Create + Update',
      icon: 'edit',
      description: 'Create users, then update each one. Tests ID chaining from create to update.',
      operations: ['POST /Users', 'PATCH /Users/{id}', 'DELETE /Users/{id} (cleanup)'],
      requestLabel: 'User units (2 HTTP calls each)'
    },
    {
      id: 'full_lifecycle',
      name: 'Full Lifecycle',
      icon: 'autorenew',
      description: 'Full CRUD per user: create, read, then delete. No separate cleanup needed.',
      operations: ['POST /Users', 'GET /Users/{id}', 'DELETE /Users/{id}'],
      requestLabel: 'User units (3 HTTP calls each)'
    },
    {
      id: 'list_users',
      name: 'List Users',
      icon: 'list',
      description: 'Paginated listing of users. Tests read throughput with varying startIndex.',
      operations: ['GET /Users?startIndex=N&count=10'],
      requestLabel: 'List requests'
    }
  ];

  // State
  running = signal(false);
  progress = signal<LoadTestProgress | null>(null);
  currentRunId = signal<string | null>(null);
  results = signal<LoadTestResult[]>([]);
  summary = signal<LoadTestSummary | null>(null);

  // Chart data for latency distribution
  latencyChartData = signal<ChartData<'bar'>>({
    labels: [],
    datasets: []
  });

  latencyChartOptions: ChartConfiguration<'bar'>['options'] = {
    responsive: true,
    plugins: {
      legend: { display: false },
      title: { display: true, text: 'Latency Distribution (ms)' }
    },
    scales: {
      x: { title: { display: true, text: 'Latency (ms)' } },
      y: { title: { display: true, text: 'Request Count' } }
    }
  };

  // Status code pie chart
  statusChartData = signal<ChartData<'doughnut'>>({
    labels: [],
    datasets: []
  });

  statusChartOptions: ChartConfiguration<'doughnut'>['options'] = {
    responsive: true,
    plugins: {
      legend: { position: 'bottom' },
      title: { display: true, text: 'Status Code Distribution' }
    }
  };

  private unlistenProgress: (() => void) | null = null;

  async ngOnInit() {
    await this.serverConfigService.loadConfigs();
  }

  onServerChange(configId: string) {
    this.serverConfigService.selectConfig(configId);
  }

  toggleQuickConnect() {
    this.showQuickConnect.update(v => !v);
  }

  async saveQuickConnect() {
    const qc = this.quickConnect();
    if (!qc.name || !qc.base_url) {
      this.notificationService.error('Name and Base URL are required.');
      return;
    }
    try {
      const saved = await this.serverConfigService.saveConfig({
        name: qc.name,
        base_url: qc.base_url,
        auth_type: qc.auth_type,
        auth_token: qc.auth_token || undefined
      });
      this.serverConfigService.selectConfig(saved.id);
      this.showQuickConnect.set(false);
      this.quickConnect.set({ name: '', base_url: '', auth_type: 'bearer', auth_token: '' });
      this.notificationService.success('Server profile saved!');
    } catch (err: any) {
      this.notificationService.error('Failed to save: ' + (err?.message || err));
    }
  }

  async ngOnDestroy() {
    if (this.unlistenProgress) {
      this.unlistenProgress();
    }
  }

  selectScenario(scenarioId: LoadTestScenario) {
    this.selectedScenario.set(scenarioId);
  }

  getSelectedScenarioInfo(): ScenarioInfo {
    return this.scenarios.find(s => s.id === this.selectedScenario()) || this.scenarios[0];
  }

  async startLoadTest() {
    const configId = this.serverConfigService.getSelectedId();
    if (!configId) {
      this.notificationService.error('Please select a server profile first.');
      return;
    }

    this.running.set(true);
    this.results.set([]);
    this.summary.set(null);
    this.progress.set({ test_run_id: '', phase: 'Starting', completed: 0, total: this.totalRequests(), current_rps: 0, avg_latency_ms: 0, error_count: 0 });

    try {
      this.unlistenProgress = await this.tauriService.onLoadTestProgress((p: LoadTestProgress) => {
        this.progress.set(p);
      });

      const config: LoadTestConfig = {
        server_config_id: configId,
        total_requests: this.totalRequests(),
        concurrency: this.concurrency(),
        ramp_up_seconds: this.rampUpSeconds(),
        endpoints: [],
        scenario: this.selectedScenario()
      };

      const runId = await this.tauriService.startLoadTest(config);
      this.currentRunId.set(runId);
      this.notificationService.success('Load test completed!');

      // Load results
      const loadedResults = await this.tauriService.getLoadTestResults(runId);
      this.results.set(loadedResults);
      this.summary.set(this.computeLoadTestSummary(loadedResults));

      this.buildCharts(loadedResults);
    } catch (err: any) {
      this.notificationService.error('Load test failed: ' + (err?.message || err));
    } finally {
      this.running.set(false);
      if (this.unlistenProgress) {
        this.unlistenProgress();
        this.unlistenProgress = null;
      }
    }
  }

  async stopLoadTest() {
    const runId = this.currentRunId();
    if (runId) {
      try {
        await this.tauriService.stopLoadTest(runId);
        this.notificationService.info('Load test stopped.');
      } catch (err: any) {
        this.notificationService.error('Error stopping test: ' + (err?.message || err));
      }
    }
  }

  getProgressPercent(): number {
    const p = this.progress();
    if (!p || p.total === 0) return 0;
    return Math.round((p.completed / p.total) * 100);
  }

  private buildCharts(results: LoadTestResult[]) {
    // Latency histogram
    const durations = results.map(r => r.duration_ms);
    if (durations.length === 0) return;

    const maxDuration = Math.max(...durations);
    const bucketCount = 20;
    const bucketSize = Math.ceil(maxDuration / bucketCount);
    const buckets = new Array(bucketCount).fill(0);
    const labels: string[] = [];

    for (let i = 0; i < bucketCount; i++) {
      labels.push(`${i * bucketSize}-${(i + 1) * bucketSize}`);
    }

    for (const d of durations) {
      const idx = Math.min(Math.floor(d / bucketSize), bucketCount - 1);
      buckets[idx]++;
    }

    this.latencyChartData.set({
      labels,
      datasets: [{
        data: buckets,
        backgroundColor: '#42a5f5',
        borderRadius: 4
      }]
    });

    // Status code doughnut
    const statusCounts = new Map<number, number>();
    for (const r of results) {
      const code = r.status_code ?? 0;
      statusCounts.set(code, (statusCounts.get(code) || 0) + 1);
    }

    const statusLabels = Array.from(statusCounts.keys()).sort().map(s => `HTTP ${s}`);
    const statusData = Array.from(statusCounts.keys()).sort().map(s => statusCounts.get(s)!);
    const statusColors = Array.from(statusCounts.keys()).sort().map(s => {
      if (s >= 200 && s < 300) return '#4caf50';
      if (s >= 300 && s < 400) return '#ff9800';
      if (s >= 400 && s < 500) return '#f44336';
      return '#9c27b0';
    });

    this.statusChartData.set({
      labels: statusLabels,
      datasets: [{
        data: statusData,
        backgroundColor: statusColors
      }]
    });
  }

  private computeLoadTestSummary(results: LoadTestResult[]): LoadTestSummary {
    const total = results.length;
    if (total === 0) {
      return {
        total_requests: 0, successful: 0, failed: 0, error_rate: 0,
        total_duration_ms: 0, min_latency_ms: 0, max_latency_ms: 0,
        avg_latency_ms: 0, p50_latency_ms: 0, p95_latency_ms: 0,
        p99_latency_ms: 0, requests_per_second: 0, status_code_distribution: {}
      };
    }

    const successful = results.filter(r => r.success).length;
    const failed = total - successful;
    const error_rate = (failed / total) * 100;

    const durations = results.map(r => r.duration_ms).sort((a, b) => a - b);
    const total_duration_ms = durations.reduce((a, b) => a + b, 0);
    const min_latency_ms = durations[0];
    const max_latency_ms = durations[durations.length - 1];
    const avg_latency_ms = total_duration_ms / total;
    const p50_latency_ms = durations[Math.floor(total * 0.5)];
    const p95_latency_ms = durations[Math.floor(total * 0.95)];
    const p99_latency_ms = durations[Math.min(Math.floor(total * 0.99), total - 1)];

    const timestamps = results.map(r => new Date(r.timestamp).getTime());
    const timeSpan = Math.max(...timestamps) - Math.min(...timestamps);
    const requests_per_second = timeSpan > 0 ? (total / (timeSpan / 1000)) : total;

    const status_code_distribution: Record<number, number> = {};
    for (const r of results) {
      const code = r.status_code ?? 0;
      status_code_distribution[code] = (status_code_distribution[code] || 0) + 1;
    }

    return {
      total_requests: total, successful, failed, error_rate,
      total_duration_ms, min_latency_ms, max_latency_ms, avg_latency_ms,
      p50_latency_ms, p95_latency_ms, p99_latency_ms,
      requests_per_second, status_code_distribution
    };
  }
}
