import { Component, ChangeDetectionStrategy, input } from '@angular/core';

/**
 * Empty state. The design's rule is that it names the next action rather than
 * apologising — so the message is a fact plus a way forward, and the action
 * slot is projected rather than assumed.
 */
@Component({
  selector: 'app-empty-state',
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <span class="ms" aria-hidden="true">{{ icon() }}</span>
    <div class="title">{{ title() }}</div>
    @if (detail()) {
      <p class="detail">{{ detail() }}</p>
    }
    <div class="action"><ng-content /></div>
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
        padding: 44px 24px;
        gap: 2px;
      }

      .ms {
        font-size: 28px;
        color: var(--line-2);
        margin-bottom: 8px;
      }

      .title {
        font-size: 13px;
        font-weight: 600;
      }

      .detail {
        margin: 4px 0 0;
        font-size: 12px;
        color: var(--ink-2);
        max-width: 46ch;
        text-wrap: pretty;
      }

      .action:not(:empty) {
        margin-top: 14px;
      }
    `,
  ],
})
export class EmptyStateComponent {
  readonly icon = input('inbox');
  readonly title = input('');
  readonly detail = input('');
}
