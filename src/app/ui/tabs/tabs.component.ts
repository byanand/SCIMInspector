import { Component, ChangeDetectionStrategy, input, output } from '@angular/core';

export interface TabDef {
  id: string;
  label: string;
}

/**
 * Two tab treatments from the design, sharing one API.
 *
 * `underline` heads a pane — the Explorer's Body / Headers / History.
 * `segment` is the inline switch that picks a view of the same data, as on
 * Validation's Triage / Audit / Compare.
 */
@Component({
  selector: 'app-tabs',
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <div [class]="'tabs ' + variant()" role="tablist">
      @for (tab of tabs(); track tab.id) {
        <button
          type="button"
          role="tab"
          class="tab"
          [class.on]="tab.id === active()"
          [attr.aria-selected]="tab.id === active()"
          (click)="selected.emit(tab.id)">
          {{ tab.label }}
        </button>
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .tabs {
        display: inline-flex;
      }

      .tab {
        cursor: pointer;
        font-family: inherit;
        border: none;
        background: transparent;
        white-space: nowrap;
      }

      // Underline — sits on a pane header, so it fills the width.
      .underline {
        display: flex;
        gap: 2px;

        .tab {
          padding: 9px 13px 8px;
          font-size: 11.5px;
          font-weight: 400;
          color: var(--ink-3);
          border-bottom: 2px solid transparent;

          &:hover {
            color: var(--ink-2);
          }

          &.on {
            font-weight: 600;
            color: var(--ink);
            border-bottom-color: var(--accent);
          }
        }
      }

      // Segment — a bordered group of pills.
      .segment {
        padding: 2px;
        border: 1px solid var(--line-2);
        border-radius: 6px;
        background: var(--panel-2);

        .tab {
          padding: 5px 13px;
          border-radius: 4px;
          font-size: 12px;
          font-weight: 400;
          color: var(--ink-2);

          &:hover:not(.on) {
            color: var(--ink);
          }

          &.on {
            font-weight: 600;
            background: var(--panel);
            color: var(--ink);
          }
        }
      }
    `,
  ],
})
export class TabsComponent {
  readonly tabs = input<TabDef[]>([]);
  readonly active = input('');
  readonly variant = input<'underline' | 'segment'>('underline');

  readonly selected = output<string>();
}
