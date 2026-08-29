import { Component, OnInit, computed, signal, inject, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ServerConfigService } from '../../services/server-config.service';
import { TauriService } from '../../services/tauri.service';
import { NotificationService } from '../../services/notification.service';
import { BusyService } from '../../services/busy.service';
import { UI } from '../../ui';
import { ServerConfig, TestConnectionResult } from '../../models';

const AUTH_LABELS: Record<string, string> = {
  bearer: 'Bearer',
  basic: 'Basic',
  apikey: 'API key',
};

const BLANK: Partial<ServerConfig> = {
  name: '',
  base_url: '',
  auth_type: 'bearer',
  auth_token: '',
  auth_username: '',
  auth_password: '',
  api_key_header: '',
  api_key_value: '',
  allow_invalid_certs: false,
};

@Component({
  selector: 'app-server-config',
  imports: [FormsModule, MatTooltipModule, ...UI],
  templateUrl: './server-config.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './server-config.component.scss',
})
export class ServerConfigComponent implements OnInit {
  readonly serverConfigService = inject(ServerConfigService);
  private readonly tauri = inject(TauriService);
  private readonly notify = inject(NotificationService);
  readonly busy = inject(BusyService);

  readonly configs = this.serverConfigService.serverConfigs;
  readonly editing = signal(false);
  readonly connectionResult = signal<TestConnectionResult | null>(null);
  readonly formData = signal<Partial<ServerConfig>>({ ...BLANK });

  readonly selectedId = computed(() => this.serverConfigService.getSelectedId());
  readonly isNew = computed(() => !this.formData().id);

  readonly profiles = computed(() =>
    this.configs().map((c) => ({
      ...c,
      auth: AUTH_LABELS[c.auth_type] ?? c.auth_type,
      active: c.id === this.formData().id,
    }))
  );

  async ngOnInit(): Promise<void> {
    await this.serverConfigService.loadConfigs();
    // Open the active profile rather than an empty pane, so the screen shows
    // what every other screen is currently pointed at.
    const active = this.serverConfigService.selectedConfig() ?? this.configs()[0];
    if (active) this.editConfig(active);
  }

  newConfig(): void {
    this.formData.set({ ...BLANK });
    this.editing.set(true);
    this.connectionResult.set(null);
  }

  editConfig(config: ServerConfig): void {
    this.formData.set({ ...config });
    this.editing.set(true);
    this.connectionResult.set(null);
  }

  cancelEdit(): void {
    this.editing.set(false);
    this.connectionResult.set(null);
  }

  async saveConfig(): Promise<void> {
    const data = this.formData();
    if (!data.name || !data.base_url) {
      this.notify.error('Name and Base URL are required');
      return;
    }

    await this.busy.run('save', async () => {
      try {
        const saved = await this.serverConfigService.saveConfig(data);
        this.formData.set({ ...saved });
        // A first profile is useless until something points at it.
        if (!this.selectedId()) {
          this.serverConfigService.selectConfig(saved.id);
        }
        this.notify.success('Server configuration saved');
      } catch (e) {
        this.notify.error('Failed to save: ' + e);
      }
    });
  }

  async deleteConfig(id: string, event?: Event): Promise<void> {
    event?.stopPropagation();
    try {
      await this.serverConfigService.deleteConfig(id);
      if (this.formData().id === id) {
        this.formData.set({ ...BLANK });
        this.editing.set(false);
      }
      this.notify.success('Configuration deleted');
    } catch (e) {
      this.notify.error('Failed to delete: ' + e);
    }
  }

  async testConnection(): Promise<void> {
    const data = this.formData();
    if (!data.base_url) {
      this.notify.error('Base URL is required to test connection');
      return;
    }

    await this.busy.run('connect', async () => {
      this.connectionResult.set(null);
      try {
        // The backend tests a stored profile, so the draft is persisted first.
        const config = await this.serverConfigService.saveConfig(data);
        this.formData.update((f) => ({ ...f, id: config.id }));

        const result = await this.tauri.testConnection(config.id);
        this.connectionResult.set(result);

        if (result.success) {
          this.notify.success(`Connection successful (${result.duration_ms}ms)`);
        } else {
          this.notify.error(`Connection failed: ${result.error || 'Unknown error'}`);
        }
      } catch (e) {
        this.notify.error('Connection test failed: ' + e);
      }
    });
  }

  selectConfig(id: string, event: Event): void {
    event.stopPropagation();
    this.serverConfigService.selectConfig(id);
    this.notify.info('Server profile selected');
  }

  updateFormField<K extends keyof ServerConfig>(field: K, value: ServerConfig[K]): void {
    this.formData.update((f) => ({ ...f, [field]: value }));
    // A changed profile invalidates the previous connection verdict.
    this.connectionResult.set(null);
  }
}
