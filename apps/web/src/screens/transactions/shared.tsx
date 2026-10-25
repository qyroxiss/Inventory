// Shared pieces of the Transactions screens (purchase_invoice_page.dart, sale_invoice_page.dart):
// the page, MDA's compact label-above fields, number boxes that select their text on focus, the
// type-to-search lookup with its "..." picker, and Enter moving through the fields in MDA's order.

import { useNavigate } from '@tanstack/react-router';
import { useState, type KeyboardEvent, type ReactNode } from 'react';
import { BackButton } from '../../components/BackButton.tsx';
import { whenToastClosed } from '../../components/Toast.tsx';
import { Heading } from '../../components/ledger.tsx';

/** A field box on these screens: the bordered box, a little tighter than on the masters so a
 *  whole bill fits one laptop screen, as MDA's does. */
export const boxClass = (error?: boolean) =>
  `h-[34px] w-full min-w-0 field-box px-2.5 text-[15px] text-foreground outline-none focus-visible:outline-none ${error ? 'field-error' : ''}`;

/** The ruled page: Back (to Transactions), the heading, MDA's chips, then the bill. */
export function TransactionPage({
  title,
  chips,
  children,
}: {
  title: [string, string];
  chips?: ReactNode;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  return (
    <section className="ledger-paper relative flex min-h-full flex-col gap-2 border border-border pb-3 pl-[76px] pr-8 pt-3 print:hidden max-md:px-4 max-md:pb-6 max-md:pt-4">
      <div
        aria-hidden="true"
        className="absolute inset-y-0 left-[46px] w-px bg-ledger-margin max-md:hidden"
      />
      <div
        aria-hidden="true"
        className="absolute inset-y-0 left-[50px] w-px bg-ledger-margin max-md:hidden"
      />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b-2 border-foreground pb-2 max-md:gap-x-3">
        <BackButton
          onClick={() =>
            void navigate({ to: '/app/section/$section', params: { section: 'transactions' } })
          }
        />
        <Heading
          as="h1"
          lead={title[0]}
          tail={title[1]}
          className="text-[30px] max-md:text-[28px]"
        />
        {chips}
        <span className="flex-1" />
        <span className="text-xs text-muted-foreground pointer-coarse:hidden">
          Enter moves to the next field
        </span>
      </div>
      {children}
    </section>
  );
}

/** One of MDA's small coloured chips in the title bar. */
export const Chip = ({
  tone,
  children,
}: {
  tone: 'warn' | 'ok' | 'violet';
  children: ReactNode;
}) => (
  <span
    className={`border px-2 py-1 text-xs font-semibold ${
      tone === 'warn'
        ? 'border-amber-600/40 bg-amber-500/10 text-amber-700 dark:text-amber-400'
        : tone === 'violet'
          ? 'border-violet-600/40 bg-violet-500/10 text-violet-700 dark:text-violet-300'
          : 'border-primary-text/30 bg-accent text-primary-text'
    }`}
  >
    {children}
  </span>
);

/** A label above its field (`_field`); mandatory ones carry the red star. */
export function Cell({
  id,
  label,
  required,
  className,
  children,
}: {
  id?: string;
  label: string;
  required?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`flex min-w-0 flex-col gap-0.5 ${className ?? ''}`}>
      <label htmlFor={id} className="truncate text-[13px] font-semibold text-muted-foreground">
        {label}
        {required && <span className="text-destructive"> *</span>}
      </label>
      {children}
    </div>
  );
}

/** A read-only box (Purchase No., Tax, Amount, the other of Item Code / Item Name). */
export const ReadOnly = ({
  text,
  strong,
  right,
}: {
  text: string;
  strong?: boolean;
  right?: boolean;
}) => (
  <div
    className={`flex h-[34px] min-w-0 items-center border border-border bg-muted/50 px-2.5 text-[15px] ${
      strong ? 'font-mono font-bold' : ''
    } ${right ? 'justify-end font-mono' : ''}`}
  >
    <span className="truncate">{text}</span>
  </div>
);

