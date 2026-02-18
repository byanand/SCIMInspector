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
    }
    await this.loadConfigs();
  }

  selectConfig(id: string | null): void {
    this.selectedId.set(id);
  }

  getSelectedId(): string | null {
    return this.selectedId();
  }
}
