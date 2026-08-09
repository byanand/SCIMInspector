import { vi, type Mock } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { UpdateService } from './update.service';
import { TauriService } from './tauri.service';
import { UpdateInfo } from '../models';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Must exceed STARTUP_DELAY_MS in the service. */
const PAST_STARTUP_DELAY = 5000;

function makeInfo(overrides: Partial<UpdateInfo> = {}): UpdateInfo {
  return {
    current_version: '0.2.2',
    latest_version: '0.3.0',
    update_available: true,
    release_url: 'https://github.com/byanand/SCIMInspector/releases/tag/v0.3.0',
    release_notes: '',
    published_at: '',
    ...overrides,
  };
}

describe('UpdateService', () => {
  let settings: Record<string, string>;
  let checkForUpdate: Mock<(...args: any[]) => any>;
  let snackBarOpen: Mock<(...args: any[]) => any>;
  let service: UpdateService;

  beforeEach(() => {
    settings = {};
    checkForUpdate = vi.fn().mockResolvedValue(makeInfo());
    snackBarOpen = vi.fn().mockReturnValue({ onAction: () => ({ subscribe: () => {} }) });

    const tauriStub = {
      getAppSetting: (key: string) => Promise.resolve(settings[key] ?? null),
      saveAppSetting: (key: string, value: string) => {
        settings[key] = value;
        return Promise.resolve();
      },
      checkForUpdate: () => checkForUpdate(),
      openReleasePage: () => Promise.resolve(),
    };

    TestBed.configureTestingModule({
      providers: [
        UpdateService,
        { provide: TauriService, useValue: tauriStub },
        { provide: MatSnackBar, useValue: { open: snackBarOpen } },
      ],
    });
    service = TestBed.inject(UpdateService);
  });

  describe('isEnabled', () => {
    it('defaults to enabled when never configured', async () => {
      expect(await service.isEnabled()).toBe(true);
    });

    it('honours an explicit opt-out', async () => {
      await service.setEnabled(false);
      expect(settings['update_check_enabled']).toBe('false');
      expect(await service.isEnabled()).toBe(false);
    });
  });

  describe('checkOnStartup', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('checks and records the timestamp on a first run', async () => {
      await service.checkOnStartup();
      await vi.advanceTimersByTimeAsync(PAST_STARTUP_DELAY);

      expect(checkForUpdate).toHaveBeenCalledTimes(1);
      expect(settings['update_last_check']).toBeDefined();
      expect(snackBarOpen).toHaveBeenCalled();
    });

    it('does not check when the user opted out', async () => {
      await service.setEnabled(false);
      await service.checkOnStartup();
      await vi.advanceTimersByTimeAsync(PAST_STARTUP_DELAY);

      expect(checkForUpdate).not.toHaveBeenCalled();
    });

    it('does not check again within the throttle window', async () => {
      settings['update_last_check'] = String(Date.now() - 1000);
      await service.checkOnStartup();
      await vi.advanceTimersByTimeAsync(PAST_STARTUP_DELAY);

      expect(checkForUpdate).not.toHaveBeenCalled();
    });

    it('checks again once the throttle window has elapsed', async () => {
      settings['update_last_check'] = String(Date.now() - DAY_MS - 1000);
      await service.checkOnStartup();
      await vi.advanceTimersByTimeAsync(PAST_STARTUP_DELAY);

      expect(checkForUpdate).toHaveBeenCalledTimes(1);
    });

    it('recovers from a corrupt timestamp instead of never checking again', async () => {
      settings['update_last_check'] = 'not-a-number';
      await service.checkOnStartup();
      await vi.advanceTimersByTimeAsync(PAST_STARTUP_DELAY);

      expect(checkForUpdate).toHaveBeenCalledTimes(1);
    });

    it('stays silent and retries next launch when the check fails', async () => {
      checkForUpdate.mockRejectedValue(new Error('offline'));
      await service.checkOnStartup();
      await vi.advanceTimersByTimeAsync(PAST_STARTUP_DELAY);

      // No timestamp written, so the next launch tries again.
      expect(settings['update_last_check']).toBeUndefined();
      expect(snackBarOpen).not.toHaveBeenCalled();
    });

    it('says nothing when already on the newest version', async () => {
      checkForUpdate.mockResolvedValue(
        makeInfo({ latest_version: '0.2.2', update_available: false })
      );
      await service.checkOnStartup();
      await vi.advanceTimersByTimeAsync(PAST_STARTUP_DELAY);

      expect(snackBarOpen).not.toHaveBeenCalled();
    });
  });

  describe('checkNow', () => {
    it('confirms when the app is up to date', async () => {
      checkForUpdate.mockResolvedValue(
        makeInfo({ latest_version: '0.2.2', update_available: false })
      );
      await service.checkNow();

      expect(snackBarOpen).toHaveBeenCalledWith(
        expect.stringContaining('up to date'),
        'OK',
        expect.anything()
      );
      expect(service.checking()).toBe(false);
    });

    it('surfaces failures and clears the spinner', async () => {
      checkForUpdate.mockRejectedValue(new Error('offline'));
      await service.checkNow();

      expect(snackBarOpen).toHaveBeenCalledWith(
        expect.stringContaining('offline'),
        'Dismiss',
        expect.anything()
      );
      expect(service.checking()).toBe(false);
    });
  });
});
