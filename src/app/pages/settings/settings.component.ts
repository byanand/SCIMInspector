import { Component, inject, signal, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ThemeService, ACCENTS, AccentName, Density } from '../../services/theme.service';
import { TauriService } from '../../services/tauri.service';
import { NotificationService } from '../../services/notification.service';
import { UpdateService } from '../../services/update.service';
import { BusyService } from '../../services/busy.service';
import { UI, BrandMarkComponent } from '../../ui';

@Component({
  selector: 'app-settings',
  imports: [FormsModule, MatTooltipModule, BrandMarkComponent, ...UI],
  templateUrl: './settings.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './settings.component.scss',
})
export class SettingsComponent implements OnInit {
  readonly themeService = inject(ThemeService);
  readonly updateService = inject(UpdateService);
  readonly busy = inject(BusyService);
  private readonly tauri = inject(TauriService);
  private readonly notify = inject(NotificationService);

  readonly accents = ACCENTS;

  readonly confirmingClear = signal(false);
  readonly appVersion = signal('');
  readonly updateCheckEnabled = signal(true);

  readonly openaiKey = signal('');
  readonly openaiKeyMasked = signal('');
  readonly openaiKeyConfigured = signal(false);
  readonly showOpenaiKey = signal(false);

  async ngOnInit(): Promise<void> {
    await this.loadOpenAiKey();
    await this.loadUpdateSettings();
  }

  // ── Appearance ─────────────────────────────────────────────────────────────
  setTheme(dark: boolean): void {
    this.themeService.setTheme(dark ? 'dark' : 'light');
  }

  setAccent(accent: AccentName): void {
    this.themeService.setAccent(accent);
  }

  setDensity(compact: boolean): void {
    this.themeService.setDensity(compact ? 'compact' : 'comfortable');
  }

  densityLabel(d: Density): string {
    return d === 'compact' ? 'Compact' : 'Comfortable';
  }

  // ── Updates ────────────────────────────────────────────────────────────────
  private async loadUpdateSettings(): Promise<void> {
    try {
      this.appVersion.set(await this.tauri.getAppVersion());
      this.updateCheckEnabled.set(await this.updateService.isEnabled());
    } catch {
      // Version and update preference are informational; failing to read them
      // must not block the rest of the screen.
    }
  }

  async toggleUpdateCheck(enabled: boolean): Promise<void> {
    this.updateCheckEnabled.set(enabled);
    try {
      await this.updateService.setEnabled(enabled);
    } catch (err) {
      // Roll the switch back so it reflects what was actually persisted.
      this.updateCheckEnabled.set(!enabled);
      this.notify.error('Failed to save setting: ' + this.message(err));
    }
  }

  async checkForUpdate(): Promise<void> {
    await this.busy.run('checkUpdate', async () => {
      try {
        const info = await this.tauri.checkForUpdate();
        if (info.update_available) {
          this.notify.info(`Version ${info.latest_version} is available.`);
        } else {
          this.notify.success('You are on the latest version.');
        }
      } catch (err) {
        this.notify.error('Update check failed: ' + this.message(err));
      }
    });
  }

  // ── OpenAI ─────────────────────────────────────────────────────────────────
  private async loadOpenAiKey(): Promise<void> {
    try {
      const key = await this.tauri.getAppSetting('openai_api_key');
      if (key) {
        this.openaiKeyConfigured.set(true);
        this.openaiKeyMasked.set(this.maskKey(key));
        this.openaiKey.set(key);
      }
    } catch {
      // No stored key is the normal first-run state.
    }
  }

  private maskKey(key: string): string {
    return key.length <= 8 ? '****' : `${key.slice(0, 4)}****${key.slice(-4)}`;
  }

  async saveOpenAiKey(): Promise<void> {
    const key = this.openaiKey().trim();
    if (!key) {
      this.notify.error('Please enter an API key.');
      return;
    }

    try {
      await this.tauri.saveAppSetting('openai_api_key', key);
      this.openaiKeyConfigured.set(true);
      this.openaiKeyMasked.set(this.maskKey(key));
      this.showOpenaiKey.set(false);
      this.notify.success('OpenAI API key saved.');
    } catch (err) {
      this.notify.error('Failed to save key: ' + this.message(err));
    }
  }

  async testOpenAiKey(): Promise<void> {
    await this.busy.run('testKey', async () => {
      try {
        await this.tauri.generateScimData('test');
        this.notify.success('OpenAI responded successfully.');
      } catch (err) {
        this.notify.error('Test failed: ' + this.message(err));
      }
    });
  }

  async removeOpenAiKey(): Promise<void> {
    try {
      await this.tauri.deleteAppSetting('openai_api_key');
      this.openaiKey.set('');
      this.openaiKeyMasked.set('');
      this.openaiKeyConfigured.set(false);
      this.showOpenaiKey.set(false);
      this.notify.success('OpenAI API key removed.');
    } catch (err) {
      this.notify.error('Failed to remove key: ' + this.message(err));
    }
  }

  // ── Local data ─────────────────────────────────────────────────────────────
  /** Two-step: the first press arms the confirmation, the second performs it. */
  async clearAllData(): Promise<void> {
    if (!this.confirmingClear()) {
      this.confirmingClear.set(true);
      return;
    }

    await this.busy.run('clearData', async () => {
      try {
        await this.tauri.clearAllData();
        this.notify.success('All data cleared successfully.');
        this.confirmingClear.set(false);
      } catch (err) {
        this.notify.error('Failed to clear data: ' + this.message(err));
      }
    });
  }

  cancelClear(): void {
    this.confirmingClear.set(false);
  }

  private message(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
  }
}
