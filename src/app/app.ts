import { Component, OnInit } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ThemeService } from './services/theme.service';
import { ServerConfigService } from './services/server-config.service';

@Component({
  selector: 'app-root',
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    MatSidenavModule,
    MatToolbarModule,
    MatListModule,
    MatIconModule,
    MatButtonModule,
    MatTooltipModule,
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
    { path: '/validation', icon: 'verified', label: 'Validation' },
    { path: '/load-test', icon: 'speed', label: 'Load Test' },
    { path: '/reports', icon: 'assessment', label: 'Reports' },
    { path: '/settings', icon: 'settings', label: 'Settings' },
  ];

  constructor(
    public themeService: ThemeService,
    private serverConfigService: ServerConfigService
  ) {}

  ngOnInit(): void {
    this.serverConfigService.loadConfigs();
  }

  toggleTheme(): void {
    this.themeService.toggle();
  }
}
