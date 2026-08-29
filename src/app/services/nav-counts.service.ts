import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { TauriService } from './tauri.service';
import { ServerConfigService } from './server-config.service';

/**
 * Live counts for the sidebar badges. The redesign puts a figure beside
 * Servers, Field mapping, Sample data and Reports so the nav reports how much
 * is configured without the user opening each screen.
 *
 * Rule and template counts are per-server, so they reload when the active
 * profile changes; run and profile counts are global.
 */
@Injectable({ providedIn: 'root' })
export class NavCountsService {
  private readonly tauri = inject(TauriService);
  private readonly servers = inject(ServerConfigService);

  private readonly rulesCount = signal(0);
  private readonly samplesCount = signal(0);
  private readonly runsCount = signal(0);

  readonly servers$ = computed(() => this.servers.serverConfigs().length);
  readonly rules = this.rulesCount.asReadonly();
  readonly samples = this.samplesCount.asReadonly();
  readonly runs = this.runsCount.asReadonly();

  constructor() {
    effect(() => {
      const config = this.servers.selectedConfig();
      if (config) {
        void this.refreshForServer(config.id);
      } else {
        this.rulesCount.set(0);
        this.samplesCount.set(0);
      }
    });
  }

  /** Badges are decoration; a failed count must never surface as an error. */
  async refreshForServer(serverId: string): Promise<void> {
    const [rules, samples] = await Promise.all([
      this.tauri.getFieldMappingRules(serverId).catch(() => []),
      this.tauri.getSampleData(serverId).catch(() => []),
    ]);
    this.rulesCount.set(rules.length);
    this.samplesCount.set(samples.length);
  }

  async refreshRuns(): Promise<void> {
    const runs = await this.tauri.getTestRuns().catch(() => []);
    this.runsCount.set(runs.length);
  }
}
