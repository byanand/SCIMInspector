import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatChipsModule } from '@angular/material/chips';
import { MatMenuModule } from '@angular/material/menu';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatTabsModule } from '@angular/material/tabs';
import { MatExpansionModule } from '@angular/material/expansion';
import { BaseChartDirective } from 'ng2-charts';
import { ChartData, ChartConfiguration } from 'chart.js';
import { TauriService } from '../../services/tauri.service';
import { NotificationService } from '../../services/notification.service';
import { TestRun, ExportRequest, ValidationResult, LoadTestResult, LoadTestSummary, ValidationSummary, CategorySummary, ServerConfig } from '../../models/interfaces';

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatCardModule, MatButtonModule, MatIconModule,
    MatTableModule, MatChipsModule, MatMenuModule, MatSelectModule, MatFormFieldModule,
    MatCheckboxModule, MatDividerModule, MatTooltipModule, MatTabsModule,
    MatExpansionModule, BaseChartDirective
  ],
  templateUrl: './reports.component.html',
  styleUrl: './reports.component.scss'
})
export class ReportsComponent implements OnInit {
  private tauriService = inject(TauriService);
  private notificationService = inject(NotificationService);

  testRuns = signal<TestRun[]>([]);
  filteredRuns = signal<TestRun[]>([]);
  filterType = signal<string>('all');
  selectedRuns = signal<Set<string>>(new Set());
  displayedColumns = ['select', 'type', 'config_name', 'status', 'created_at', 'summary', 'actions'];

  // Server config cache for resolving names
  serverConfigMap = signal<Map<string, ServerConfig>>(new Map());

  // Detail view state
  viewingRun = signal<TestRun | null>(null);
  viewingServerName = signal<string>('');

  // Validation detail
  validationResults = signal<ValidationResult[]>([]);
  validationSummary = signal<ValidationSummary | null>(null);
  validationCategories = signal<{ name: string; results: ValidationResult[]; expanded: boolean }[]>([]);

  // Load test detail
  loadTestResults = signal<LoadTestResult[]>([]);
  loadTestSummary = signal<LoadTestSummary | null>(null);

  latencyChartData = signal<ChartData<'bar'>>({ labels: [], datasets: [] });
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

  statusChartData = signal<ChartData<'doughnut'>>({ labels: [], datasets: [] });
  statusChartOptions: ChartConfiguration<'doughnut'>['options'] = {
    responsive: true,
    plugins: {
      legend: { position: 'bottom' },
      title: { display: true, text: 'Status Code Distribution' }
    }
  };

  // Comparison chart
  comparisonChartData = signal<ChartData<'line'>>({ labels: [], datasets: [] });
  comparisonChartOptions: ChartConfiguration<'line'>['options'] = {
    responsive: true,
    plugins: {
      legend: { position: 'bottom' },
      title: { display: true, text: 'Historical Comparison' }
    },
    scales: {
      x: { title: { display: true, text: 'Run' } },
      y: { title: { display: true, text: 'Value' } }
    }
  };

  showComparison = signal(false);

  async ngOnInit() {
    await this.loadServerConfigs();
    await this.loadRuns();
  }

  async loadServerConfigs() {
    try {
      const configs = await this.tauriService.getServerConfigs();
      const map = new Map<string, ServerConfig>();
      for (const c of configs) {
        map.set(c.id, c);
      }
      this.serverConfigMap.set(map);
    } catch { /* ignore */ }
  }

  getServerName(configId: string): string {
    const config = this.serverConfigMap().get(configId);
    return config?.name || configId.substring(0, 12) + '...';
  }

  async loadRuns() {
    try {
      const runs = await this.tauriService.getTestRuns();
      this.testRuns.set(runs);
      this.applyFilter();
    } catch (err: any) {
      this.notificationService.error('Failed to load test runs: ' + (err?.message || err));
    }
  }

  applyFilter() {
    const type = this.filterType();
    if (type === 'all') {
      this.filteredRuns.set(this.testRuns());
    } else {
      this.filteredRuns.set(this.testRuns().filter(r => r.run_type === type));
    }
  }

