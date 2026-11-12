// Ledger Statement, Trial Balance, Purchase Register and Outstanding (WORKFLOW Phase 6; MDA has
// none of them; added 2026-10-25). The figures are worked out on the server from Active
// vouchers; these screens lay them out with the shared report page and table.

import { AGEING, ageingOf, drCr, reportMessages as rm } from '@qi/core';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api, unwrap, type OkBody } from '../../api.ts';
import { Dialog } from '../../components/Dialog.tsx';
import { SearchSelect } from '../../components/SearchSelect.tsx';
import { boxClass, dmy } from '../transactions/shared.tsx';
import {
  CheckFilter,
  PeriodDate,
  ReportPage,
  ReportTable,
  amt,
  defaultPeriod,
  useBook,
  type Col,
} from './shared.tsx';

type Period = { from: string; to: string };

/** The period, set to the open year once the book is known. */
function usePeriod() {
  const book = useBook();
  const [p, setP] = useState<Period | null>(null);
  useEffect(() => {
    if (book && !p) setP(defaultPeriod(book.fyFrom, book.fyTo));
  }, [book]);
  return [p, setP] as const;
}

/** One "as on" date, today within the open year. */
function useAsOn() {
  const book = useBook();
  const [to, setTo] = useState('');
  useEffect(() => {
    if (book && !to) setTo(defaultPeriod(book.fyFrom, book.fyTo).to);
  }, [book]);
  return [to, setTo] as const;
}

const periodLine = (p: Period) => `From ${dmy(p.from)} to ${dmy(p.to)}`;
const sum = <T,>(rows: T[], f: (r: T) => number) => rows.reduce((a, r) => a + f(r), 0);
const bal = (v: number) => drCr(v, amt);

function PeriodFilters({ p, set }: { p: Period; set: (p: Period) => void }) {
  return (
    <>
      <PeriodDate
        id="rp-from"
        label="From"
        value={p.from}
        onChange={(from) => set({ ...p, from })}
      />
      <PeriodDate id="rp-to" label="To" value={p.to} onChange={(to) => set({ ...p, to })} />
      {p.from > p.to && <span className="pb-2 text-[13px] text-destructive">{rm.badRange}</span>}
    </>
  );
}

// ── Ledger Statement ───────────────────────────────────────────────────────────

type Statement = NonNullable<
  OkBody<Awaited<ReturnType<(typeof api.api.reports)['ledger-statement']['$get']>>>['statement']
>;
type StatementRow = Statement['rows'][number];

/** The statement's columns, with its own totals. */
function statementCols(s: Statement | null): Col<StatementRow>[] {
  return [
    { head: 'Date', w: '92px', cell: (r) => dmy(r.date) },
    { head: 'Voucher No', w: '100px', wide: true, cell: (r) => r.vchrNo },
    { head: 'Type', w: '120px', wide: true, cell: (r) => r.type },
    { head: 'Particulars', w: 'minmax(120px,1fr)', cell: (r) => r.particulars, total: 'Total' },
    { head: 'Narration', w: 'minmax(100px,1fr)', wide: true, cell: (r) => r.narration },
    {
      head: 'Debit',
      w: '104px',
      num: true,
      cell: (r) => (r.debit ? amt(r.debit) : ''),
      total: s ? amt(s.debit) : '',
    },
    {
      head: 'Credit',
      w: '104px',
      num: true,
      cell: (r) => (r.credit ? amt(r.credit) : ''),
      total: s ? amt(s.credit) : '',
    },
    {
      head: 'Balance',
      w: '128px',
      num: true,
      wide: true,
      cell: (r) => bal(r.balance),
      total: s ? bal(s.closing) : '',
    },
  ];
}

/** Opening and closing balance above a statement. */
function Balances({ s }: { s: Statement }) {
  return (
    <div className="flex flex-wrap gap-x-8 gap-y-1 text-sm">
      <span>
        <span className="text-muted-foreground">Opening balance </span>
        <span className="font-mono font-semibold">{bal(s.opening)}</span>
      </span>
      <span>
        <span className="text-muted-foreground">Closing balance </span>
        <span className="font-mono font-semibold">{bal(s.closing)}</span>
      </span>
    </div>
  );
}

