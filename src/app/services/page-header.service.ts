import { Injectable, TemplateRef, signal } from '@angular/core';

/**
 * Lets a routed page contribute buttons to the shell's page header.
 *
 * The redesign puts page actions in the fixed header beside the title, above
 * the scroll container — so they cannot live in the page template itself. A
 * page declares an `<ng-template>` of buttons and hands it over here; the shell
 * projects it. Pages that set actions must clear them on destroy, which
 * `PageActionsDirective` does automatically.
 */
@Injectable({ providedIn: 'root' })
export class PageHeaderService {
  private readonly actionsTpl = signal<TemplateRef<unknown> | null>(null);

  /** Overrides the route-derived title/blurb, for drill-in views like a run detail. */
  private readonly overrideTitle = signal<string | null>(null);
  private readonly overrideBlurb = signal<string | null>(null);

  readonly actions = this.actionsTpl.asReadonly();
  readonly title = this.overrideTitle.asReadonly();
  readonly blurb = this.overrideBlurb.asReadonly();

  setActions(tpl: TemplateRef<unknown> | null): void {
    this.actionsTpl.set(tpl);
  }

  clearActions(tpl: TemplateRef<unknown>): void {
    // Only clear if we still own the slot — guards against a destroy landing
    // after the next page has already claimed it.
    if (this.actionsTpl() === tpl) {
      this.actionsTpl.set(null);
    }
  }

  setHeading(title: string | null, blurb: string | null = null): void {
    this.overrideTitle.set(title);
    this.overrideBlurb.set(blurb);
  }
}
