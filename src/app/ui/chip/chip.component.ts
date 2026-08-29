import { Component, ChangeDetectionStrategy, input, output } from '@angular/core';

/**
 * Toggleable chip — the Explorer's custom-field selector, and anywhere a small
 * set of options is picked inline. Mono by default, since chips here carry
 * SCIM attribute names.
 */
@Component({
  selector: 'app-chip',
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <button type="button" class="chip" [class.on]="selected()" (click)="toggled.emit(!selected())">
      @if (icon() || selectable()) {
        <span class="ms" aria-hidden="true">{{ icon() || (selected() ? 'check' : 'add') }}</span>
      }
      <ng-content />
    </button>
  `,
  styles: [
    `
      :host {
        display: inline-flex;
      }

      .chip {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        height: 25px;
        padding: 0 9px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 11.5px;
        font-family: 'Roboto Mono', monospace;
        border: 1px solid var(--line-2);
        background: transparent;
        color: var(--ink-2);
        white-space: nowrap;
        transition: background 0.15s ease;

        &:hover:not(.on) {
          background: var(--panel-2);
          color: var(--ink);
        }

        &.on {
          background: var(--accent);
          border-color: var(--accent);
          color: var(--accent-ink);
        }

        .ms {
          font-size: 14px;
        }
      }
    `,
  ],
})
export class ChipComponent {
  readonly selected = input(false);
  /** Fixed glyph. When omitted and `selectable`, the chip shows add/check. */
  readonly icon = input('');
  readonly selectable = input(true);

  readonly toggled = output<boolean>();
}
