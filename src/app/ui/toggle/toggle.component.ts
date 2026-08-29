import { Component, ChangeDetectionStrategy, input, output } from '@angular/core';

/**
 * Slide toggle, drawn as the design specifies: a 32×18 track whose knob is
 * positioned by flex justification rather than a transform.
 *
 * Pairs with an explanatory block for consequence-first warnings such as the
 * TLS switch, which states what turning it on disables.
 */
@Component({
  selector: 'app-toggle',
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <button
      type="button"
      class="track"
      role="switch"
      [attr.aria-checked]="checked()"
      [attr.aria-label]="label()"
      [class.on]="checked()"
      [disabled]="disabled()"
      (click)="toggled.emit(!checked())">
      <span class="knob"></span>
    </button>
  `,
  styles: [
    `
      :host {
        display: inline-flex;
        flex-shrink: 0;
      }

      .track {
        width: 32px;
        height: 18px;
        border-radius: 9px;
        flex-shrink: 0;
        background: var(--line-2);
        padding: 2px;
        display: flex;
        justify-content: flex-start;
        cursor: pointer;
        border: none;
        transition: background 0.15s ease;

        &.on {
          background: var(--accent);
          justify-content: flex-end;
        }

        &:disabled {
          opacity: 0.42;
          cursor: default;
        }
      }

      .knob {
        width: 14px;
        height: 14px;
        border-radius: 50%;
        background: var(--panel);
      }
    `,
  ],
})
export class ToggleComponent {
  readonly checked = input(false);
  readonly disabled = input(false);
  readonly label = input('');

  readonly toggled = output<boolean>();
}
