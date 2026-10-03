// Light / dark theme. The choice is kept per browser; until one is made, the computer's own
// setting is followed. Dark mode is the `.dark` class on <html>, read by packages/ui/src/styles.css.

import { useSyncExternalStore } from 'react';

export type Theme = 'light' | 'dark';

const KEY = 'qi-theme';
const listeners = new Set<() => void>();
/** The choice made on this page, used when the browser blocks storage. */
let chosen: Theme | null = null;

function stored(): Theme | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : chosen;
  } catch {
    return chosen;
  }
}

const current = (): Theme =>
  stored() ?? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

/** Applies the theme to the page. Called once before the first render to avoid a flash. */
export const applyTheme = () =>
  document.documentElement.classList.toggle('dark', current() === 'dark');

export function setTheme(theme: Theme) {
  chosen = theme;
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    // Storage blocked: the switch still works until the page is reloaded.
  }
  applyTheme();
  listeners.forEach((l) => l());
}

export function useTheme(): Theme {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => (document.documentElement.classList.contains('dark') ? 'dark' : 'light'),
  );
}
