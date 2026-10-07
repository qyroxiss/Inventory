// MDA's snackbar messages — green (done) or red (error) — shown as a popup in the middle of the
// screen over a dimmed page, so they can't be missed (owner, 2026-10-07). Errors stay until OK;
// done messages also close by themselves after about 3 seconds, as MDA's snackbar does.
// Kept outside the screens so it survives a page change (e.g. "saved" shown after going back).

import { useEffect, useRef, useSyncExternalStore } from 'react';

type Toast = { text: string; kind: 'ok' | 'error'; id: number };

let current: Toast | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
let afterClose: (() => void)[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function close() {
  clearTimeout(timer);
  current = null;
  emit();
}

/** Shows a message. Done messages close after `ms`; errors wait for OK. */
export function toast(text: string, kind: Toast['kind'] = 'ok', ms = 3000) {
  current = { text, kind, id: Date.now() };
  clearTimeout(timer);
  if (kind === 'ok') timer = setTimeout(close, ms);
  emit();
}

/** Runs `fn` once the message is closed (at once if none is showing) — for a screen moving the
 *  cursor to the field a message is about, which can't take focus while the popup is up. */
export function whenToastClosed(fn: () => void) {
  if (current) afterClose.push(fn);
  else fn();
}

export function Toaster() {
  const t = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
  );
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (t && !d.open) d.showModal();
    if (!t && d.open) {
      d.close();
      const queued = afterClose;
      afterClose = [];
      // After the dialog has handed focus back, so a queued focus wins.
      requestAnimationFrame(() => queued.forEach((f) => f()));
    }
  }, [t]);

  const error = t?.kind === 'error';
  return (
    <dialog
      ref={ref}
      role={error ? 'alertdialog' : 'dialog'}
      aria-label={error ? 'Error' : 'Message'}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      className={`m-auto w-[440px] max-w-[calc(100%-32px)] border-[1.5px] bg-card p-0 text-foreground backdrop:bg-black/50 print:hidden ${
        error ? 'border-destructive' : 'border-primary-text'
      }`}
    >
      {t && (
        <div key={t.id} className="flex flex-col gap-5 px-6 pb-5 pt-6">
          <div className="flex items-start gap-3.5">
            <span
              aria-hidden="true"
              className={`grid size-8 flex-none place-items-center rounded-full text-base font-bold ${
                error ? 'bg-destructive text-card' : 'bg-primary text-primary-foreground'
              }`}
            >
              {error ? '!' : '✓'}
            </span>
            <p
              role={error ? 'alert' : 'status'}
              className={`m-0 whitespace-pre-line pt-1 text-[15px] leading-[1.55] ${
                error ? 'text-destructive' : 'text-foreground'
              }`}
            >
              {t.text}
            </p>
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              autoFocus
              onClick={close}
              className={`flex h-11 min-w-[96px] cursor-pointer items-center justify-center px-5 text-[15px] font-semibold ${
                error ? 'bg-destructive text-card' : 'bg-primary text-primary-foreground'
              }`}
            >
              OK
            </button>
          </div>
        </div>
      )}
    </dialog>
  );
}
