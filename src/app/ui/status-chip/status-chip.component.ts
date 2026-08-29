import { Component, ChangeDetectionStrategy, computed, input } from '@angular/core';

export type Tone = 'pass' | 'warn' | 'fail' | 'neutral';

/**
 * Small status pill — run status, response codes, schema kind.
 *
 * Given `code`, it derives the tone the way the design does: 2xx passes,
 * 3xx/4xx warn, 5xx fails. A 404 is an answer the server gave, not a system
 * failure, so it does not read red.
 */
@Component({
  selector: 'app-status-chip',
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `<span [class]="cls()"><ng-content /></span>`,
  styles: [
    `
      :host {
        display: inline-flex;
        flex-shrink: 0;
      }

      span {
        font-size: 10.5px;
        font-weight: 600;
        padding: 2px 7px;
        border-radius: 3px;
        white-space: nowrap;
        background: var(--sbg);
        color: var(--sfg);
      }

      .neutral {
        background: var(--panel-2);
        color: var(--ink-2);
        border: 1px solid var(--line);
      }
    `,
  ],
})
export class StatusChipComponent {
  readonly tone = input<Tone>('neutral');
  /** HTTP status. When set, it decides the tone and `tone` is ignored. */
  readonly code = input<number | null>(null);

  protected readonly cls = computed(() => {
    const code = this.code();
    if (code === null) {
      return this.tone() === 'neutral' ? 'neutral' : `s-${this.tone()}`;
    }
    if (code < 300) return 's-pass';
    return code < 500 ? 's-warn' : 's-fail';
  });
}