/** A number box: digits and '.' only, right-aligned, its text selected on focus so typing
 *  replaces it, as in MDA. */
export function NumBox({
  id,
  nav,
  value,
  onChange,
  format,
}: {
  id: string;
  nav?: number;
  value: string;
  onChange: (v: string) => void;
  /** Tidies the figure on leaving the box: `fq` for a quantity, `fa` for a rate or amount. */
  format?: (v: number) => string;
}) {
  return (
    <input
      id={id}
      data-nav={nav}
      value={value}
      inputMode="decimal"
      autoComplete="off"
      onFocus={(e) => e.target.select()}
      onBlur={(e) => {
        if (!format) return;
        const tidy = format(Number(e.target.value) || 0);
        if (tidy !== e.target.value) onChange(tidy);
      }}
      onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ''))}
      className={`${boxClass()} text-right font-mono`}
    />
  );
}

/** Focuses the field with MDA's order number `n` (deferred a frame, as `_advanceTo`). A field
 *  that isn't drawn yet (the page still loading) is waited for, a few frames at most. */
export const focusNav = (n: number, tries = 10) =>
  requestAnimationFrame(() =>
    // A message popup holds the focus; the cursor moves once it's closed.
    whenToastClosed(() => {
      const el = document.querySelector<HTMLElement>(`[data-nav="${n}"]`);
      if (el) el.focus();
      else if (tries > 0) focusNav(n, tries - 1);
    }),
  );

/**
 * Enter moves to the next field in MDA's order (each field's `data-nav`), on the form's own
 * boxes only. A box that handles Enter itself (a date opening its calendar, a lookup taking the
 * highlighted match) marks the event handled and nothing moves. `after` overrides the next stop
 * for a field (Narration → Item, Disc Amt → Add).
 */
export function enterToNext(e: KeyboardEvent<HTMLElement>, after: Record<number, number> = {}) {
  if (e.key !== 'Enter' || e.defaultPrevented || e.shiftKey) return;
  const t = e.target as HTMLElement;
  if (t.tagName !== 'INPUT') return;
  const from = Number(t.dataset.nav);
  if (!from) return;
  e.preventDefault();
  if (after[from]) return focusNav(after[from]);
  const order = [...document.querySelectorAll<HTMLElement>('[data-nav]')]
    .filter((el) => !(el as HTMLInputElement).disabled)
    .map((el) => Number(el.dataset.nav))
    .filter((n) => n > from)
    .sort((a, b) => a - b);
  if (order.length) focusNav(order[0]!);
}

export type Ref = { code: string; name: string; extra?: string | null };

/** Records matching the typed text (code or name, anywhere), those starting with it first. */
function matchesOf<T extends Ref>(items: T[], needle: string): T[] {
  if (!needle) return items;
  const hit = items.filter(
    (o) => o.code.toLowerCase().includes(needle) || o.name.toLowerCase().includes(needle),
  );
  const starts = (o: T) =>
    o.code.toLowerCase().startsWith(needle) || o.name.toLowerCase().startsWith(needle);
  return [...hit.filter(starts), ...hit.filter((o) => !starts(o))];
}

/** The text with the typed part in bold, so it's clear why a record matched. */
function Mark({ text, needle }: { text: string; needle: string }) {
  const at = needle ? text.toLowerCase().indexOf(needle) : -1;
  if (at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <mark className="bg-primary/15 font-semibold text-foreground">
        {text.slice(at, at + needle.length)}
      </mark>
      {text.slice(at + needle.length)}
    </>
  );
}

/**
 * MDA's `_combo`: type any part of the code or name and the matches drop down (nothing shows
 * until something is typed); ↑ ↓ move, Enter or a click picks. Leaving the box shows the chosen
 * record again — typed text that wasn't picked is dropped. A click in the box or ↓ opens the full
 * list (the "..." picker was removed at the user's request, 2026-10-25).
 */
