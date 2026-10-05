// Left half of the company & year screen (MDA "Company & Year Setup"), on ruled ledger paper.
// Rebuilds MDA's company and year lists (company_setup_page.dart) in the approved A6 layout.
// Layout lives here only; colours come from packages/ui/src/styles.css.

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { InkButton, OutlineButton, Heading } from '../../components/ledger.tsx';
import { ImportFromMda } from './ImportFromMda.tsx';
import { BOOK_INDEX_ID, yearRange, type IndexCompany } from './types.ts';

const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const COLS =
  'grid grid-cols-[56px_minmax(0,1fr)_150px_56px] gap-4 max-sm:grid-cols-[36px_minmax(0,1fr)_44px] max-sm:gap-3';

/** MDA's company form records State, never City; show City when present, else State. */
const placeOf = (c: IndexCompany) => {
  const v = (c.city ?? '').trim() || (c.state ?? '').trim();
  return v === 'Not Applicable' ? '' : v;
};

const later = (fn: () => void) => setTimeout(fn, 0);

export function BookIndex({
  companies,
  companyId,
  yearId,
  onPickCompany,
  onPickYear,
  onNewCompany,
  onManageYears,
}: {
  companies: IndexCompany[];
  companyId: string | null;
  yearId: string | null;
  onPickCompany: (id: string) => void;
  onPickYear: (id: string) => void;
  onNewCompany: () => void;
  onManageYears: () => void;
}) {
  const [q, setQ] = useState('');
  const qRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const needle = q.trim().toLowerCase();
  const shown = useMemo(
    () =>
      companies
        .map((c, i) => ({ c, no: String(i + 1).padStart(2, '0') }))
        .filter(
          ({ c }) =>
            !needle ||
            c.compName.toLowerCase().includes(needle) ||
            placeOf(c).toLowerCase().includes(needle),
        ),
    [companies, needle],
  );
  rowRefs.current.length = shown.length;
  const initials = new Set(shown.map(({ c }) => c.compName.charAt(0).toUpperCase()));
  const focusRow = (k: number) => rowRefs.current[k]?.focus();
  const focusSelectedYear = () =>
    later(() =>
      listRef.current?.querySelector<HTMLButtonElement>('[aria-pressed="true"]')?.focus(),
    );

  // Start with the keyboard on the selected company, as MDA's list has focus on open.
  const started = useRef(false);
  useEffect(() => {
    if (started.current || shown.length === 0) return;
    started.current = true;
    // Not on phones and tablets: the list sits below Sign In there, and focusing it would scroll
    // the page away from the form.
    if (!matchMedia('(min-width: 1024px)').matches) return;
    const k = shown.findIndex(({ c }) => c.id === companyId);
    focusRow(Math.max(k, 0));
  }, [shown, companyId]);

  const pick = (id: string) => {
    onPickCompany(id);
    focusSelectedYear();
  };

  const searchKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (shown[0]) pick(shown[0].c.id);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      focusRow(0);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setQ('');
    }
  };

  const rowKey = (k: number) => (e: KeyboardEvent) => {
    const n = shown.length;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      focusRow(Math.min(k + 1, n - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (k === 0) qRef.current?.focus();
      else focusRow(k - 1);
    } else if (e.key === 'Home') {
      e.preventDefault();
      focusRow(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      focusRow(n - 1);
    } else if (/^[a-z]$/i.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
      // Type a letter: jump to the next company starting with it, wrapping round.
      e.preventDefault();
      const ch = e.key.toUpperCase();
      for (let s = 1; s <= n; s++) {
        const idx = (k + s) % n;
        if (shown[idx]!.c.compName.toUpperCase().startsWith(ch)) return focusRow(idx);
      }
    }
  };

  const yearKey = (j: number, n: number, row: number) => (e: KeyboardEvent) => {
    const buttons = () =>
      listRef.current?.querySelectorAll<HTMLButtonElement>('[data-year]') ??
      ([] as unknown as NodeListOf<HTMLButtonElement>);
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      buttons()[(j + 1) % n]?.focus();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      buttons()[(j - 1 + n) % n]?.focus();
    } else if (e.key === 'ArrowUp' || e.key === 'Escape') {
      e.preventDefault();
      focusRow(row);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      focusRow(Math.min(row + 1, shown.length - 1));
    }
  };

  const jump = (ch: string) => {
    const k = shown.findIndex(({ c }) => c.compName.toUpperCase().startsWith(ch));
    if (k >= 0) focusRow(k);
  };

  const total = companies.length;
  const plural = (n: number) => `${n} ${n === 1 ? 'company' : 'companies'}`;
  const count = needle ? `${shown.length} of ${plural(total)}` : plural(total);

  return (
    <section
      id={BOOK_INDEX_ID}
      aria-label="Company & Year Setup"
      className="ledger-paper relative flex min-h-0 min-w-0 flex-1 flex-col gap-[22px] border-r border-border pb-6 pl-[120px] pr-12 pt-9 max-lg:flex-none max-lg:border-r-0 max-lg:px-6 max-lg:pt-6 max-sm:px-4"
    >
      {/* Red double margin line, as on ledger paper */}
      <div
        aria-hidden="true"
        className="absolute inset-y-0 left-[84px] w-px bg-ledger-margin max-lg:hidden"
      />
      <div
        aria-hidden="true"
        className="absolute inset-y-0 left-[89px] w-px bg-ledger-margin max-lg:hidden"
      />

      <div className="flex flex-wrap items-end justify-between gap-5">
        <div className="flex flex-col gap-2">
          <span className="font-mono text-xs uppercase tracking-[0.12em] text-muted-foreground">
            {count}
          </span>
          <Heading
            as="h1"
            lead="Company & Year"
            tail="Setup"
            className="text-[52px] max-md:text-[36px]"
          />
        </div>
        <div className="flex flex-wrap gap-3">
          <InkButton type="button" onClick={onNewCompany}>
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
            New Company
          </InkButton>
          <OutlineButton type="button" onClick={onManageYears}>
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <rect x="3.5" y="5" width="17" height="15" rx="1.5" />
              <path d="M3.5 10h17M8 3v4M16 3v4" />
            </svg>
            Manage Years
          </OutlineButton>
          <ImportFromMda />
        </div>
      </div>

      <div className="flex max-w-[560px] flex-col gap-1.5">
        <label htmlFor="find-company" className="ledger-label">
          Search Company
        </label>
        <div className="flex items-center gap-2.5 border-b-[1.5px] border-input">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
            className="text-muted-foreground"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            id="find-company"
            ref={qRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={searchKey}
            placeholder="Company name or state"
            autoComplete="off"
            className="h-11 min-w-0 flex-1 border-0 bg-transparent text-base text-foreground outline-none focus-visible:outline-none"
          />
          {q && (
            <button
              type="button"
              onClick={() => {
                setQ('');
                qRef.current?.focus();
              }}
              aria-label="Clear search"
              className="grid size-8 cursor-pointer place-items-center text-muted-foreground"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          )}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 gap-4 max-lg:flex-none">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div
            className={`${COLS} border-b-2 border-foreground px-3 pb-2.5 font-mono text-xs uppercase tracking-[0.08em] text-muted-foreground`}
          >
            <span>No.</span>
            <span>Company Name</span>
            <span className="max-sm:hidden">State</span>
            <span className="text-right">Years</span>
          </div>

          <div
            ref={listRef}
            role="list"
            className="min-h-0 flex-1 overflow-y-auto max-lg:max-h-[55vh] max-lg:flex-none"
          >
            {shown.map(({ c, no }, k) => {
              const selected = c.id === companyId;
              const at = needle ? c.compName.toLowerCase().indexOf(needle) : -1;
              return (
                <div
                  key={c.id}
                  role="listitem"
                  className={`flex flex-col border-b border-border ${selected ? 'bg-accent' : ''}`}
                >
                  <button
                    type="button"
                    ref={(el) => {
                      rowRefs.current[k] = el;
                    }}
                    onClick={() => pick(c.id)}
                    onKeyDown={rowKey(k)}
                    aria-expanded={selected}
                    className={`${COLS} min-h-[52px] cursor-pointer items-center px-3 text-left text-base`}
                  >
                    <span
                      className={`font-mono text-[13px] ${selected ? 'text-primary-text' : 'text-muted-foreground'}`}
                    >
                      {no}
                    </span>
                    <span className={`truncate ${selected ? 'font-semibold' : ''}`}>
                      {at >= 0 ? (
                        <>
                          {c.compName.slice(0, at)}
                          <mark className="bg-transparent text-inherit underline decoration-2 underline-offset-[3px]">
                            {c.compName.slice(at, at + needle.length)}
                          </mark>
                          {c.compName.slice(at + needle.length)}
                        </>
                      ) : (
                        c.compName
                      )}
                    </span>
                    <span className="truncate text-sm text-muted-foreground max-sm:hidden">
                      {placeOf(c)}
                    </span>
                    <span className="text-right font-mono text-[13px] text-muted-foreground">
                      {c.years.length}
                    </span>
                  </button>

                  {selected && (
                    <div
                      role="group"
                      aria-label="Financial year"
                      className="flex flex-wrap gap-2.5 pb-4 pl-[84px] pr-3 pt-0.5 max-sm:pl-3"
                    >
                      {c.years.length === 0 ? (
                        <p className="m-0 py-2 text-sm text-muted-foreground">
                          No year yet. Add one with{' '}
                          <strong className="font-semibold text-foreground">Manage Years</strong>.
                        </p>
                      ) : (
                        c.years.map((y, j) => {
                          const on = y.id === yearId;
                          return (
                            <button
                              key={y.id}
                              type="button"
                              data-year
                              onClick={() => onPickYear(y.id)}
                              onKeyDown={yearKey(j, c.years.length, k)}
                              aria-pressed={on}
                              className={`flex min-h-[52px] cursor-pointer flex-col gap-0.5 border px-3.5 py-2 text-left ${
                                on
                                  ? 'border-foreground bg-foreground text-card'
                                  : 'border-border text-foreground'
                              }`}
                            >
                              <span className="text-[15px] font-semibold">FY {y.yearName}</span>
                              <span className="font-mono text-[11px] opacity-85">
                                {yearRange(y)}
                              </span>
                            </button>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {total === 0 && (
              <div className="flex flex-col items-start gap-2 px-3 py-7">
                <p className="m-0 text-[15px]">No companies yet.</p>
                <p className="m-0 text-sm text-muted-foreground">
                  Create the first one with{' '}
                  <strong className="font-semibold text-foreground">New Company</strong>.
                </p>
              </div>
            )}

            {total > 0 && shown.length === 0 && (
              <div className="flex flex-col items-start gap-3 px-3 py-7">
                <p className="m-0 text-[15px] text-muted-foreground">No company matches “{q}”.</p>
                <button
                  type="button"
                  onClick={() => {
                    setQ('');
                    qRef.current?.focus();
                  }}
                  className="flex min-h-11 cursor-pointer items-center text-sm underline underline-offset-4"
                >
                  Clear search
                </button>
              </div>
            )}
          </div>
        </div>

        <nav
          aria-label="Jump to letter"
          className="flex min-h-0 w-7 flex-none flex-col justify-between pt-[34px] max-lg:hidden"
        >
          {ALPHA.map((ch) => {
            const on = initials.has(ch);
            return (
              <button
                key={ch}
                type="button"
                disabled={!on}
                onClick={() => jump(ch)}
                aria-label={`Jump to ${ch}`}
                className={`grid min-h-0 max-h-[22px] flex-1 place-items-center leading-none font-mono text-[11px] ${on ? 'cursor-pointer text-foreground' : 'text-ledger-faint'}`}
              >
                {ch}
              </button>
            );
          })}
        </nav>
      </div>

      <div className="flex min-h-7 flex-none items-center max-lg:hidden">
        <span className="ml-auto font-mono text-xs text-muted-foreground">
          Type a letter to jump · ↑ ↓ move · Enter open
        </span>
      </div>
    </section>
  );
}
