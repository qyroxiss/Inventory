// Shared pieces of the Reports screens (docs/design/REPORTS.md): the page with Back, the
// heading, the period boxes and Print; the company and period line that heads the printout;
// a report table with its totals row; and money in Indian digit grouping.

import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { api, unwrap } from '../../api.ts';
import { BackButton } from '../../components/BackButton.tsx';
import { Heading } from '../../components/ledger.tsx';
import { DateBox, defaultVoucherDate } from '../vouchers/shared.tsx';
import { boxClass, dmyDash } from '../transactions/shared.tsx';

/** 12,34,567.89 — two decimals, Indian grouping; a negative shows its minus. */
export const amt = (v: number) =>
  v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const qty = (v: number) =>
  v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 3 });

/** The open book (company, year and its dates). */
export const useBook = () =>
  useQuery({ queryKey: ['book-me'], queryFn: () => unwrap(api.api.book.me.$get()) }).data;

/** The default period: the year's first day to today, kept inside the year (its last day once
 *  the year is over). */
export function defaultPeriod(fyFrom?: string | null, fyTo?: string | null) {
  const today = defaultVoucherDate(null, null);
  const from = fyFrom ?? today;
  const to = today < from ? from : fyTo && today > fyTo ? fyTo : today;
  return { from, to };
}

