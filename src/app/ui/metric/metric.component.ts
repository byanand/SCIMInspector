import { Component, ChangeDetectionStrategy, input } from '@angular/core';

/**
 * A single figure with its label, unit and a line of context beneath —
 * the dashboard stat card and the validation score strip.
 *
 * Values are tabular so digits do not reflow while a run updates them.
 */
@Component({
  selector: 'app-metric',
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <div class="eyebrow">{{ label() }}</div>
    <div class="figure">
      <span class="value tnum" [style.color]="color() || null">{{ value() }}</span>
      @if (unit()) {
        <span class="unit">{{ unit() }}</span>
      }
    </div>
    @if (note()) {
      <div class="note">{{ note() }}</div>
    }
  `,
  styles: [
    `
      :host {
        display: block;
        border: 1px solid var(--line);
        border-radius: var(--radius);
        background: var(--panel);
        padding: 14px 16px;
      }

      :host(.bare) {
        border: none;
        border-radius: 0;
        background: transparent;
        padding: 16px 20px;
      }

      .eyebrow {
        font-size: 10.5px;
        letter-spacing: 0.07em;
        margin-bottom: 9px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .figure {
        display: flex;
        align-items: baseline;
        gap: 6px;
      }

      .value {
        font-size: 27px;
        font-weight: 600;
        letter-spacing: -0.025em;
      }

      :host(.sm) .value {
        font-size: 21px;
        letter-spacing: -0.02em;
      }

      .unit {
        font-size: 11.5px;
        color: var(--ink-3);
      }

      .note {
        font-size: 11.5px;
        color: var(--ink-2);
        margin-top: 5px;
      }
    `,
  ],
})
export class MetricComponent {
  readonly label = input('');
  readonly value = input<string | number>('');
  readonly unit = input('');
  readonly note = input('');
  /** A token reference, e.g. `var(--fail)`, when the figure itself carries tone. */
  readonly color = input('');
}
