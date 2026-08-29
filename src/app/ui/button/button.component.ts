import { Component, ChangeDetectionStrategy, computed, inject, input, output } from '@angular/core';
import { BusyService, BLOCKED_TITLE } from '../../services/busy.service';

export type ButtonKind = 'primary' | 'default' | 'danger';

/**
 * The application button.
 *
 * Beyond the visual spec it implements the design's single-flight contract: a
 * button given a `busyKey` shows a spinner and its progressive label while its
 * own work runs, and dims to 42% with an explanation while any *other*
 * operation holds the lock.
 */
@Component({
  selector: 'app-button',
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <button
      type="button"
      [class]="'btn ' + kind()"
      [disabled]="disabled() || busy() || blocked()"
      [attr.title]="title() || null"
      [style.opacity]="opacity()"
      (click)="press.emit()">
      @if (busy()) {
        <span class="spin" aria-hidden="true"></span>
        <span>{{ busyLabel() }}</span>
      } @else {
        @if (icon()) {
          <span class="ms" aria-hidden="true">{{ icon() }}</span>
        }
        <ng-content />
      }
    </button>
  `,
  styleUrl: './button.component.scss',
})
export class ButtonComponent {
  private readonly busyService = inject(BusyService);

  readonly kind = input<ButtonKind>('default');
  readonly icon = input('');
  readonly disabled = input(false);
  /** Ties this button to a BusyService operation. Omit for instant actions. */
  readonly busyKey = input('');
  readonly busyLabel = input('Working…');

  readonly press = output<void>();

  readonly busy = computed(() => !!this.busyKey() && this.busyService.isBusy(this.busyKey()));
  readonly blocked = computed(() => !!this.busyKey() && this.busyService.isBlocked(this.busyKey()));

  readonly opacity = computed(() => {
    if (this.busy()) return 0.72;
    if (this.blocked() || this.disabled()) return 0.42;
    return 1;
  });

  readonly title = computed(() => (this.blocked() ? BLOCKED_TITLE : ''));
}
