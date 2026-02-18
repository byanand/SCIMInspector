import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { TauriService } from '../../services/tauri.service';
import { ServerConfigService } from '../../services/server-config.service';
import { TestRun, ValidationSummary, LoadTestSummary } from '../../models';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink, MatCardModule, MatIconModule, MatButtonModule, MatChipsModule],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent implements OnInit {
  recentRuns = signal<TestRun[]>([]);
  serverCount = signal(0);
  lastValidationScore = signal<number | null>(null);
  lastLoadTestRps = signal<number | null>(null);

  constructor(
    private tauri: TauriService,
    private serverConfigService: ServerConfigService
  ) {}

  async ngOnInit(): Promise<void> {
    await this.loadData();
  }

  async loadData(): Promise<void> {
    const [runs, configs] = await Promise.all([
      this.tauri.getTestRuns(),
      this.serverConfigService.loadConfigs().then(() => this.serverConfigService.serverConfigs()),
    ]);

    this.recentRuns.set(runs.slice(0, 10));
    this.serverCount.set(configs.length);

    // Get last validation score
    const lastValidation = runs.find(r => r.run_type === 'validation' && r.status === 'completed');
    if (lastValidation?.summary_json) {
      const summary: ValidationSummary = JSON.parse(lastValidation.summary_json);
      this.lastValidationScore.set(Math.round(summary.compliance_score));
    }

    // Get last load test RPS
    const lastLoadTest = runs.find(r => r.run_type === 'loadtest' && r.status === 'completed');
    if (lastLoadTest?.summary_json) {
      const summary: LoadTestSummary = JSON.parse(lastLoadTest.summary_json);
      this.lastLoadTestRps.set(Math.round(summary.requests_per_second * 10) / 10);
    }
  }

  getStatusColor(status: string): string {
    switch (status) {
      case 'completed': return 'primary';
      case 'running': return 'accent';
      case 'failed': return 'warn';
      case 'cancelled': return '';
      default: return '';
    }
  }

  formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleString();
  }
}
