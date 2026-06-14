import { Component, OnInit, effect, inject, signal } from '@angular/core';
import { Router, NavigationEnd, RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { BreakpointObserver } from '@angular/cdk/layout';
import { filter } from 'rxjs/operators';
import { FormsModule } from '@angular/forms';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ThemeService } from './services/theme.service';
import { ServerConfigService } from './services/server-config.service';
import { ScimSchemaService } from './services/scim-schema.service';

@Component({
  selector: 'app-root',
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    FormsModule,
    MatSidenavModule,
    MatToolbarModule,
    MatListModule,
    MatIconModule,
    MatButtonModule,
    MatTooltipModule,
    MatSelectModule,
    MatFormFieldModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App implements OnInit {
  navItems = [
    { path: '/dashboard', icon: 'dashboard', label: 'Dashboard' },
    { path: '/server-config', icon: 'dns', label: 'Server Config' },
    { path: '/explorer', icon: 'send', label: 'Explorer' },
    { path: '/field-mapping', icon: 'account_tree', label: 'Field Mapping' },
    { path: '/sample-data', icon: 'dataset', label: 'Sample Data' },
    { path: '/validation', icon: 'verified', label: 'Validation' },
    { path: '/load-test', icon: 'speed', label: 'Load Test' },
    { path: '/reports', icon: 'assessment', label: 'Reports' },
    { path: '/settings', icon: 'settings', label: 'Settings' },
  ];

  scimSchemaService = inject(ScimSchemaService);
  private router = inject(Router);
  private breakpoints = inject(BreakpointObserver);
  currentPageTitle = signal('Dashboard');

  // Below this width the sidenav becomes an overlay drawer toggled by the
  // toolbar hamburger; at or above it the drawer is a permanent side panel.
  isNarrow = signal(false);
  sidenavOpened = signal(true);

  constructor(
    public themeService: ThemeService,
    public serverConfigService: ServerConfigService
  ) {
    // Collapse the sidenav into an overlay on small viewports.
    this.breakpoints.observe('(max-width: 960px)').subscribe((state) => {
      this.isNarrow.set(state.matches);
      this.sidenavOpened.set(!state.matches);
    });

    // Track the active route to set the toolbar page title
    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe((e) => {
        const path = '/' + e.urlAfterRedirects.split('/').filter(Boolean)[0];
        const nav = this.navItems.find((n) => n.path === path);
        this.currentPageTitle.set(nav?.label ?? '');
      });

    // Auto-fetch schemas when the selected server changes
    effect(() => {
      const config = this.serverConfigService.selectedConfig();
      if (config) {
        this.scimSchemaService.fetchSchemas(config.id);
      } else {
        this.scimSchemaService.reset();
      }
    });
  }

  ngOnInit(): void {
    this.serverConfigService.loadConfigs();
  }

  toggleTheme(): void {
    this.themeService.toggle();
  }

  toggleSidenav(): void {
    this.sidenavOpened.update((v) => !v);
  }

  // Close the overlay drawer after navigating on small viewports.
  onNavClick(): void {
    if (this.isNarrow()) {
      this.sidenavOpened.set(false);
    }
  }

  onServerChange(id: string): void {
    this.serverConfigService.selectConfig(id);
  }

  refreshSchemas(): void {
    this.scimSchemaService.refreshSchemas();
  }
}