export function Lookup<T extends Ref>({
  id,
  nav,
  value,
  items,
  hint,
  showCode,
  error,
  onChange,
}: {
  id: string;
  nav?: number;
  value: T | null;
  items: T[];
  hint: string;
  /** Item Code entry: the box reads the code alone; the name has its own box beside it. MDA's
   *  "CODE  -  Name" was changed at the user's request (2026-10-25). */
  showCode?: boolean;
  error?: boolean;
  onChange: (v: T) => void;
}) {
  const label = (o: T) => (showCode ? o.code : o.name);
  const shown = value ? label(value) : '';
  const [text, setText] = useState<string | null>(null);
  const [hi, setHi] = useState(0);
  /** The whole list, opened by a click in the box or ↓ (not by Enter arriving here). */
  const [browse, setBrowse] = useState(false);

  const q = (text ?? '').trim().toLowerCase();
  const matches =
    browse && (!q || q === shown.toLowerCase())
      ? items
      : text === null || !q || q === shown.toLowerCase()
        ? []
        : matchesOf(items, q);

  const pick = (o: T) => {
    setText(null);
    setBrowse(false);
    onChange(o);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' && !matches.length && items.length) {
      e.preventDefault();
      setBrowse(true);
      setHi(0);
    } else if (e.key === 'ArrowDown' && matches.length) {
      e.preventDefault();
      setHi((h) => Math.min(h + 1, matches.length - 1));
    } else if (e.key === 'ArrowUp' && matches.length) {
      e.preventDefault();
      setHi((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter' && matches.length) {
      // Enter takes the highlighted match; the screen then moves on.
      e.preventDefault();
      pick(matches[hi] ?? matches[0]!);
    } else if (e.key === 'Escape' && (text !== null || browse)) {
      e.preventDefault();
      setText(null);
      setBrowse(false);
    }
  };

  return (
    <div className="flex min-w-0 gap-1.5">
      <div className="relative min-w-0 flex-1">
        <input
          id={id}
          data-nav={nav}
          value={text ?? shown}
          placeholder={hint}
          autoComplete="off"
          onChange={(e) => {
            setText(e.target.value);
            setHi(0);
          }}
          onMouseDown={() => {
            setBrowse((b) => !b);
            setHi(0);
          }}
          onBlur={() => {
            setText(null);
            setBrowse(false);
          }}
          onKeyDown={onKeyDown}
          className={boxClass(error)}
        />
        {matches.length > 0 && (
          <div
            onMouseDown={(e) => e.preventDefault()}
            className="absolute left-0 top-full z-20 max-h-60 w-[max(100%,380px)] max-w-[calc(100vw-32px)] overflow-y-auto border border-border bg-card shadow-lg"
          >
            {matches.map((o, i) => (
              <button
                key={o.code}
                type="button"
                tabIndex={-1}
                ref={(el) => {
                  if (i === hi) el?.scrollIntoView({ block: 'nearest' });
                }}
                onClick={() => pick(o)}
                className={`flex w-full gap-3 px-2.5 py-2 text-left text-sm hover:bg-accent ${i === hi ? 'bg-accent' : ''}`}
              >
                <span className="w-[74px] flex-none truncate font-mono text-xs leading-5 text-muted-foreground">
                  <Mark text={o.code} needle={q} />
                </span>
                <span className="min-w-0 flex-1 truncate">
                  <Mark text={o.name} needle={q} />
                </span>
                {o.extra && (
                  <span className="flex-none text-xs leading-5 text-muted-foreground">
                    {o.extra}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** dd/MM/yyyy, the one date format shown across the software. */
export const dmy = (iso: string) => {
  const [y, m, d] = iso.split('-');
  return y && m && d ? `${d}/${m}/${y}` : iso;
};

export const BAR_BTN =
  'flex h-11 cursor-pointer items-center justify-center border-[1.5px] border-foreground px-4 text-[15px] font-semibold disabled:cursor-not-allowed disabled:opacity-40';

/** One figure on a totals line ("Sub Total 1049.99"). */
export const Total = ({ label, value }: { label: string; value: string }) => (
  <span className="flex items-baseline gap-1.5">
    <span className="text-xs text-muted-foreground">{label}</span>
    <span className="font-mono text-sm font-bold">{value}</span>
  </span>
);

export type GridCol<T> = {
  label: string;
  /** CSS grid track. */
  w: string;
  num?: boolean;
  cell: (line: T, index: number) => string;
};

/** The item grid under the entry row: tap a row to edit it, ✎ and ✕ on each. It fills the
 *  space left and scrolls on its own, sideways too on narrow screens; the page doesn't. */
export function ItemGrid<T>({
  cols,
  lines,
  empty,
  selected,
  minWidth = 1110,
  onEdit,
  onRemove,
}: {
  cols: GridCol<T>[];
  lines: T[];
  empty: string;
  selected: number | null;
  minWidth?: number;
  onEdit: (i: number) => void;
  onRemove: (i: number) => void;
}) {
  const tracks = { gridTemplateColumns: [...cols.map((c) => c.w), '64px'].join(' ') };
  return (
    <div className="flex min-h-[56px] flex-1 flex-col overflow-auto border border-border bg-card max-sm:min-h-[180px] max-sm:flex-none">
      <div style={{ minWidth }}>
        <div
          style={tracks}
          className="sticky top-0 grid border-b border-border bg-muted text-xs font-bold text-muted-foreground"
        >
          {cols.map((c, i) => (
            <span key={i} className={`px-1.5 py-1.5 ${c.num ? 'text-right' : ''}`}>
              {c.label}
            </span>
          ))}
          <span />
        </div>
        {lines.map((l, i) => (
          <div
            key={i}
            style={tracks}
            onClick={() => onEdit(i)}
            className={`grid cursor-pointer items-center border-b border-border/60 text-[13px] hover:bg-accent ${selected === i ? 'bg-accent' : ''}`}
          >
            {cols.map((c, k) => (
              <span
                key={k}
                className={`truncate px-1.5 py-1.5 ${c.num ? 'text-right font-mono' : ''}`}
              >
                {c.cell(l, i)}
              </span>
            ))}
            <span className="flex justify-center gap-1">
              <button
                type="button"
                tabIndex={-1}
                title="Edit line"
                aria-label={`Edit line ${i + 1}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit(i);
                }}
                className="grid size-7 cursor-pointer place-items-center text-muted-foreground hover:text-foreground"
              >
                ✎
              </button>
              <button
                type="button"
                tabIndex={-1}
                title="Remove line"
                aria-label={`Remove line ${i + 1}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(i);
                }}
                className="grid size-7 cursor-pointer place-items-center text-destructive"
              >
                ✕
              </button>
            </span>
          </div>
        ))}
      </div>
      {/* Outside the wide rows, so it stays centred in what's visible. */}
      {lines.length === 0 && (
        <p className="sticky left-0 m-0 py-6 text-center text-sm text-muted-foreground">{empty}</p>
      )}
    </div>
  );
}

/** The Code / Name switch beside an item panel's title: which box the item is typed in. */
export function EntryBySwitch({
  byCode,
  onChange,
}: {
  byCode: boolean;
  onChange: (byCode: boolean) => void;
}) {
  return (
    <div role="radiogroup" aria-label="Enter item by" className="flex gap-3">
      {(['Code', 'Name'] as const).map((k) => {
        const on = (k === 'Code') === byCode;
        return (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={-1}
            onClick={() => !on && onChange(k === 'Code')}
            className={`flex cursor-pointer items-center gap-1.5 text-sm ${on ? 'font-semibold text-primary-text' : 'text-muted-foreground'}`}
          >
            <span
              aria-hidden="true"
              className={`grid size-4 place-items-center rounded-full border-[1.5px] ${on ? 'border-primary-text' : 'border-muted-foreground'}`}
            >
              {on && <span className="size-2 rounded-full bg-primary-text" />}
            </span>
            {k}
          </button>
        );
      })}
    </div>
  );
}
