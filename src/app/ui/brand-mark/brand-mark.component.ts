import { Component, ChangeDetectionStrategy, input } from '@angular/core';

export type BrandMarkVariant = 'brackets' | 'nodes' | 'lens' | 'shipped';

/**
 * The application mark.
 *
 * `brackets` is the mark approved 28 Aug 2026 — two JSON brackets around a
 * single node: the payload, and the record being inspected inside it. It
 * supersedes the `SI` monogram, which stays available as `shipped` (the raster
 * in public/) until the installer icons are regenerated with `npx tauri icon`.
 */
@Component({
  selector: 'app-brand-mark',
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    @if (variant() === 'shipped') {
      <img
        src="app-icon-128.png"
        alt="SCIM Inspector"
        [width]="size()"
        [height]="size()"
        [style.border-radius.px]="6" />
    } @else {
      <span
        class="mark"
        [style.width.px]="size()"
        [style.height.px]="size()"
        [attr.aria-hidden]="true">
        <svg
          [attr.width]="glyph()"
          [attr.height]="glyph()"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round">
          @switch (variant()) {
            @case ('brackets') {
              <path d="M9.2 4.5H7.3A2.3 2.3 0 0 0 5 6.8v10.4a2.3 2.3 0 0 0 2.3 2.3h1.9" />
              <path d="M14.8 4.5h1.9A2.3 2.3 0 0 1 19 6.8v10.4a2.3 2.3 0 0 1-2.3 2.3h-1.9" />
              <circle cx="12" cy="12" r="2.4" />
            }
            @case ('nodes') {
              <circle cx="6.5" cy="6.5" r="2.4" />
              <circle cx="17.5" cy="17.5" r="2.4" />
              <path d="M11 6.5h4.2M6.5 11v4.2" />
              <path d="M13.3 4.6 15.4 6.5 13.3 8.4" />
              <path d="M4.6 13.3 6.5 15.4 8.4 13.3" />
            }
            @case ('lens') {
              <circle cx="10.8" cy="10.8" r="5.4" />
              <path d="M8.6 10.8h4.4M10.8 8.6v4.4" />
              <path d="M15 15l4.2 4.2" />
            }
          }
        </svg>
      </span>
    }
  `,
  styles: [
    `
      :host {
        display: inline-flex;
        flex-shrink: 0;
      }

      .mark {
        border-radius: 6px;
        background: var(--accent);
        color: var(--accent-ink);
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      }
    `,
  ],
})
export class BrandMarkComponent {
  readonly variant = input<BrandMarkVariant>('brackets');
  readonly size = input(24);

  /** The glyph sits at roughly two-thirds of the tile, as drawn in the design. */
  protected glyph = () => Math.round(this.size() * 0.67);
}
