import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatChipsModule } from '@angular/material/chips';
import { MatDividerModule } from '@angular/material/divider';
import { ServerConfigService } from '../../services/server-config.service';
import { TauriService } from '../../services/tauri.service';
import { NotificationService } from '../../services/notification.service';
import { ServerConfig, TestConnectionResult } from '../../models';

@Component({
  selector: 'app-server-config',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    MatCardModule, MatFormFieldModule, MatInputModule, MatSelectModule,
    MatButtonModule, MatIconModule, MatListModule, MatProgressSpinnerModule,
    MatChipsModule, MatDividerModule,
  ],
  templateUrl: './server-config.component.html',
  styleUrl: './server-config.component.scss',
})
export class ServerConfigComponent implements OnInit {
  serverConfigService = inject(ServerConfigService);
  private tauri = inject(TauriService);
  private notify = inject(NotificationService);

  configs = this.serverConfigService.serverConfigs;
  editing = signal(false);
  testing = signal(false);
  connectionResult = signal<TestConnectionResult | null>(null);

  formData = signal<Partial<ServerConfig>>({
    name: '',
    base_url: '',
    auth_type: 'bearer',
    auth_token: '',
    auth_username: '',
    auth_password: '',
    api_key_header: '',
    api_key_value: '',
  });

  async ngOnInit(): Promise<void> {
    await this.serverConfigService.loadConfigs();
  }

  newConfig(): void {
    this.formData.set({
      name: '',
      base_url: '',
      auth_type: 'bearer',
      auth_token: '',
      auth_username: '',
      auth_password: '',
      api_key_header: '',
      api_key_value: '',
    });
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
    try {
      await this.serverConfigService.saveConfig(data);
      this.editing.set(false);
      this.notify.success('Server configuration saved');
    } catch (e: any) {
      this.notify.error('Failed to save: ' + e);
    }
  }

  async deleteConfig(id: string): Promise<void> {
    try {
      await this.serverConfigService.deleteConfig(id);
      this.notify.success('Configuration deleted');
    } catch (e: any) {
      this.notify.error('Failed to delete: ' + e);
    }
  }

  async testConnection(): Promise<void> {
    const data = this.formData();
    if (!data.base_url) {
      this.notify.error('Base URL is required to test connection');
      return;
    }
    this.testing.set(true);
    this.connectionResult.set(null);
    try {
      // Save first if not saved yet
      let config: ServerConfig;
      if (!data.id) {
        config = await this.serverConfigService.saveConfig(data);
        this.formData.update(f => ({ ...f, id: config.id }));
      } else {
        config = await this.serverConfigService.saveConfig(data);
      }
      const result = await this.tauri.testConnection(config.id);
      this.connectionResult.set(result);
      if (result.success) {
        this.notify.success(`Connection successful (${result.duration_ms}ms)`);
      } else {
        this.notify.error(`Connection failed: ${result.error || 'Unknown error'}`);
      }
    } catch (e: any) {
      this.notify.error('Connection test failed: ' + e);
    } finally {
      this.testing.set(false);
    }
  }

  selectConfig(id: string): void {
    this.serverConfigService.selectConfig(id);
    this.notify.info('Server profile selected');
  }

  updateFormField(field: string, value: any): void {
    this.formData.update(f => ({ ...f, [field]: value }));
  }
}
