// Stock Summary, Day Book and Sales Register: a period, a table and its totals
// (docs/design/REPORTS.md).

import { reportMessages as rm } from '@qi/core';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api, unwrap, type OkBody } from '../../api.ts';
import { Dialog } from '../../components/Dialog.tsx';
import { boxClass, dmyDash } from '../transactions/shared.tsx';
import {
  CheckFilter,
  PeriodDate,
  ReportPage,
  ReportTable,
  amt,
  defaultPeriod,
  qty,
  useBook,
  type Col,
} from './shared.tsx';

/** The period, set to the open year once the book is known. */
function usePeriod() {
  const book = useBook();
  const [p, setP] = useState<{ from: string; to: string } | null>(null);
  useEffect(() => {
    if (book && !p) setP(defaultPeriod(book.fyFrom, book.fyTo));
  }, [book]);
  return [p, setP] as const;
}

const periodLine = (p: { from: string; to: string }) =>
  `From ${dmyDash(p.from)} to ${dmyDash(p.to)}`;

const sum = <T,>(rows: T[], f: (r: T) => number) => rows.reduce((a, r) => a + f(r), 0);

function PeriodFilters({
  p,
  set,
}: {
  p: { from: string; to: string };
  set: (p: { from: string; to: string }) => void;
}) {
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

// ── Stock Summary ──────────────────────────────────────────────────────────────

type StockRow = OkBody<
  Awaited<ReturnType<(typeof api.api.reports)['stock-summary']['$get']>>
>[number];

export function StockSummaryScreen() {
  const [p, setP] = usePeriod();
  const [godown, setGodown] = useState('');
  const godowns = useQuery({
    queryKey: ['misc-masters', 'godown'],
    queryFn: () => unwrap(api.api['misc-masters'][':kind'].$get({ param: { kind: 'godown' } })),
  });
  const q = useQuery({
    queryKey: ['report', 'stock-summary', p, godown],
    enabled: !!p && p.from <= p.to,
    queryFn: () =>
      unwrap(
        api.api.reports['stock-summary'].$get({
          query: { from: p!.from, to: p!.to, ...(godown ? { godown } : {}) },
        }),
      ),
  });
  if (!p)
    return (
      <ReportPage title={['Stock', 'Summary']} subtitle="" filters={null}>
        {null}
      </ReportPage>
    );
  const rows = q.data ?? [];
  const cols: Col<StockRow>[] = [
    { head: 'Code', w: '80px', wide: true, cell: (r) => r.code },
    { head: 'Item', w: 'minmax(140px,1fr)', cell: (r) => r.name, total: 'Total' },
    { head: 'Unit', w: '56px', wide: true, cell: (r) => r.unit },
    { head: 'Opening', w: '90px', num: true, wide: true, cell: (r) => qty(r.opening) },
    { head: 'Inward', w: '90px', num: true, wide: true, cell: (r) => qty(r.inward) },
    { head: 'Outward', w: '90px', num: true, wide: true, cell: (r) => qty(r.outward) },
    { head: 'Closing', w: '90px', num: true, cell: (r) => qty(r.closing) },
    { head: 'Rate', w: '90px', num: true, wide: true, cell: (r) => amt(r.rate) },
    {
      head: 'Value',
      w: '120px',
      num: true,
      cell: (r) => amt(r.value),
      total: amt(sum(rows, (r) => r.value)),
    },
  ];
  return (
    <ReportPage
      title={['Stock', 'Summary']}
      subtitle={`${periodLine(p)}${godown ? ` · ${godown}` : ''}`}
      filters={
        <>
          <PeriodFilters p={p} set={setP} />
          <label
            htmlFor="rp-godown"
            className="flex w-48 flex-col gap-0.5 text-[13px] font-semibold text-muted-foreground"
          >
            Godown
            <select
              id="rp-godown"
              value={godown}
              onChange={(e) => setGodown(e.target.value)}
              className={`${boxClass()} cursor-pointer`}
            >
              <option value="">All godowns</option>
              {(godowns.data ?? []).map((g) => (
                <option key={g.code} value={g.name}>
                  {g.name}
                </option>
              ))}
            </select>
          </label>
        </>
      }
    >
      <ReportTable
        cols={cols}
        rows={rows}
        rowKey={(r) => r.code}
        empty={rm.noStock}
        minWidth={860}
      />
      <p className="m-0 text-xs text-muted-foreground print:text-black">
        Valued at each item's purchase rate (its sale rate when it has none).
        {godown ? ' A godown shows its own movements; opening stock carries no godown.' : ''}
      </p>
    </ReportPage>
  );
}

// ── Day Book ───────────────────────────────────────────────────────────────────

type DayRow = OkBody<Awaited<ReturnType<(typeof api.api.reports)['day-book']['$get']>>>[number];

export function DayBookScreen() {
  const [p, setP] = usePeriod();
  const [cancelled, setCancelled] = useState(false);
  const [open, setOpen] = useState<DayRow | null>(null);
  const q = useQuery({
    queryKey: ['report', 'day-book', p, cancelled],
    enabled: !!p && p.from <= p.to,
    queryFn: () =>
      unwrap(
        api.api.reports['day-book'].$get({
          query: { from: p!.from, to: p!.to, ...(cancelled ? { cancelled: '1' } : {}) },
        }),
      ),
  });
  const lines = useQuery({
    queryKey: ['voucher-lines', open?.id],
    enabled: !!open,
    queryFn: () => unwrap(api.api.vouchers[':id'].lines.$get({ param: { id: open!.id } })),
  });
  if (!p)
    return (
      <ReportPage title={['Day', 'Book']} subtitle="" filters={null}>
        {null}
      </ReportPage>
    );
  const rows = q.data ?? [];
  const active = rows.filter((r) => r.status !== 'Cancelled');
  const cols: Col<DayRow>[] = [
    { head: 'Date', w: '92px', cell: (r) => dmyDash(r.date) },
    { head: 'Voucher', w: '96px', wide: true, cell: (r) => r.vchrNo },
    { head: 'Type', w: '130px', wide: true, cell: (r) => r.typeName },
    {
      head: 'Particulars',
      w: 'minmax(140px,1fr)',
      cell: (r) => r.particulars || '—',
      total: 'Total',
    },
    { head: 'Ref', w: '96px', wide: true, cell: (r) => r.refNo },
    {
      head: 'Debit',
      w: '110px',
      num: true,
      cell: (r) => amt(r.debit),
      total: amt(sum(active, (r) => r.debit)),
    },
    {
      head: 'Credit',
      w: '110px',
      num: true,
      wide: true,
      cell: (r) => amt(r.credit),
      total: amt(sum(active, (r) => r.credit)),
    },
  ];
  return (
    <>
      <ReportPage
        title={['Day', 'Book']}
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
          rowKey={(r) => r.id}
          empty={rm.noVouchers}
          muted={(r) => r.status === 'Cancelled'}
          onRow={setOpen}
          minWidth={820}
        />
      </ReportPage>
      <Dialog
        open={!!open}
        onClose={() => setOpen(null)}
        title={[open?.typeName ?? '', open?.vchrNo ?? '']}
        className="w-[560px]"
      >
        <p className="m-0 px-[26px] pt-1 font-mono text-xs text-muted-foreground">
          {open && dmyDash(open.date)}
          {open?.status === 'Cancelled' ? ' · Cancelled' : ''}
        </p>
        <div className="mt-3 grid grid-cols-[minmax(0,1fr)_110px_110px] gap-x-3 border-y border-border px-[26px] py-2 font-mono text-[11px] uppercase text-muted-foreground max-sm:px-4">
          <span>Ledger</span>
          <span className="text-right">Debit</span>
          <span className="text-right">Credit</span>
        </div>
        <div className="max-h-[50vh] overflow-y-auto">
          {(lines.data ?? []).length === 0 && (
            <p className="m-0 px-[26px] py-6 text-center text-sm text-muted-foreground">
              {lines.isLoading ? '…' : 'Stock only — no ledger lines.'}
            </p>
          )}
          {(lines.data ?? []).map((l) => (
            <div
              key={l.lineNo}
              className="grid grid-cols-[minmax(0,1fr)_110px_110px] gap-x-3 border-b border-border px-[26px] py-2 text-sm max-sm:px-4"
            >
              <span className="truncate">{l.accName ?? l.accCode}</span>
              <span className="text-right font-mono">{l.dr ? amt(l.dr) : ''}</span>
              <span className="text-right font-mono">{l.cr ? amt(l.cr) : ''}</span>
            </div>
          ))}
        </div>
        <div className="flex justify-end px-[26px] py-3 max-sm:px-4">
          <button
            type="button"
            onClick={() => setOpen(null)}
            className="flex h-11 cursor-pointer items-center border-[1.5px] border-foreground px-[18px] text-sm font-semibold"
          >
            Close
          </button>
        </div>
      </Dialog>
    </>
  );
}

// ── Sales Register ─────────────────────────────────────────────────────────────

type SaleRow = OkBody<
  Awaited<ReturnType<(typeof api.api.reports)['sales-register']['$get']>>
>[number];

export function SalesRegisterScreen() {
  const [p, setP] = usePeriod();
  const [cancelled, setCancelled] = useState(false);
  const q = useQuery({
    queryKey: ['report', 'sales-register', p, cancelled],
    enabled: !!p && p.from <= p.to,
    queryFn: () =>
      unwrap(
        api.api.reports['sales-register'].$get({
          query: { from: p!.from, to: p!.to, ...(cancelled ? { cancelled: '1' } : {}) },
        }),
      ),
  });
  if (!p)
    return (
      <ReportPage title={['Sales', 'Register']} subtitle="" filters={null}>
        {null}
      </ReportPage>
    );
  const rows = q.data ?? [];
  const active = rows.filter((r) => r.status !== 'Cancelled');
  const total = (f: (r: SaleRow) => number) => amt(sum(active, f));
  const cols: Col<SaleRow>[] = [
    { head: 'Date', w: '92px', wide: true, cell: (r) => dmyDash(r.billDate) },
    { head: 'Bill No', w: '96px', cell: (r) => r.billNo },
    {
      head: 'Customer',
      w: 'minmax(130px,1fr)',
      wide: true,
      cell: (r) => r.custName,
      total: 'Total',
    },
    { head: 'GSTIN', w: '140px', wide: true, cell: (r) => r.gstNo },
    { head: 'Mode', w: '58px', wide: true, cell: (r) => r.payMode },
    {
      head: 'Taxable',
      w: '100px',
      num: true,
      wide: true,
      cell: (r) => amt(r.taxable),
      total: total((r) => r.taxable),
    },
    {
      head: 'CGST',
      w: '84px',
      num: true,
      wide: true,
      cell: (r) => amt(r.cgst),
      total: total((r) => r.cgst),
    },
    {
      head: 'SGST',
      w: '84px',
      num: true,
      wide: true,
      cell: (r) => amt(r.sgst),
      total: total((r) => r.sgst),
    },
    {
      head: 'IGST',
      w: '84px',
      num: true,
      wide: true,
      cell: (r) => amt(r.igst),
      total: total((r) => r.igst),
    },
    {
      head: 'Disc',
      w: '76px',
      num: true,
      wide: true,
      cell: (r) => amt(r.discount),
      total: total((r) => r.discount),
    },
    {
      head: 'R/Off',
      w: '64px',
      num: true,
      wide: true,
      cell: (r) => amt(r.roundOff),
      total: total((r) => r.roundOff),
    },
    { head: 'Net', w: '108px', num: true, cell: (r) => amt(r.net), total: total((r) => r.net) },
  ];
  return (
    <ReportPage
      title={['Sales', 'Register']}
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
        empty={rm.noSales}
        muted={(r) => r.status === 'Cancelled'}
        minWidth={1180}
      />
    </ReportPage>
  );
}