const rowKey = (r: StatementRow) => `${r.vchrNo}-${r.date}-${r.debit}-${r.credit}-${r.balance}`;

/** Which ledgers to show when several are wanted (added 2026-11-12, at the user's request). */
type Pick = 'all' | 'parties' | 'chosen';

export function LedgerStatementScreen() {
  const [p, setP] = usePeriod();
  const [mode, setMode] = useState<'single' | 'multi'>('single');
  const [acc, setAcc] = useState('');
  const [pick, setPick] = useState<Pick>('parties');
  const [picked, setPicked] = useState<string[]>([]);
  const [picking, setPicking] = useState(false);
  const [filter, setFilter] = useState('');
  const ledgers = useQuery({
    queryKey: ['ledgers'],
    queryFn: () => unwrap(api.api.ledgers.$get()),
  });
  const okPeriod = !!p && p.from <= p.to;
  const one = useQuery({
    queryKey: ['report', 'ledger-statement', acc, p],
    enabled: mode === 'single' && !!acc && okPeriod,
    queryFn: () =>
      unwrap(
        api.api.reports['ledger-statement'].$get({ query: { acc, from: p!.from, to: p!.to } }),
      ),
  });
  const many = useQuery({
    queryKey: ['report', 'ledger-statements', pick, picked, p],
    enabled: mode === 'multi' && okPeriod && (pick !== 'chosen' || picked.length > 0),
    queryFn: () =>
      unwrap(
        api.api.reports['ledger-statements'].$get({
          query: {
            from: p!.from,
            to: p!.to,
            ...(pick === 'chosen' ? { accs: picked.join(',') } : {}),
            ...(pick === 'parties' ? { parties: '1' as const } : {}),
          },
        }),
      ),
  });
  const list = (ledgers.data ?? [])
    .map((l) => ({ code: l.accCode, name: l.accName, group: l.grpName ?? '' }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const options = list.map((l) => ({ value: l.code, label: l.name }));
  const s = one.data?.statement ?? null;
  const statements = many.data?.statements ?? [];

  const pickLabel =
    pick === 'all'
      ? 'All ledgers'
      : pick === 'parties'
        ? 'All parties'
        : picked.length === 0
          ? 'Select ledgers…'
          : `${picked.length} ledger${picked.length > 1 ? 's' : ''} selected`;
  const shown = list.filter(
    (l) =>
      !filter ||
      l.name.toLowerCase().includes(filter.toLowerCase()) ||
      l.group.toLowerCase().includes(filter.toLowerCase()),
  );
  const toggle = (code: string) =>
    setPicked((x) => (x.includes(code) ? x.filter((c) => c !== code) : [...x, code]));
  const label = 'flex flex-col gap-0.5 text-[13px] font-semibold text-muted-foreground';

  if (!p)
    return (
      <ReportPage title={['Ledger', 'Statement']} subtitle="" filters={null}>
        {null}
      </ReportPage>
    );
  const subtitle =
    mode === 'single'
      ? s
        ? `${s.ledger.accName} · ${periodLine(p)}`
        : periodLine(p)
      : `${pickLabel} · ${periodLine(p)}`;
  return (
    <ReportPage
      title={['Ledger', 'Statement']}
      subtitle={subtitle}
      filters={
        <>
          <fieldset className={`${label} m-0 border-0 p-0`}>
            <legend className="mb-0.5 p-0">Ledger</legend>
            <div className="flex h-[34px] items-center gap-3 text-sm font-normal text-foreground">
              {(['single', 'multi'] as const).map((m) => (
                <label key={m} className="flex cursor-pointer items-center gap-1.5">
                  <input
                    type="radio"
                    name="rp-ledger-mode"
                    checked={mode === m}
                    onChange={() => setMode(m)}
                    className="size-4 accent-[var(--primary)]"
                  />
                  {m === 'single' ? 'Single' : 'Multiple'}
                </label>
              ))}
            </div>
          </fieldset>
          {mode === 'single' ? (
            <label htmlFor="rp-ledger" className={`${label} w-72 max-sm:w-full`}>
              Ledger
              <SearchSelect
                id="rp-ledger"
                compact
                value={acc}
                options={options}
                placeholder="Search ledger…"
                onCommit={(v) => setAcc(v)}
              />
            </label>
          ) : (
            <label htmlFor="rp-ledgers" className={`${label} w-56 max-sm:w-full`}>
              Ledgers
              <button
                id="rp-ledgers"
                type="button"
                onClick={() => setPicking(true)}
                className={`${boxClass()} cursor-pointer text-left`}
              >
                {pickLabel}
              </button>
            </label>
          )}
          <PeriodFilters p={p} set={setP} />
        </>
      }
    >
      {mode === 'single' ? (
        !acc ? (
          <p className="m-0 py-10 text-center text-sm text-muted-foreground">{rm.pickLedger}</p>
        ) : (
          <>
            {s && <Balances s={s} />}
            <ReportTable
              cols={statementCols(s)}
              rows={s?.rows ?? []}
              rowKey={rowKey}
              empty={rm.noEntries}
              minWidth={920}
            />
          </>
        )
      ) : pick === 'chosen' && picked.length === 0 ? (
        <p className="m-0 py-10 text-center text-sm text-muted-foreground">{rm.pickLedger}</p>
      ) : (
        // Several statements, one after another; the page scrolls through them.
        <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto print:overflow-visible">
          {many.isLoading && (
            <p className="m-0 py-10 text-center text-sm text-muted-foreground">Loading…</p>
          )}
          {!many.isLoading && statements.length === 0 && (
            <p className="m-0 py-10 text-center text-sm text-muted-foreground">{rm.noEntries}</p>
          )}
          {statements.map((st) => (
            <section
              key={st.ledger.accCode}
              className="flex flex-none flex-col gap-2 print:break-inside-avoid-page"
            >
              <h2 className="m-0 border-b border-foreground pb-1 font-serif text-xl font-normal">
                {st.ledger.accName}
                <span className="ml-2 font-mono text-xs text-muted-foreground">
                  {st.ledger.accCode}
                </span>
              </h2>
              <Balances s={st} />
              <ReportTable
                cols={statementCols(st)}
                rows={st.rows}
                rowKey={rowKey}
                empty={rm.noEntries}
                minWidth={920}
              />
            </section>
          ))}
        </div>
      )}

      <Dialog
        open={picking}
        onClose={() => setPicking(false)}
        title={['Select', 'Ledgers']}
        className="w-[440px] max-sm:w-[calc(100vw-32px)]"
      >
        <div className="flex flex-col gap-2 px-[26px] pb-[22px] pt-3">
          <div className="flex flex-col gap-1.5 border-b border-border pb-2 text-sm font-semibold">
            {(
              [
                ['parties', 'All parties (Sundry Debtors and Creditors)'],
                ['all', 'All ledgers'],
                ['chosen', 'Choose ledgers'],
              ] as const
            ).map(([k, text]) => (
              <label key={k} className="flex cursor-pointer items-center gap-2">
                <input
                  type="radio"
                  name="rp-ledger-pick"
                  checked={pick === k}
                  onChange={() => setPick(k)}
                  className="size-4 accent-[var(--primary)]"
                />
                {text}
              </label>
            ))}
          </div>
          <input
            aria-label="Search ledgers"
            value={filter}
            disabled={pick !== 'chosen'}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search ledger or group…"
            className={boxClass()}
          />
          <div className="flex max-h-[45vh] flex-col overflow-auto">
            {shown.map((l) => (
              <label
                key={l.code}
                className={`flex cursor-pointer items-center gap-2 px-1 py-1 text-sm hover:bg-accent ${pick !== 'chosen' ? 'opacity-50' : ''}`}
              >
                <input
                  type="checkbox"
                  disabled={pick !== 'chosen'}
                  checked={pick === 'chosen' && picked.includes(l.code)}
                  onChange={() => toggle(l.code)}
                  className="size-4 accent-[var(--primary)]"
                />
                <span className="flex-1 truncate">{l.name}</span>
                <span className="truncate text-xs text-muted-foreground">{l.group}</span>
              </label>
            ))}
          </div>
          <div className="flex items-center gap-2 border-t border-border pt-2">
            <span className="flex-1 text-xs text-muted-foreground">{pickLabel}</span>
            {pick === 'chosen' && picked.length > 0 && (
              <button
                type="button"
                onClick={() => setPicked([])}
                className="cursor-pointer text-xs font-semibold text-muted-foreground underline underline-offset-2"
              >
                Clear
              </button>
            )}
            <button
              type="button"
              onClick={() => setPicking(false)}
              className="flex h-10 cursor-pointer items-center border-[1.5px] border-foreground bg-foreground px-5 text-[15px] font-semibold text-background"
            >
              Done
            </button>
          </div>
        </div>
      </Dialog>
    </ReportPage>
  );
}

// ── Trial Balance ──────────────────────────────────────────────────────────────

type TrialRow = OkBody<
  Awaited<ReturnType<(typeof api.api.reports)['trial-balance']['$get']>>
>['rows'][number];

export function TrialBalanceScreen() {
  const [to, setTo] = useAsOn();
  const q = useQuery({
    queryKey: ['report', 'trial-balance', to],
    enabled: !!to,
    queryFn: () => unwrap(api.api.reports['trial-balance'].$get({ query: { to } })),
  });
  const t = q.data;
  // The opening balances' gap, if any, as its own line so the two sides agree.
  const rows: TrialRow[] = t
    ? [
        ...t.rows,
        ...(Math.abs(t.difference) >= 0.005
          ? [
              {
                accCode: '~diff',
                accName: rm.differenceLabel,
                grpName: '',
                debit: t.difference < 0 ? -t.difference : 0,
                credit: t.difference > 0 ? t.difference : 0,
              },
            ]
          : []),
      ]
    : [];
  const cols: Col<TrialRow>[] = [
    { head: 'Ledger', w: 'minmax(150px,1fr)', cell: (r) => r.accName, total: 'Total' },
    { head: 'Group', w: 'minmax(120px,0.8fr)', wide: true, cell: (r) => r.grpName },
    {
      head: 'Debit',
      w: '130px',
      num: true,
      cell: (r) => (r.debit ? amt(r.debit) : ''),
      total: amt(sum(rows, (r) => r.debit)),
    },
    {
      head: 'Credit',
      w: '130px',
      num: true,
      cell: (r) => (r.credit ? amt(r.credit) : ''),
      total: amt(sum(rows, (r) => r.credit)),
    },
  ];
  return (
    <ReportPage
      title={['Trial', 'Balance']}
      subtitle={to ? `As on ${dmy(to)}` : ''}
      filters={<PeriodDate id="rp-to" label="As on" value={to} onChange={setTo} />}
    >
      <ReportTable
        cols={cols}
        rows={rows}
        rowKey={(r) => r.accCode}
        empty={rm.noBalances}
        minWidth={560}
      />
    </ReportPage>
  );
}

// ── Purchase Register ──────────────────────────────────────────────────────────

type PurchaseRow = OkBody<
  Awaited<ReturnType<(typeof api.api.reports)['purchase-register']['$get']>>
>[number];

export function PurchaseRegisterScreen() {
  const [p, setP] = usePeriod();
  const [cancelled, setCancelled] = useState(false);
  const q = useQuery({
    queryKey: ['report', 'purchase-register', p, cancelled],
    enabled: !!p && p.from <= p.to,
    queryFn: () =>
      unwrap(
        api.api.reports['purchase-register'].$get({
          query: { from: p!.from, to: p!.to, ...(cancelled ? { cancelled: '1' } : {}) },
        }),
      ),
  });
  if (!p)
    return (
      <ReportPage title={['Purchase', 'Register']} subtitle="" filters={null}>
        {null}
      </ReportPage>
    );
  const rows = q.data ?? [];
  const active = rows.filter((r) => r.status !== 'Cancelled');
  const total = (f: (r: PurchaseRow) => number) => amt(sum(active, f));
  const money = (
    head: string,
    w: string,
    f: (r: PurchaseRow) => number,
    wide = true,
  ): Col<PurchaseRow> => ({
    head,
    w,
    num: true,
    wide,
    cell: (r) => amt(f(r)),
    total: total(f),
  });
  const cols: Col<PurchaseRow>[] = [
    { head: 'Date', w: '92px', wide: true, cell: (r) => dmy(r.billDate) },
    { head: 'Bill No', w: '96px', cell: (r) => r.billNo },
    { head: 'Supplier', w: 'minmax(130px,1fr)', cell: (r) => r.suppName, total: 'Total' },
    { head: 'GSTIN', w: '140px', wide: true, cell: (r) => r.gstin },
    { head: 'Supp. Bill No', w: '110px', wide: true, cell: (r) => r.suppInvNo },
    money('Taxable', '100px', (r) => r.taxable),
    money('CGST', '84px', (r) => r.cgst),
    money('SGST', '84px', (r) => r.sgst),
    money('IGST', '84px', (r) => r.igst),
    money('Freight', '80px', (r) => r.freight),
    money('R/Off', '64px', (r) => r.roundOff),
    money('Net', '108px', (r) => r.net, false),
  ];
  return (
    <ReportPage
      title={['Purchase', 'Register']}
      subtitle={periodLine(p)}
      filters={
        <>
          <PeriodFilters p={p} set={setP} />
          <CheckFilter label="Show cancelled" checked={cancelled} onChange={setCancelled} />
        </>
      }
    >
      <ReportTable
        cols={cols}
        rows={rows}
        rowKey={(r) => r.billNo}
        empty={rm.noPurchases}
        muted={(r) => r.status === 'Cancelled'}
        minWidth={1260}
      />
    </ReportPage>
  );
}

// ── Outstanding ────────────────────────────────────────────────────────────────

type OpenBill = OkBody<
  Awaited<ReturnType<(typeof api.api.reports)['outstanding']['$get']>>
>[number];

export function OutstandingScreen() {
  const [to, setTo] = useAsOn();
  const [side, setSide] = useState<'receivable' | 'payable'>('receivable');
  const q = useQuery({
    queryKey: ['report', 'outstanding', to],
    enabled: !!to,
    queryFn: () => unwrap(api.api.reports.outstanding.$get({ query: { to } })),
  });
  const rows = (q.data ?? []).filter((b) => b.side === side);
  const bucket = (b: OpenBill, a: (typeof AGEING)[number]) =>
    ageingOf(b.overdueDays) === a ? amt(b.pending) : '';
  const cols: Col<OpenBill>[] = [
    {
      head: side === 'receivable' ? 'Customer' : 'Supplier',
      w: 'minmax(130px,1fr)',
      cell: (b) => b.accName,
      total: 'Total',
    },
    { head: 'Bill No', w: '96px', cell: (b) => b.billNo },
    { head: 'Bill Date', w: '92px', wide: true, cell: (b) => dmy(b.billDate) },
    { head: 'Due Date', w: '92px', wide: true, cell: (b) => dmy(b.dueDate) },
    {
      head: 'Bill Amount',
      w: '104px',
      num: true,
      wide: true,
      cell: (b) => amt(b.amount),
      total: amt(sum(rows, (b) => b.amount)),
    },
    {
      head: 'Pending',
      w: '104px',
      num: true,
      cell: (b) => amt(b.pending),
      total: amt(sum(rows, (b) => b.pending)),
    },
    ...AGEING.map((a): Col<OpenBill> => ({
      head: a === 'Not due' ? 'Not Due' : `${a} days`,
      w: '92px',
      num: true,
      wide: true,
      cell: (b) => bucket(b, a),
      total: amt(
        sum(
          rows.filter((b) => ageingOf(b.overdueDays) === a),
          (b) => b.pending,
        ),
      ),
    })),
  ];
  return (
    <ReportPage
      title={['Outstanding', '']}
      subtitle={to ? `As on ${dmy(to)}` : ''}
      filters={
        <>
          <PeriodDate id="rp-to" label="As on" value={to} onChange={setTo} />
          <div role="radiogroup" aria-label="Show" className="flex items-end gap-1.5 pb-0.5">
            {(
              [
                ['receivable', 'Receivable'],
                ['payable', 'Payable'],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={side === k}
                onClick={() => setSide(k)}
                className={`h-[34px] cursor-pointer border-[1.5px] px-3 text-sm font-semibold ${
                  side === k
                    ? 'border-foreground bg-foreground text-background'
                    : 'border-border bg-card text-foreground'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </>
      }
    >
      <ReportTable
        cols={cols}
        rows={rows}
        rowKey={(b) => `${b.accCode}-${b.billNo}`}
        empty={rm.noOutstanding}
        minWidth={1100}
      />
    </ReportPage>
  );
}
