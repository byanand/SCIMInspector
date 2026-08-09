import { Injectable, inject, signal } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { TauriService } from './tauri.service';
import { UpdateInfo } from '../models';

/** Persisted opt-out for the startup check. Absent means enabled. */
const ENABLED_KEY = 'update_check_enabled';
/** Timestamp (ms) of the last successful startup check. */
const LAST_CHECK_KEY = 'update_last_check';

/** Only check once a day so launching repeatedly doesn't hammer the API. */
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

/**
 * Delay before the startup check fires, so it never competes with the initial
 * config/schema load for the user's connection.
 */
const STARTUP_DELAY_MS = 4000;

@Injectable({ providedIn: 'root' })
export class UpdateService {
  private tauri = inject(TauriService);
  private snackBar = inject(MatSnackBar);

  /** Result of the most recent check, for the Settings page to display. */
  readonly latest = signal<UpdateInfo | null>(null);
  readonly checking = signal(false);

  async isEnabled(): Promise<boolean> {
    try {
      // Opt-out, not opt-in: unset means the check runs.
      return (await this.tauri.getAppSetting(ENABLED_KEY)) !== 'false';
    } catch {
      return true;
    }
  }

  async setEnabled(enabled: boolean): Promise<void> {
    await this.tauri.saveAppSetting(ENABLED_KEY, enabled ? 'true' : 'false');
  }

  /**
   * Check on launch, honouring the opt-out and the once-a-day throttle.
   * Failures are swallowed — a missing network on startup is not worth a
   * warning the user didn't ask for.
   */
  async checkOnStartup(): Promise<void> {
    if (!(await this.isEnabled())) return;
    if (!(await this.isDueForCheck())) return;

    setTimeout(async () => {
      try {
        const info = await this.tauri.checkForUpdate();
        this.latest.set(info);
        // Only recorded on success, so a failed check retries next launch.
        await this.tauri.saveAppSetting(LAST_CHECK_KEY, Date.now().toString());
        if (info.update_available) this.announce(info);
      } catch {
        // Offline, rate-limited, or running in the browser — stay silent.
      }
    }, STARTUP_DELAY_MS);
  }

  /** Check on demand from Settings. Reports both outcomes and failures. */
  async checkNow(): Promise<void> {
    this.checking.set(true);
    try {
      const info = await this.tauri.checkForUpdate();
      this.latest.set(info);
      await this.tauri.saveAppSetting(LAST_CHECK_KEY, Date.now().toString());
      if (info.update_available) {
        this.announce(info);
      } else {
        this.snackBar.open(`You're up to date (v${info.current_version}).`, 'OK', {
          duration: 3000,
        });
      }
    } catch (err: any) {
      this.snackBar.open('Update check failed: ' + (err?.message || err), 'Dismiss', {
        duration: 5000,
        panelClass: 'snackbar-error',
      });
    } finally {
      this.checking.set(false);
    }
  }

  async openReleasePage(url: string): Promise<void> {
    try {
      await this.tauri.openReleasePage(url);
    } catch (err: any) {
      this.snackBar.open('Could not open browser: ' + (err?.message || err), 'Dismiss', {
        duration: 5000,
        panelClass: 'snackbar-error',
      });
    }
  }

  private async isDueForCheck(): Promise<boolean> {
    try {
      const raw = await this.tauri.getAppSetting(LAST_CHECK_KEY);
      if (!raw) return true;
      const last = Number(raw);
      // A missing or corrupt timestamp shouldn't suppress the check forever.
      if (!Number.isFinite(last)) return true;
      return Date.now() - last >= CHECK_INTERVAL_MS;
    } catch {
      return true;
    }
  }

  private announce(info: UpdateInfo): void {
    this.snackBar
      .open(`Version ${info.latest_version} is available.`, 'Download', { duration: 10000 })
      .onAction()
      .subscribe(() => this.openReleasePage(info.release_url));
  }
}
