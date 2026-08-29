import { Injectable, signal } from '@angular/core';

export type ThemeMode = 'light' | 'dark';
export type AccentName = 'signal-blue' | 'slate-teal' | 'ink-violet' | 'graphite';
export type Density = 'comfortable' | 'compact';

export const ACCENTS: { id: AccentName; label: string }[] = [
  { id: 'signal-blue', label: 'Signal blue' },
  { id: 'slate-teal', label: 'Slate teal' },
  { id: 'ink-violet', label: 'Ink violet' },
  { id: 'graphite', label: 'Graphite' },
];

const KEY_THEME = 'scim-inspector-theme';
const KEY_ACCENT = 'scim-inspector-accent';
const KEY_DENSITY = 'scim-inspector-density';

/**
 * Owns the three appearance axes the redesign exposes as live props: theme,
 * accent hue and density. Each is a body class that re-points the CSS custom
 * properties in app/styles/_tokens.scss — no component reads these directly.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private isDark = signal(false);
  private accentName = signal<AccentName>('signal-blue');
  private densityName = signal<Density>('comfortable');

  readonly darkMode = this.isDark.asReadonly();
  readonly accent = this.accentName.asReadonly();
  readonly density = this.densityName.asReadonly();

  constructor() {
    if (localStorage.getItem(KEY_THEME) === 'dark') {
      this.isDark.set(true);
    }

    const savedAccent = localStorage.getItem(KEY_ACCENT) as AccentName | null;
    if (savedAccent && ACCENTS.some((a) => a.id === savedAccent)) {
      this.accentName.set(savedAccent);
    }

    if (localStorage.getItem(KEY_DENSITY) === 'compact') {
      this.densityName.set('compact');
    }

    this.apply();
  }

  toggle(): void {
    this.setTheme(this.isDark() ? 'light' : 'dark');
  }

  setTheme(mode: ThemeMode): void {
    this.isDark.set(mode === 'dark');
    localStorage.setItem(KEY_THEME, mode);
    this.apply();
  }

  setAccent(accent: AccentName): void {
    this.accentName.set(accent);
    localStorage.setItem(KEY_ACCENT, accent);
    this.apply();
  }

  setDensity(density: Density): void {
    this.densityName.set(density);
    localStorage.setItem(KEY_DENSITY, density);
    this.apply();
  }

  private apply(): void {
    const body = document.body;
    body.classList.toggle('dark-theme', this.isDark());

    for (const a of ACCENTS) {
      body.classList.toggle(`accent-${a.id}`, a.id === this.accentName());
    }

    body.classList.toggle('density-compact', this.densityName() === 'compact');
  }
}
