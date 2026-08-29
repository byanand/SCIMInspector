import { Component, ChangeDetectionStrategy, input, output } from '@angular/core';

/**
 * Checkbox — a 15px filled square with a Symbols check, as used by the
 * validation category list. Selected is a filled treatment, not a subtle one.
 */
@Component({
  selector: 'app-checkbox',
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <button
      type="button"
      class="row"
      role="checkbox"
      [attr.aria-checked]="checked()"
      [disabled]="disabled()"
      (click)="toggled.emit(!checked())">
      <span class="box" [class.on]="checked()" aria-hidden="true">
        @if (checked()) {
          <span class="ms">check</span>
        }
      </span>
      <span class="label"><ng-content /></span>
      @if (note()) {
        <span class="note mono">{{ note() }}</span>
      }
    </button>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .row {
        display: flex;
        align-items: center;
        gap: 9px;
        cursor: pointer;
        font-size: 12.5px;
        font-family: inherit;
        color: var(--ink);
        background: transparent;
        border: none;
        padding: 0;
        width: 100%;
        text-align: left;

        &:disabled {
          opacity: 0.42;
          cursor: default;
        }
      }

      .box {
        width: 15px;
        height: 15px;
        border-radius: 3px;
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        border: 1px solid var(--line-2);
        background: var(--panel);
        transition: background 0.15s ease;

        &.on {
          background: var(--accent);
          border-color: var(--accent);
          color: var(--accent-ink);
        }

        .ms {
          font-size: 13px;
        }
      }

      .label {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .note {
        margin-left: auto;
        font-size: 10.5px;
        color: var(--ink-3);
        flex-shrink: 0;
      }
    `,
  ],
})
export class CheckboxComponent {
  readonly checked = input(false);
  readonly disabled = input(false);
  /** Right-aligned count, e.g. the number of tests in a validation category. */
  readonly note = input('');

  readonly toggled = output<boolean>();
}
