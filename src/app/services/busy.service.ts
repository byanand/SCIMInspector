import { Injectable, computed, signal } from '@angular/core';

/**
 * Human-readable labels for the global busy bar. The design names the specific
 * work in flight rather than showing a bare spinner, so the bar says
 * "Fetching schemas from /Schemas…" instead of "Loading…".
 */
export const BUSY_LABELS: Record<string, string> = {
  send: 'Sending request…',
  generate: 'Generating sample data…',
  format: 'Formatting JSON…',
  save: 'Saving server profile…',
  compare: 'Comparing selected runs…',
  checkUpdate: 'Checking GitHub for a newer release…',
  testKey: 'Verifying OpenAI API key…',
  clearData: 'Clearing local database…',
  validation: 'Running validation…',
  loadtest: 'Starting load test…',
  discover: 'Fetching schemas from /Schemas…',
  export: 'Building export…',
  seed: 'Seeding default templates…',
  schemas: 'Loading schemas…',
  connect: 'Testing connection…',
};

export const BLOCKED_TITLE = 'Waiting for the current operation to finish';

/**
 * The app-wide single-flight contract.
 *
 * One long-running operation at a time. While one runs, every other trigger
 * reads as disabled rather than going silently inert — the design is explicit
 * that a blocked control shows 42% opacity and explains itself on hover.
 */
@Injectable({ providedIn: 'root' })
export class BusyService {
  private readonly key = signal<string | null>(null);

  readonly activeKey = this.key.asReadonly();
  readonly busy = computed(() => this.key() !== null);
  readonly label = computed(() => {
    const k = this.key();
    return k ? (BUSY_LABELS[k] ?? 'Working…') : '';
  });

  /** True while `key` itself is the operation in flight. */
  isBusy(key: string): boolean {
    return this.key() === key;
  }

  /** True while some *other* operation holds the lock. */
  isBlocked(key: string): boolean {
    const active = this.key();
    return active !== null && active !== key;
  }

  /** Opacity for a control, per the design's `ctl()` helper. */
  opacity(key: string): number {
    if (this.isBusy(key)) return 0.78;
    return this.isBlocked(key) ? 0.42 : 1;
  }

  cursor(key: string): string {
    return this.isBusy(key) || this.isBlocked(key) ? 'default' : 'pointer';
  }

  title(key: string): string {
    return this.isBlocked(key) ? BLOCKED_TITLE : '';
  }

  /**
   * Runs `fn` under the lock. Returns undefined without invoking `fn` when
   * another operation is already in flight, so callers can stay fire-and-forget.
   */
  async run<T>(key: string, fn: () => Promise<T>): Promise<T | undefined> {
    if (this.busy()) return undefined;
    this.key.set(key);
    try {
      return await fn();
    } finally {
      this.key.set(null);
    }
  }
}
