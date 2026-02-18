import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private isDark = signal(false);
  readonly darkMode = this.isDark.asReadonly();

  constructor() {
    const saved = localStorage.getItem('scim-inspector-theme');
    if (saved === 'dark') {
      this.isDark.set(true);
      document.body.classList.add('dark-theme');
    }
  }

  toggle(): void {
    const newValue = !this.isDark();
    this.isDark.set(newValue);
    if (newValue) {
      document.body.classList.add('dark-theme');
      localStorage.setItem('scim-inspector-theme', 'dark');
    } else {
      document.body.classList.remove('dark-theme');
      localStorage.setItem('scim-inspector-theme', 'light');
    }
  }
}
