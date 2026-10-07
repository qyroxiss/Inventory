// Shared pieces of the Accounting Vouchers screen (accounting_vouchers_page.dart): the page with
// its tab rail, MDA's field look (select, amount, date limited to the open year), the data each
// tab loads, and the cancel confirmation.

import { formatDmy } from '@qi/core';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { useRef, type ReactNode } from 'react';
import { api, unwrap, type OkBody } from '../../api.ts';
import { BackButton } from '../../components/BackButton.tsx';
import { Heading } from '../../components/ledger.tsx';
import { inputClass } from '../../components/master.tsx';

export type Ledger = OkBody<Awaited<ReturnType<typeof api.api.ledgers.$get>>>[number];
export type VoucherRow = OkBody<Awaited<ReturnType<typeof api.api.vouchers.$get>>>[number];
export type Message = { kind: 'ok' | 'error'; title: [string, string]; text: string };

/** The five tabs, in MDA's order, and the address each one lives at (the menu's own). */
export const TABS = [
  { key: 'receipt', label: 'Receipt', slug: 'receipt' },
  { key: 'payment', label: 'Payment', slug: 'payment' },
  { key: 'journal', label: 'Journal', slug: 'journal-voucher' },
  { key: 'debit', label: 'Debit Note', slug: 'debit-note' },
  { key: 'credit', label: 'Credit Note', slug: 'credit-note' },
] as const;
export type TabKey = (typeof TABS)[number]['key'];

/** The open book's year and every ledger, which every tab needs. */
export function useVoucherData() {
  const me = useQuery({ queryKey: ['book-me'], queryFn: () => unwrap(api.api.book.me.$get()) });
  const ledgers = useQuery({
    queryKey: ['ledgers'],
    queryFn: () => unwrap(api.api.ledgers.$get()),
  });
  return { me: me.data, ledgers: ledgers.data, ready: !!me.data && !!ledgers.data };
}

/** Ledgers of one group, by name — an exact group match, as MDA's `GrpCode = ?` (Q-26). */
export const ofGroup = (all: Ledger[], grp: string) => all.filter((l) => l.grpCode === grp);

const isoToday = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
/** Today, or the first day of the year when today falls outside it (`_defaultVoucherDate`). */
export function defaultVoucherDate(fyFrom?: string | null, fyTo?: string | null): string {
  const today = isoToday();
  if (!fyFrom || !fyTo) return today;
  return today >= fyFrom && today <= fyTo ? today : fyFrom;
}

/** The next number for a type, shown before saving (`PostingService.previewVoucherNo`). */
export const fetchNextNo = async (type: string) =>
  (await unwrap(api.api.vouchers.next.$get({ query: { type } }))).vchrNo;

export const fetchList = (types: string[]) =>
  unwrap(api.api.vouchers.$get({ query: { types: types.join(','), cancelled: '1' } }));

export const fetchLines = (id: string) =>
  unwrap(api.api.vouchers[':id'].lines.$get({ param: { id } }));

/** The page: Back, "Accounting Vouchers" with MDA's pill, the tab's content, and the tab rail
 *  (on the right, as in MDA; a row above the form on tablets and phones). */
export function VoucherPage({ tab, children }: { tab: TabKey; children: ReactNode }) {
  const navigate = useNavigate();
  return (
    <section className="ledger-paper relative flex min-h-full flex-col gap-5 border border-border pb-6 pl-[76px] pr-8 pt-6 print:hidden max-md:px-4 max-md:pb-6 max-md:pt-4">
      <div
        aria-hidden="true"
        className="absolute inset-y-0 left-[46px] w-px bg-ledger-margin max-md:hidden"
      />
      <div
        aria-hidden="true"
        className="absolute inset-y-0 left-[50px] w-px bg-ledger-margin max-md:hidden"
      />
      <div className="flex flex-col gap-2 border-b-2 border-foreground pb-3">
        <div className="flex flex-wrap items-center gap-4 max-md:gap-x-3 max-md:gap-y-2">
          <BackButton
            onClick={() =>
              void navigate({
                to: '/app/section/$section',
                params: { section: 'accounting-vouchers' },
              })
            }
          />
          <Heading
            as="h1"
            lead="Accounting"
            tail="Vouchers"
            className="text-[34px] max-md:text-[28px]"
          />
          <span className="flex-1" />
          <span className="rounded-full border border-primary-text/30 bg-accent px-2.5 py-1 text-[11px] font-semibold text-primary-text">
            Accounting Voucher
          </span>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 gap-6 max-lg:flex-none max-lg:flex-col max-lg:gap-4">
        <div className="flex min-w-0 max-w-[920px] flex-1 flex-col">{children}</div>
        <nav
          aria-label="Voucher type"
          className="flex w-44 flex-none flex-col gap-1.5 border-l border-border pl-4 max-lg:order-first max-lg:w-auto max-lg:flex-row max-lg:overflow-x-auto max-lg:border-b max-lg:border-l-0 max-lg:pb-3 max-lg:pl-0"
        >
          {TABS.map((t) => (
            <Link
              key={t.key}
              to="/app/$screen"
              params={{ screen: t.slug }}
              aria-current={t.key === tab ? 'page' : undefined}
              className={`flex min-h-11 flex-none items-center border-[1.5px] px-3.5 text-sm font-semibold ${
                t.key === tab
                  ? 'border-foreground bg-foreground text-card'
                  : 'border-border bg-card text-foreground hover:border-foreground'
              }`}
            >
              {t.label}
            </Link>
          ))}
        </nav>
      </div>
    </section>
  );
}

