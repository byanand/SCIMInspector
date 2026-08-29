import { Directive, OnDestroy, OnInit, TemplateRef, inject } from '@angular/core';
import { PageHeaderService } from '../services/page-header.service';

/**
 * Marks an `<ng-template>` as the page's header actions.
 *
 *   <ng-template appPageActions>
 *     <app-button icon="play_arrow" kind="primary" (press)="run()">Run validation</app-button>
 *   </ng-template>
 *
 * Registers on init and releases on destroy, so navigating away cannot leave a
 * previous page's buttons stranded in the header.
 */
@Directive({
  selector: '[appPageActions]',
})
export class PageActionsDirective implements OnInit, OnDestroy {
  private readonly tpl = inject(TemplateRef<unknown>);
  private readonly header = inject(PageHeaderService);

  ngOnInit(): void {
    this.header.setActions(this.tpl);
  }

  ngOnDestroy(): void {
    this.header.clearActions(this.tpl);
  }
}
