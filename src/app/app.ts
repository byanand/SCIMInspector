import { Component, OnInit, computed, effect, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { Router, NavigationEnd, RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { NgTemplateOutlet } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs/operators';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatMenuModule } from '@angular/material/menu';
import { ThemeService } from './services/theme.service';
import { ServerConfigService } from './services/server-config.service';
import { ScimSchemaService } from './services/scim-schema.service';
import { UpdateService } from './services/update.service';
import { BusyService } from './services/busy.service';
import { PageHeaderService } from './services/page-header.service';
import { NavCountsService } from './services/nav-counts.service';
import { BrandMarkComponent } from './ui/brand-mark/brand-mark.component';
import { SetupChecklistComponent } from './ui/setup-checklist/setup-checklist.component';
import { NAV_GROUPS, NAV_FLAT, PAGES, GATED_ROUTES, SETUP_BLURBS, NavItem } from './app.nav';

const NAV_COLLAPSED_KEY = 'scim-inspector-nav-collapsed';

@Component({
  selector: 'app-root',
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    NgTemplateOutlet,
    MatTooltipModule,
    MatMenuModule,
    BrandMarkComponent,
    SetupChecklistComponent,
  ],
  templateUrl: './app.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './app.scss',
})
export class App implements OnInit {
  readonly navGroups = NAV_GROUPS;
  readonly navFlat = NAV_FLAT;

  readonly themeService = inject(ThemeService);
  readonly serverConfigService = inject(ServerConfigService);
  readonly scimSchemaService = inject(ScimSchemaService);
  readonly busy = inject(BusyService);
  readonly pageHeader = inject(PageHeaderService);
  readonly counts = inject(NavCountsService);

  private readonly updateService = inject(UpdateService);
  private readonly router = inject(Router);

  /** Current top-level route, e.g. '/explorer'. */
  private readonly activePath = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => '/' + (e.urlAfterRedirects.split('/').filter(Boolean)[0] ?? 'dashboard'))
    ),
    { initialValue: '/dashboard' }
  );

  readonly navCollapsed = signal(localStorage.getItem(NAV_COLLAPSED_KEY) === '1');

  /**
   * A gated screen with no saved profile shows the setup checklist rather than
   * an empty form the user cannot act on.
   */
  readonly showSetup = computed(
    () =>
      this.serverConfigService.serverConfigs().length === 0 &&
      GATED_ROUTES.has(this.activePath())
  );

  readonly setupBlurb = computed(() => SETUP_BLURBS[this.activePath()] ?? '');

  readonly pageTitle = computed(
    () => this.pageHeader.title() ?? PAGES[this.activePath()]?.title ?? ''
  );

  readonly pageBlurb = computed(
    () => this.pageHeader.blurb() ?? PAGES[this.activePath()]?.blurb ?? ''
  );

  constructor() {
    // Auto-fetch schemas when the selected server changes.
    effect(() => {
      const config = this.serverConfigService.selectedConfig();
      if (config) {
        void this.scimSchemaService.fetchSchemas(config.id);
      } else {
        this.scimSchemaService.reset();
      }
    });

    // A drill-in heading belongs to the view that set it, not to the next one.
    effect(() => {
      this.activePath();
      this.pageHeader.setHeading(null, null);
    });
  }

  ngOnInit(): void {
    void this.serverConfigService.loadConfigs();
    void this.counts.refreshRuns();
    // Fire-and-forget: throttled internally and silent on failure.
    void this.updateService.checkOnStartup();
  }

  badgeFor(badge: NavItem['badge']): number | null {
    if (!badge) return null;
    const value = {
      servers: this.counts.servers$(),
      rules: this.counts.rules(),
      samples: this.counts.samples(),
      runs: this.counts.runs(),
    }[badge];
    return value > 0 ? value : null;
  }

  toggleTheme(): void {
    this.themeService.toggle();
  }

  toggleNav(): void {
    this.navCollapsed.update((v) => !v);
    localStorage.setItem(NAV_COLLAPSED_KEY, this.navCollapsed() ? '1' : '0');
  }

  onServerChange(id: string): void {
    this.serverConfigService.selectConfig(id);
  }

  refreshSchemas(): void {
    void this.scimSchemaService.refreshSchemas();
  }
}