  setFilter(type: string) {
    this.filterType.set(type);
    this.applyFilter();
  }

  toggleSelect(runId: string, event: Event) {
    event.stopPropagation();
    const selected = new Set(this.selectedRuns());
    if (selected.has(runId)) {
      selected.delete(runId);
    } else {
      selected.add(runId);
    }
    this.selectedRuns.set(selected);
  }

  isSelected(runId: string): boolean {
    return this.selectedRuns().has(runId);
  }

  async deleteRun(runId: string, event?: Event) {
    if (event) event.stopPropagation();
    try {
      await this.tauriService.deleteTestRun(runId);
      this.notificationService.success('Test run deleted.');
      if (this.viewingRun()?.id === runId) {
        this.closeDetail();
      }
      await this.loadRuns();
    } catch (err: any) {
      this.notificationService.error('Failed to delete: ' + (err?.message || err));
    }
  }

  async exportReport(runId: string, format: string, event?: Event) {
    if (event) event.stopPropagation();
    const run = this.testRuns().find(r => r.id === runId);
    if (!run) return;

    try {
      const request: ExportRequest = {
        test_run_id: runId,
        format: format as ExportRequest['format'],
        output_path: ''
      };
      await this.tauriService.exportReport(request);
      this.notificationService.success('Report exported successfully.');
    } catch (err: any) {
      this.notificationService.error('Export failed: ' + (err?.message || err));
    }
  }

  // ── Detail View ──

  async viewRun(run: TestRun) {
    this.viewingRun.set(run);
    this.viewingServerName.set(this.getServerName(run.server_config_id));

    if (run.run_type === 'validation') {
      await this.loadValidationDetail(run);
    } else {
      await this.loadLoadTestDetail(run);
    }
  }

  closeDetail() {
    this.viewingRun.set(null);
    this.validationResults.set([]);
    this.validationSummary.set(null);
    this.validationCategories.set([]);
    this.loadTestResults.set([]);
    this.loadTestSummary.set(null);
  }

  private async loadValidationDetail(run: TestRun) {
    try {
      const results = await this.tauriService.getValidationResults(run.id);
      this.validationResults.set(results);

      // Parse summary from run
      const summary = run.summary_json ? JSON.parse(run.summary_json) as ValidationSummary : null;
      this.validationSummary.set(summary);

      // Group results by category
      const catMap = new Map<string, ValidationResult[]>();
      for (const r of results) {
        const cat = r.category || 'Uncategorized';
        if (!catMap.has(cat)) catMap.set(cat, []);
        catMap.get(cat)!.push(r);
      }
      this.validationCategories.set(
        Array.from(catMap.entries()).map(([name, res]) => ({ name, results: res, expanded: false }))
      );
    } catch (err: any) {
      this.notificationService.error('Failed to load results: ' + (err?.message || err));
    }
  }

  private async loadLoadTestDetail(run: TestRun) {
    try {
      const results = await this.tauriService.getLoadTestResults(run.id);
      this.loadTestResults.set(results);

      const summary = this.computeLoadTestSummary(results);
      this.loadTestSummary.set(summary);

      this.buildDetailCharts(results);
    } catch (err: any) {
      this.notificationService.error('Failed to load results: ' + (err?.message || err));
    }
  }

