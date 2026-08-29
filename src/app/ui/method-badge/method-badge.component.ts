import { Component, ChangeDetectionStrategy, computed, input } from '@angular/core';

const KNOWN = new Set(['get', 'post', 'put', 'patch', 'delete']);

/**
 * HTTP verb badge. Colour comes from the per-method hue classes in
 * styles/_semantic.scss rather than from hexes typed in here.
 *
 * `bare` drops the fill for the Explorer's operation rail, where the verb is a
 * right-aligned mono label in a dense list and a filled chip would be noise.
 */
@Component({
  selector: 'app-method-badge',
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <span [class]="cls()" [class.bare]="bare()">{{ method().toUpperCase() }}</span>
  `,
  styles: [
    `
      :host {
        display: inline-flex;
        flex-shrink: 0;
      }

      span {
        font-family: 'Roboto Mono', monospace;
        font-size: 10.5px;
        font-weight: 700;
        letter-spacing: 0.05em;
        padding: 3px 8px;
        border-radius: 3px;
        background: var(--mbg);
        color: var(--mfg);
      }

      .bare {
        background: transparent;
        padding: 0;
        font-size: 9px;
        letter-spacing: 0.04em;
        width: 38px;
        text-align: right;
      }
    `,
  ],
})
export class MethodBadgeComponent {
  readonly method = input('GET');
  readonly bare = input(false);

  protected readonly cls = computed(() => {
    const m = this.method().toLowerCase();
    return KNOWN.has(m) ? `m-${m}` : 'm-unknown';
  });
}
