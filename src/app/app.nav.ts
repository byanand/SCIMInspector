/**
 * Navigation and page-header content, transcribed from `PAGES` and
 * `NAV_GROUPED` in the redesign.
 *
 * The redesign renames three destinations in the UI without changing their
 * routes: Dashboard reads as "Overview", Server Config as "Servers", and the
 * two-word pages drop to sentence case ("Field mapping", "Load test").
 */

export interface NavItem {
  path: string;
  icon: string;
  label: string;
  /** Which live count to show on the right of the row, if any. */
  badge?: 'servers' | 'rules' | 'samples' | 'runs';
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export interface PageMeta {
  title: string;
  blurb: string;
}

export const PAGES: Record<string, PageMeta> = {
  '/dashboard': {
    title: 'Overview',
    blurb: 'Compliance and throughput for the active server, and where to look next.',
  },
  '/server-config': {
    title: 'Servers',
    blurb: 'Endpoints and credentials. The active profile drives every other screen.',
  },
  '/field-mapping': {
    title: 'Field mapping',
    blurb: 'Per-server rules checked during validation runs.',
  },
  '/sample-data': {
    title: 'Sample data',
    blurb: 'Reusable User and Group payload templates.',
  },
  '/explorer': {
    title: 'Explorer',
    blurb: 'Send any of the 16 SCIM operations and inspect the raw exchange.',
  },
  '/validation': {
    title: 'Validation',
    blurb: '10 compliance categories against the active server.',
  },
  '/load-test': {
    title: 'Load test',
    blurb: 'Concurrency, ramp-up and latency percentiles.',
  },
  '/reports': {
    title: 'Reports',
    blurb: 'Every stored run, with export and comparison.',
  },
  '/settings': {
    title: 'Settings',
    blurb: 'Appearance, AI integration, updates and local data.',
  },
};

export const NAV_GROUPS: NavGroup[] = [
  {
    label: '',
    items: [{ path: '/dashboard', icon: 'space_dashboard', label: 'Overview' }],
  },
  {
    label: 'Configure',
    items: [
      { path: '/server-config', icon: 'dns', label: 'Servers', badge: 'servers' },
      { path: '/field-mapping', icon: 'rule', label: 'Field mapping', badge: 'rules' },
      { path: '/sample-data', icon: 'data_object', label: 'Sample data', badge: 'samples' },
    ],
  },
  {
    label: 'Test',
    items: [
      { path: '/explorer', icon: 'north_east', label: 'Explorer' },
      { path: '/validation', icon: 'verified', label: 'Validation' },
      { path: '/load-test', icon: 'speed', label: 'Load test' },
    ],
  },
  {
    label: 'Results',
    items: [{ path: '/reports', icon: 'assessment', label: 'Reports', badge: 'runs' }],
  },
];

/** Flattened for the collapsed rail, which drops group labels but keeps the gaps. */
export const NAV_FLAT: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);

/**
 * Screens that need a saved server before they can do anything. Reaching one
 * without a profile shows the first-run setup checklist instead.
 */
export const GATED_ROUTES = new Set([
  '/explorer',
  '/validation',
  '/load-test',
  '/field-mapping',
  '/sample-data',
]);

export const SETUP_BLURBS: Record<string, string> = {
  '/explorer': 'Explorer sends requests against a saved SCIM endpoint. Add one to start.',
  '/validation': 'Validation runs its 10 compliance categories against a saved endpoint.',
  '/load-test': 'Load tests need an endpoint and credentials before they can start.',
  '/field-mapping': 'Field mapping rules are stored per server, so pick a server first.',
  '/sample-data': 'Sample data templates are stored per server, so pick a server first.',
};