  private buildDetailCharts(results: LoadTestResult[]) {
    const durations = results.map(r => r.duration_ms);
    if (durations.length === 0) return;

    const maxDuration = Math.max(...durations);
    const bucketCount = 20;
    const bucketSize = Math.max(Math.ceil(maxDuration / bucketCount), 1);
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
      datasets: [{ data: buckets, backgroundColor: '#42a5f5', borderRadius: 4 }]
    });

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
      datasets: [{ data: statusData, backgroundColor: statusColors }]
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
    const sumDuration = durations.reduce((a, b) => a + b, 0);
    const min_latency_ms = durations[0];
    const max_latency_ms = durations[durations.length - 1];
    const avg_latency_ms = sumDuration / total;
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
      total_duration_ms: sumDuration, min_latency_ms, max_latency_ms, avg_latency_ms,
      p50_latency_ms, p95_latency_ms, p99_latency_ms,
      requests_per_second, status_code_distribution
    };
  }

  getPassRate(results: ValidationResult[]): number {
    if (results.length === 0) return 0;
    return Math.round((results.filter(r => r.passed).length / results.length) * 100);
  }

  getCategoryPassCount(results: ValidationResult[]): number {
    return results.filter(r => r.passed).length;
  }

  // ── Comparison ──

  compareSelected() {
    const selectedIds = Array.from(this.selectedRuns());
    if (selectedIds.length < 2) {
      this.notificationService.error('Select at least 2 runs to compare.');
      return;
    }

    const runs = this.testRuns().filter(r => selectedIds.includes(r.id));
    const allSameType = runs.every(r => r.run_type === runs[0].run_type);

    if (!allSameType) {
      this.notificationService.error('Can only compare runs of the same type.');
      return;
    }

    if (runs[0].run_type === 'validation') {
      this.buildValidationComparison(runs);
    } else {
      this.buildLoadTestComparison(runs);
    }

    this.showComparison.set(true);
  }

  private buildValidationComparison(runs: TestRun[]) {
    const labels = runs.map((r, i) => `Run ${i + 1} (${this.formatDate(r.started_at)})`);
    const scores = runs.map(r => {
      try {
        const summary = JSON.parse(r.summary_json || '{}');
        return summary.compliance_score || 0;
      } catch { return 0; }
    });

    this.comparisonChartData.set({
      labels,
      datasets: [{
        label: 'Compliance Score (%)',
        data: scores,
        borderColor: '#4caf50',
        backgroundColor: 'rgba(76, 175, 80, 0.1)',
        fill: true,
        tension: 0.3
      }]
    });
  }

  private buildLoadTestComparison(runs: TestRun[]) {
    const labels = runs.map((r, i) => `Run ${i + 1} (${this.formatDate(r.started_at)})`);

    const rps = runs.map(r => {
      try { return JSON.parse(r.summary_json || '{}').requests_per_second || 0; } catch { return 0; }
    });
    const avgLatency = runs.map(r => {
      try { return JSON.parse(r.summary_json || '{}').avg_latency_ms || 0; } catch { return 0; }
    });
    const errorRate = runs.map(r => {
      try { return JSON.parse(r.summary_json || '{}').error_rate || 0; } catch { return 0; }
    });

    this.comparisonChartData.set({
      labels,
      datasets: [
        {
          label: 'Requests/sec',
          data: rps,
          borderColor: '#2196f3',
          backgroundColor: 'rgba(33, 150, 243, 0.1)',
          fill: false,
          tension: 0.3,
          yAxisID: 'y'
        },
        {
          label: 'Avg Latency (ms)',
          data: avgLatency,
          borderColor: '#ff9800',
          backgroundColor: 'rgba(255, 152, 0, 0.1)',
          fill: false,
          tension: 0.3,
          yAxisID: 'y'
        },
        {
          label: 'Error Rate (%)',
          data: errorRate,
          borderColor: '#f44336',
          backgroundColor: 'rgba(244, 67, 54, 0.1)',
          fill: false,
          tension: 0.3,
          yAxisID: 'y'
        }
      ]
    });
  }

  formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString(undefined, {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  }

  formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  }

  getStatusColor(status: string): string {
    switch (status) {
      case 'completed': return 'primary';
      case 'failed': return 'warn';
      case 'running': return 'accent';
      default: return '';
    }
  }

  getSummaryText(run: TestRun): string {
    try {
      const s = JSON.parse(run.summary_json || '{}');
      if (run.run_type === 'validation') {
        return `Score: ${s.compliance_score?.toFixed(1) || '?'}% | ${s.passed || 0}/${s.total || 0} passed`;
      } else {
        return `${s.requests_per_second?.toFixed(1) || '?'} RPS | ${s.avg_latency_ms?.toFixed(0) || '?'}ms avg`;
      }
    } catch {
      return '—';
    }
  }
}
