// MDA's snackbar: a short green (done) or red (error) message at the bottom of the screen.
// Kept outside the screens so it survives a page change (e.g. "saved" shown after going back).

import { useSyncExternalStore } from 'react';

type Toast = { text: string; kind: 'ok' | 'error'; id: number };

let current: Toast | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Shows a message; MDA keeps success messages up for about 3 seconds. */
export function toast(text: string, kind: Toast['kind'] = 'ok', ms = 3000) {
  current = { text, kind, id: Date.now() };
  clearTimeout(timer);
  timer = setTimeout(() => {
    current = null;
    emit();
  }, ms);
  emit();
}

export function Toaster() {
  const t = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
  );
  if (!t) return null;
  return (
    <div
      key={t.id}
      role={t.kind === 'error' ? 'alert' : 'status'}
      className={`fixed bottom-24 right-12 z-50 max-w-[460px] border px-[18px] py-3.5 text-sm print:hidden ${
        t.kind === 'error'
          ? 'border-destructive bg-destructive-bg text-destructive'
          : 'border-primary-text bg-accent text-primary-text'
      }`}
    >
      {t.text}
    </div>
  );
}
