import { Injectable, signal, computed } from '@angular/core';
import { TauriService } from './tauri.service';
import { ServerConfig } from '../models';

@Injectable({ providedIn: 'root' })
export class ServerConfigService {
  private configs = signal<ServerConfig[]>([]);
  private selectedId = signal<string | null>(null);

  readonly serverConfigs = this.configs.asReadonly();
  readonly selectedConfig = computed(() => {
    const id = this.selectedId();
    return this.configs().find(c => c.id === id) ?? null;
  });

  constructor(private tauri: TauriService) {}

  async loadConfigs(): Promise<void> {
    const configs = await this.tauri.getServerConfigs();
    this.configs.set(configs);

    // Restore persisted selection
    if (!this.selectedId()) {
      try {
        const savedId = await this.tauri.getAppSetting('selected_server_id');
        if (savedId && configs.some(c => c.id === savedId)) {
          this.selectedId.set(savedId);
        }
      } catch { /* ignore */ }
    }
  }

  async saveConfig(config: Partial<ServerConfig>): Promise<ServerConfig> {
    const saved = await this.tauri.saveServerConfig(config);
    await this.loadConfigs();
    return saved;
  }

  async deleteConfig(id: string): Promise<void> {
    await this.tauri.deleteServerConfig(id);
    if (this.selectedId() === id) {
      this.selectedId.set(null);
      try { await this.tauri.saveAppSetting('selected_server_id', ''); } catch { /* ignore */ }
    }
    await this.loadConfigs();
  }

  selectConfig(id: string | null): void {
    this.selectedId.set(id);
    // Persist selection
    try { this.tauri.saveAppSetting('selected_server_id', id ?? ''); } catch { /* ignore */ }
  }

  getSelectedId(): string | null {
    return this.selectedId();
  }
}