/** A section label ("Receipt Voucher", "Journal Entries"). */
export const SectionLabel = ({ children }: { children: ReactNode }) => (
  <h2 className="m-0 font-mono text-xs font-medium uppercase tracking-[0.12em] text-primary-text">
    {children}
  </h2>
);

/** A plain drop-down, as MDA's DropdownButtonFormField (not type-to-search). */
export function Select({
  id,
  value,
  options,
  placeholder,
  error,
  onChange,
}: {
  id?: string;
  value: string;
  options: { value: string; label: string }[];
  placeholder: string;
  error?: string;
  onChange: (v: string) => void;
}) {
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`${inputClass(error)} cursor-pointer ${value ? '' : 'text-muted-foreground'}`}
    >
      <option value="" disabled>
        {placeholder}
      </option>
      {options.map((o) => (
        <option key={o.value} value={o.value} className="bg-card text-foreground">
          {o.label}
        </option>
      ))}
    </select>
  );
}

export const ledgerOptions = (list: Ledger[]) =>
  list.map((l) => ({ value: l.accCode, label: l.accName }));

/** An amount box: "₹" in front, digits and '.' only (MDA's input formatter). */
export function AmountBox({
  id,
  value,
  error,
  onChange,
}: {
  id?: string;
  value: string;
  error?: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className={`flex h-[42px] items-center field-box pl-3 ${error ? 'field-error' : ''}`}>
      <span aria-hidden="true" className="text-muted-foreground">
        ₹
      </span>
      <input
        id={id}
        value={value}
        inputMode="decimal"
        placeholder="0.00"
        autoComplete="off"
        onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ''))}
        className="h-full min-w-0 flex-1 border-0 bg-transparent px-2 text-base text-foreground outline-none focus-visible:outline-none"
      />
    </div>
  );
}

/** A read-only box (Voucher No). */
export const ReadBox = ({ text }: { text: string }) => (
  <div className="flex h-[42px] items-center field-box bg-transparent px-3 font-mono text-base text-muted-foreground">
    {text}
  </div>
);

/** The date: shows dd/mm/yyyy and opens the browser's calendar, limited to the open year
 *  (`_pickVoucherDate`). */
export function DateBox({
  id,
  value,
  min,
  max,
  onChange,
}: {
  id?: string;
  value: string;
  min?: string | null;
  max?: string | null;
  onChange: (iso: string) => void;
}) {
  const picker = useRef<HTMLInputElement>(null);
  const open = () => {
    const p = picker.current;
    if (!p) return;
    p.value = value;
    try {
      p.showPicker();
    } catch {
      p.focus();
    }
  };
  return (
    <div className="relative">
      <input
        id={id}
        readOnly
        value={value ? formatDmy(value) : ''}
        onClick={open}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            open();
          }
        }}
        className={`${inputClass()} cursor-pointer font-mono`}
      />
      <input
        ref={picker}
        type="date"
        tabIndex={-1}
        aria-hidden="true"
        min={min ?? undefined}
        max={max ?? undefined}
        onChange={(e) => e.target.value && onChange(e.target.value)}
        className="pointer-events-none absolute bottom-0 left-0 h-px w-px opacity-0"
      />
    </div>
  );
}

const BTN =
  'flex h-12 cursor-pointer items-center justify-center border-[1.5px] border-foreground px-5 text-[15px] font-semibold disabled:cursor-not-allowed disabled:opacity-40 max-sm:flex-[1_1_40%]';

/** MDA's button row: View · Remove/Cancel · Print on the left, Clear · Save/Update on the right. */
export function VoucherButtons({
  removeLabel,
  canRemove,
  saveLabel,
  busy,
  onView,
  onRemove,
  onPrint,
  onClear,
  onSave,
}: {
  removeLabel: string;
  canRemove: boolean;
  saveLabel: string;
  busy: boolean;
  onView: () => void;
  onRemove: () => void;
  onPrint: () => void;
  onClear: () => void;
  onSave: () => void;
}) {
  return (
    <div className="flex flex-none flex-wrap items-center gap-2.5 border-t-[3px] border-double border-foreground bg-background py-3.5">
      <button type="button" onClick={onView} className={BTN}>
        View
      </button>
      <button
        type="button"
        onClick={onRemove}
        disabled={!canRemove}
        className={`${BTN} border-destructive text-destructive`}
      >
        {removeLabel}
      </button>
      <button type="button" onClick={onPrint} className={BTN}>
        Print
      </button>
      <span className="flex-1 max-sm:hidden" />
      <button type="button" onClick={onClear} className={BTN}>
        Clear
      </button>
      <button
        type="button"
        onClick={onSave}
        disabled={busy}
        className="flex h-12 min-w-[200px] cursor-pointer items-center justify-between gap-4 bg-primary px-[22px] text-[15px] font-semibold text-primary-foreground disabled:cursor-wait disabled:opacity-70 max-sm:order-last max-sm:w-full max-sm:min-w-0"
      >
        <span>{saveLabel}</span>
        <span aria-hidden="true" className="text-xl">
          →
        </span>
      </button>
    </div>
  );
}

/** The error a failed API call shows: the server's message, as MDA's toast does. */
export const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** Keeps a tab's unsaved entry while you look at another tab, as MDA's tabs stay alive. */
const drafts = new Map<string, unknown>();
export const loadDraft = <T,>(key: string): T | undefined => drafts.get(key) as T | undefined;
export const saveDraft = (key: string, value: unknown) => drafts.set(key, value);
