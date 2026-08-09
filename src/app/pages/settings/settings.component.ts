import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatDividerModule } from '@angular/material/divider';
import { MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ThemeService } from '../../services/theme.service';
import { TauriService } from '../../services/tauri.service';
import { NotificationService } from '../../services/notification.service';
import { UpdateService } from '../../services/update.service';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatCardModule, MatButtonModule, MatIconModule,
    MatSlideToggleModule, MatDividerModule, MatDialogModule,
    MatFormFieldModule, MatInputModule, MatProgressSpinnerModule
  ],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss'
})
export class SettingsComponent implements OnInit {
  themeService = inject(ThemeService);
  updateService = inject(UpdateService);
  private tauriService = inject(TauriService);
  private notificationService = inject(NotificationService);

  confirmingClear = signal(false);

  // Updates
  appVersion = signal('');
  updateCheckEnabled = signal(true);

  // OpenAI settings
  openaiKey = signal('');
  openaiKeyMasked = signal('');
  openaiKeyConfigured = signal(false);
  showOpenaiKey = signal(false);
  savingKey = signal(false);
  testingKey = signal(false);

  async ngOnInit() {
    await this.loadOpenAiKey();
    await this.loadUpdateSettings();
  }

  private async loadUpdateSettings() {
    try {
      this.appVersion.set(await this.tauriService.getAppVersion());
      this.updateCheckEnabled.set(await this.updateService.isEnabled());
    } catch { /* ignore */ }
  }

  async toggleUpdateCheck(enabled: boolean) {
    this.updateCheckEnabled.set(enabled);
    try {
      await this.updateService.setEnabled(enabled);
    } catch (err: any) {
      // Roll the switch back so it reflects what was actually persisted.
      this.updateCheckEnabled.set(!enabled);
      this.notificationService.error('Failed to save setting: ' + (err?.message || err));
    }
  }

  private async loadOpenAiKey() {
    try {
      const key = await this.tauriService.getAppSetting('openai_api_key');
      if (key) {
        this.openaiKeyConfigured.set(true);
        this.openaiKeyMasked.set(this.maskKey(key));
        this.openaiKey.set(key);
      }
    } catch { /* ignore */ }
  }

  private maskKey(key: string): string {
    if (key.length <= 8) return '****';
    return key.substring(0, 4) + '****' + key.substring(key.length - 4);
  }

  async saveOpenAiKey() {
    const key = this.openaiKey().trim();
    if (!key) {
      this.notificationService.error('Please enter an API key.');
      return;
    }
    this.savingKey.set(true);
    try {
      await this.tauriService.saveAppSetting('openai_api_key', key);
      this.openaiKeyConfigured.set(true);
      this.openaiKeyMasked.set(this.maskKey(key));
      this.showOpenaiKey.set(false);
      this.notificationService.success('OpenAI API key saved.');
    } catch (err: any) {
      this.notificationService.error('Failed to save key: ' + (err?.message || err));
    } finally {
      this.savingKey.set(false);
    }
  }

  async testOpenAiKey() {
    this.testingKey.set(true);
    try {
      const result = await this.tauriService.generateScimData('test');
      const parsed = JSON.parse(result);
      if (parsed.status === 'ok') {
        this.notificationService.success('OpenAI connection successful!');
      } else {
        this.notificationService.success('OpenAI responded successfully.');
      }
    } catch (err: any) {
      this.notificationService.error('Test failed: ' + (err?.message || err));
    } finally {
      this.testingKey.set(false);
    }
  }

  async removeOpenAiKey() {
    try {
      await this.tauriService.deleteAppSetting('openai_api_key');
      this.openaiKey.set('');
      this.openaiKeyMasked.set('');
      this.openaiKeyConfigured.set(false);
      this.showOpenaiKey.set(false);
      this.notificationService.success('OpenAI API key removed.');
    } catch (err: any) {
      this.notificationService.error('Failed to remove key: ' + (err?.message || err));
    }
  }

  async clearAllData() {
    if (!this.confirmingClear()) {
      this.confirmingClear.set(true);
      return;
    }

    try {
      await this.tauriService.clearAllData();
      this.notificationService.success('All data cleared successfully.');
      this.confirmingClear.set(false);
    } catch (err: any) {
      this.notificationService.error('Failed to clear data: ' + (err?.message || err));
    }
  }

  cancelClear() {
    this.confirmingClear.set(false);
  }
}
