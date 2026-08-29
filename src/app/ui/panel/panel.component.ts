import { Component, ChangeDetectionStrategy, input } from '@angular/core';

/**
 * The hairline surface that replaces mat-card throughout the redesign.
 *
 * Grouping without weight: 1px border, no shadow, no elevation. A `title`
 * renders the standard header bar; `[actions]` projects controls to its right.
 * `flush` drops the body padding for panels whose content is a list of rows
 * that must reach the panel edge.
 */
@Component({
  selector: 'app-panel',
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    @if (title() || eyebrow()) {
      <div class="head">
        @if (eyebrow()) {
          <span class="eyebrow">{{ eyebrow() }}</span>
        } @else {
          <span class="title">{{ title() }}</span>
        }
        @if (note()) {
          <span class="note">{{ note() }}</span>
        }
        <span class="actions"><ng-content select="[actions]" /></span>
      </div>
    }
    <div class="body" [class.flush]="flush()">
      <ng-content />
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        border: 1px solid var(--line);
        border-radius: var(--radius);
        background: var(--panel);
        overflow: hidden;
      }

      .head {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 12px 16px;
        border-bottom: 1px solid var(--line);
      }

      .title {
        font-size: 12.5px;
        font-weight: 600;
      }

      .note {
        font-size: 11.5px;
        color: var(--ink-3);
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .actions {
        margin-left: auto;
        display: flex;
        align-items: center;
        gap: 8px;
        flex-shrink: 0;
      }

      .body {
        padding: 14px 16px;

        &.flush {
          padding: 0;
        }
      }
    `,
  ],
})
export class PanelComponent {
  readonly title = input('');
  /** Uppercase micro-label, used where the panel heads a list rather than a card. */
  readonly eyebrow = input('');
  readonly note = input('');
  readonly flush = input(false);
}
