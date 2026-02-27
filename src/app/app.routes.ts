import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
  {
    path: 'dashboard',
    loadComponent: () =>
      import('./pages/dashboard/dashboard.component').then(m => m.DashboardComponent),
  },
  {
    path: 'server-config',
    loadComponent: () =>
      import('./pages/server-config/server-config.component').then(m => m.ServerConfigComponent),
  },
  {
    path: 'explorer',
    loadComponent: () =>
      import('./pages/explorer/explorer.component').then(m => m.ExplorerComponent),
  },
  {
    path: 'field-mapping',
    loadComponent: () =>
      import('./pages/field-mapping/field-mapping.component').then(m => m.FieldMappingComponent),
  },
  {
    path: 'sample-data',
    loadComponent: () =>
      import('./pages/sample-data/sample-data.component').then(m => m.SampleDataComponent),
  },
  {
    path: 'validation',
    loadComponent: () =>
      import('./pages/validation/validation.component').then(m => m.ValidationComponent),
  },
  {
    path: 'load-test',
    loadComponent: () =>
      import('./pages/load-test/load-test.component').then(m => m.LoadTestComponent),
  },
  {
    path: 'reports',
    loadComponent: () =>
      import('./pages/reports/reports.component').then(m => m.ReportsComponent),
  },
  {
    path: 'settings',
    loadComponent: () =>
      import('./pages/settings/settings.component').then(m => m.SettingsComponent),
  },
];