export function ReportPage({
  title,
  subtitle,
  filters,
  section = 'reports',
  print = true,
  children,
}: {
  title: [string, string];
  /** The period line ("From 01-04-2026 to 07-10-2026", "As on 07-10-2026"). */
  subtitle: string;
  /** The menu section Back returns to. */
  section?: 'reports' | 'gst-reports' | 'tools';
  /** Show the Print button (reports); off for the Tools forms. */
  print?: boolean;
  filters: ReactNode;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const book = useBook();
  return (
    <section className="ledger-paper relative flex min-h-full flex-col gap-3 md:h-full md:min-h-[480px] print:h-auto border border-border pb-4 pl-[76px] pr-8 pt-5 max-md:px-4 max-md:pb-6 max-md:pt-4 print:min-h-0 print:border-0 print:bg-white print:p-0 print:text-black">
      <div
        aria-hidden="true"
        className="absolute inset-y-0 left-[46px] w-px bg-ledger-margin max-md:hidden print:hidden"
      />
      <div
        aria-hidden="true"
        className="absolute inset-y-0 left-[50px] w-px bg-ledger-margin max-md:hidden print:hidden"
      />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b-2 border-foreground pb-3 max-md:gap-x-3 print:border-black">
        <span className="print:hidden">
          <BackButton
            onClick={() => void navigate({ to: '/app/section/$section', params: { section } })}
          />
        </span>
        <div className="flex flex-col">
          <span className="hidden text-sm font-semibold print:block">{book?.companyName}</span>
          <Heading
            as="h1"
            lead={title[0]}
            tail={title[1]}
            className="text-[34px] max-md:text-[28px] print:text-[22pt]"
          />
        </div>
        <span className="flex-1" />
        <span className="font-mono text-xs text-muted-foreground print:text-black">{subtitle}</span>
        {print && (
          <button
            type="button"
            onClick={() => window.print()}
            className="flex h-11 cursor-pointer items-center border-[1.5px] border-foreground px-4 text-[15px] font-semibold print:hidden"
          >
            Print
          </button>
        )}
      </div>
      <div className="flex flex-wrap items-end gap-x-3 gap-y-2 print:hidden">{filters}</div>
      {children}
    </section>
  );
}

/** A labelled date box for a report's period, limited to the open year. */
export function PeriodDate({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (iso: string) => void;
}) {
  const book = useBook();
  return (
    <label
      htmlFor={id}
      className="flex w-40 flex-col gap-0.5 text-[13px] font-semibold text-muted-foreground"
    >
      {label}
      <DateBox
        id={id}
        value={value}
        min={book?.fyFrom}
        max={book?.fyTo}
        format={dmyDash}
        className={boxClass()}
        onChange={onChange}
      />
    </label>
  );
}

/** A tick box filter ("Show cancelled"). */
export const CheckFilter = ({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) => (
  <label className="flex h-[34px] cursor-pointer items-center gap-2 text-sm">
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      className="size-4 accent-[var(--primary)]"
    />
    {label}
  </label>
);

export type Col<T> = {
  head: string;
  /** CSS grid track. */
  w: string;
  num?: boolean;
  /** Dropped on phones. */
  wide?: boolean;
  cell: (row: T) => ReactNode;
  /** The totals row's cell. */
  total?: ReactNode;
};

/**
 * A report table: a sticky header, the rows, and a totals row. It fills the space left and
 * scrolls inside itself on screen; printed, it runs to full length.
 */
export function ReportTable<T>({
  cols,
  rows,
  rowKey,
  empty,
  muted,
  onRow,
  minWidth = 0,
  grow = true,
}: {
  cols: Col<T>[];
  rows: T[];
  rowKey: (r: T) => string;
  empty: string;
  /** Struck-through rows (cancelled). */
  muted?: (r: T) => boolean;
  onRow?: (r: T) => void;
  minWidth?: number;
  /** Fill the space left (one table on the page); false sizes it to its rows. */
  grow?: boolean;
}) {
  const tracks = cols.map((c) => c.w).join(' ');
  const phone = cols
    .filter((c) => !c.wide)
    .map((c) => c.w)
    .join(' ');
  const style = { '--cols': tracks, '--cols-sm': phone, minWidth } as React.CSSProperties;
  const grid =
    'grid gap-x-3 [grid-template-columns:var(--cols)] max-sm:[grid-template-columns:var(--cols-sm)] max-sm:!min-w-0';
  const hasTotals = cols.some((c) => c.total !== undefined);
  const cellClass = (c: Col<T>) =>
    `truncate px-1 ${c.num ? 'text-right font-mono' : ''} ${c.wide ? 'max-sm:hidden' : ''}`;
  return (
    <div
      className={`flex flex-col overflow-auto border border-border bg-card ${grow ? 'min-h-[120px] flex-1' : 'flex-none'} print:overflow-visible print:border-black print:bg-white`}
    >
      <div
        style={style}
        className={`${grid} sticky top-0 z-[1] border-b-2 border-foreground bg-muted px-2 py-2 font-mono text-[11px] uppercase tracking-[0.06em] text-muted-foreground print:static print:border-black print:bg-white print:text-black`}
      >
        {cols.map((c) => (
          <span key={c.head} className={cellClass(c)}>
            {c.head}
          </span>
        ))}
      </div>
      {rows.length === 0 && (
        <p className="sticky left-0 m-0 py-8 text-center text-sm text-muted-foreground">{empty}</p>
      )}
      {rows.map((r) => (
        <div
          key={rowKey(r)}
          style={style}
          onClick={onRow ? () => onRow(r) : undefined}
          className={`${grid} items-center border-b border-border/70 px-2 py-1.5 text-[13.5px] print:break-inside-avoid ${onRow ? 'cursor-pointer hover:bg-accent' : ''} ${muted?.(r) ? 'text-muted-foreground line-through' : ''}`}
        >
          {cols.map((c) => (
            <span key={c.head} className={cellClass(c)}>
              {c.cell(r)}
            </span>
          ))}
        </div>
      ))}
      {hasTotals && rows.length > 0 && (
        <div
          style={style}
          className={`${grid} sticky bottom-0 mt-auto border-t-2 border-foreground bg-card px-2 py-2 text-[13.5px] font-bold print:static print:border-black`}
        >
          {cols.map((c) => (
            <span key={c.head} className={cellClass(c)}>
              {c.total ?? ''}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** The open year's months, for the GST returns (filed monthly). */
export function yearMonths(fyFrom?: string | null, fyTo?: string | null) {
  if (!fyFrom || !fyTo) return [];
  const out: { label: string; from: string; to: string }[] = [];
  let [y, m] = fyFrom.split('-').map(Number) as [number, number];
  const pad = (n: number) => String(n).padStart(2, '0');
  for (let i = 0; i < 24; i++) {
    const from = `${y}-${pad(m)}-01`;
    if (from > fyTo) break;
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const to = `${y}-${pad(m)}-${pad(last)}`;
    const name = new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en-IN', {
      month: 'short',
      timeZone: 'UTC',
    });
    out.push({
      label: `${name} ${y}`,
      from: from < fyFrom ? fyFrom : from,
      to: to > fyTo ? fyTo : to,
    });
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}

/** "Month" — picks a whole month of the open year into the period; "Custom" keeps the dates. */
export function MonthPicker({
  p,
  set,
}: {
  p: { from: string; to: string };
  set: (p: { from: string; to: string }) => void;
}) {
  const book = useBook();
  const months = yearMonths(book?.fyFrom, book?.fyTo);
  const current = months.find((m) => m.from === p.from && m.to === p.to);
  return (
    <label
      htmlFor="rp-month"
      className="flex w-40 flex-col gap-0.5 text-[13px] font-semibold text-muted-foreground"
    >
      Month
      <select
        id="rp-month"
        value={current ? current.from : ''}
        onChange={(e) => {
          const m = months.find((x) => x.from === e.target.value);
          if (m) set({ from: m.from, to: m.to });
        }}
        className={`${boxClass()} cursor-pointer`}
      >
        <option value="">Custom</option>
        {months.map((m) => (
          <option key={m.from} value={m.from}>
            {m.label}
          </option>
        ))}
      </select>
    </label>
  );
}
