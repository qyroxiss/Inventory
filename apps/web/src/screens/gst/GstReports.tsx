// GST Reports (docs/design/GST-REPORTS.md): GSTR-1, GSTR-3B, GST Audit, HSN Summary and Input
// Tax Credit. Each opens on the current month of the open year; Month picks another, or From and
// To set any period inside the year.

import {
  B2CL_LIMIT,
  gstMessages as gm,
  type B2csRow,
  type HsnRow,
  type InvoiceRateRow,
} from '@qi/core';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { api, unwrap, type OkBody } from '../../api.ts';
import { dmyDash } from '../transactions/shared.tsx';
import {
  MonthPicker,
  PeriodDate,
  ReportPage,
  ReportTable,
  amt,
  qty,
  useBook,
  yearMonths,
  type Col,
} from '../reports/shared.tsx';

type Period = { from: string; to: string };

/** The current month of the open year (its first month when today is outside it). */
function useMonth() {
  const book = useBook();
  const [p, setP] = useState<Period | null>(null);
  useEffect(() => {
    if (!book || p) return;
    const today = new Date().toISOString().slice(0, 10);
    const months = yearMonths(book.fyFrom, book.fyTo);
    const m = months.find((x) => today >= x.from && today <= x.to) ?? months[0];
    if (m) setP({ from: m.from, to: m.to });
  }, [book]);
  return [p, setP] as const;
}

const line = (p: Period) => `From ${dmyDash(p.from)} to ${dmyDash(p.to)}`;
const sum = <T,>(rows: T[], f: (r: T) => number) => rows.reduce((a, r) => a + f(r), 0);

function Filters({
  p,
  set,
  children,
}: {
  p: Period;
  set: (p: Period) => void;
  children?: ReactNode;
}) {
  return (
    <>
      <MonthPicker p={p} set={set} />
      <PeriodDate
        id="rp-from"
        label="From"
        value={p.from}
        onChange={(from) => set({ ...p, from })}
      />
      <PeriodDate id="rp-to" label="To" value={p.to} onChange={(to) => set({ ...p, to })} />
      {children}
    </>
  );
}

/** A segmented switch (GSTR-1 sections, Outward / Inward). */
function Segments<K extends string>({
  value,
  options,
  onChange,
}: {
  value: K;
  options: { key: K; label: string }[];
  onChange: (k: K) => void;
}) {
  return (
    <div role="tablist" className="flex flex-wrap gap-1.5 print:hidden">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          role="tab"
          aria-selected={value === o.key}
          onClick={() => onChange(o.key)}
          className={`flex h-9 cursor-pointer items-center border-[1.5px] px-3 text-sm font-semibold ${
            value === o.key
              ? 'border-foreground bg-foreground text-card'
              : 'border-border bg-card hover:border-foreground'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** A row of headline figures above a report. */
const Figures = ({ items }: { items: [string, string][] }) => (
  <div className="flex flex-wrap gap-x-6 gap-y-1 border border-border bg-card px-3 py-2 print:border-black print:bg-white">
    {items.map(([label, value]) => (
      <span key={label} className="flex items-baseline gap-1.5">
        <span className="text-xs text-muted-foreground print:text-black">{label}</span>
        <span className="font-mono text-sm font-bold">{value}</span>
      </span>
    ))}
  </div>
);

const taxCols = <T extends { taxable: number; igst: number; cgst: number; sgst: number }>(
  rows: T[],
): Col<T>[] => [
  {
    head: 'Taxable',
    w: '110px',
    num: true,
    cell: (r) => amt(r.taxable),
    total: amt(sum(rows, (r) => r.taxable)),
  },
  {
    head: 'IGST',
    w: '96px',
    num: true,
    wide: true,
    cell: (r) => amt(r.igst),
    total: amt(sum(rows, (r) => r.igst)),
  },
  {
    head: 'CGST',
    w: '96px',
    num: true,
    wide: true,
    cell: (r) => amt(r.cgst),
    total: amt(sum(rows, (r) => r.cgst)),
  },
  {
    head: 'SGST',
    w: '96px',
    num: true,
    wide: true,
    cell: (r) => amt(r.sgst),
    total: amt(sum(rows, (r) => r.sgst)),
  },
];

// ── GSTR-1 ─────────────────────────────────────────────────────────────────────

type Section = 'b2b' | 'b2cl' | 'b2cs' | 'hsn';

export function Gstr1Screen() {
  const [p, setP] = useMonth();
  const [section, setSection] = useState<Section>('b2b');
  const q = useQuery({
    queryKey: ['gst', 'gstr1', p],
    enabled: !!p && p.from <= p.to,
    queryFn: () => unwrap(api.api.gst.gstr1.$get({ query: p! })),
  });
  if (!p)
    return (
      <ReportPage section="gst-reports" title={['GSTR-1', '']} subtitle="" filters={null}>
        {null}
      </ReportPage>
    );
  const r = q.data;
  const invoiceCols = (rows: InvoiceRateRow[], withGstin: boolean): Col<InvoiceRateRow>[] => [
    ...(withGstin ? [{ head: 'GSTIN', w: '150px', cell: (x: InvoiceRateRow) => x.gstin }] : []),
    { head: 'Party', w: 'minmax(120px,1fr)', wide: true, cell: (x) => x.partyName },
    { head: 'Invoice', w: '96px', cell: (x) => x.billNo },
    { head: 'Date', w: '92px', wide: true, cell: (x) => dmyDash(x.date) },
    { head: 'Value', w: '104px', num: true, wide: true, cell: (x) => amt(x.value) },
    { head: 'Place of Supply', w: '150px', wide: true, cell: (x) => x.pos },
    { head: 'Rate', w: '56px', num: true, wide: true, cell: (x) => `${x.rate}%` },
    ...taxCols(rows),
  ];
  const b2csCols = (rows: B2csRow[]): Col<B2csRow>[] => [
    { head: 'Place of Supply', w: 'minmax(150px,1fr)', cell: (x) => x.pos },
    { head: 'Type', w: '64px', wide: true, cell: (x) => x.type },
    { head: 'Rate', w: '56px', num: true, cell: (x) => `${x.rate}%` },
    ...taxCols(rows),
  ];
  return (
    <ReportPage
      section="gst-reports"
      title={['GSTR-1', '']}
      subtitle={`Outward supplies · ${line(p)}`}
      filters={<Filters p={p} set={setP} />}
    >
      {r && (
        <>
          <Figures
            items={[
              ['B2B invoices', String(r.counts.b2b)],
              ['B2C Large', String(r.counts.b2cl)],
              ['B2C Small', String(r.counts.b2c)],
              ['Taxable', amt(r.totals.taxable)],
              ['IGST', amt(r.totals.igst)],
              ['CGST', amt(r.totals.cgst)],
              ['SGST', amt(r.totals.sgst)],
              ['Nil / exempt', amt(r.nil.taxable)],
            ]}
          />
          <Segments<Section>
            value={section}
            onChange={setSection}
            options={[
              { key: 'b2b', label: `B2B (${r.b2b.length})` },
              { key: 'b2cl', label: `B2C Large (${r.b2cl.length})` },
              { key: 'b2cs', label: `B2C Small (${r.b2cs.length})` },
              { key: 'hsn', label: `HSN (${r.hsn.length})` },
            ]}
          />
          {section === 'b2b' && (
            <ReportTable
              cols={invoiceCols(r.b2b, true)}
              rows={r.b2b}
              rowKey={(x) => `${x.billNo}|${x.rate}`}
              empty="No B2B invoices in this period"
              minWidth={1180}
            />
          )}
          {section === 'b2cl' && (
            <ReportTable
              cols={invoiceCols(r.b2cl, false)}
              rows={r.b2cl}
              rowKey={(x) => `${x.billNo}|${x.rate}`}
              empty={`No inter-state B2C invoices above ₹${amt(B2CL_LIMIT)} in this period`}
              minWidth={1030}
            />
          )}
          {section === 'b2cs' && (
            <ReportTable
              cols={b2csCols(r.b2cs)}
              rows={r.b2cs}
              rowKey={(x) => `${x.pos}|${x.rate}`}
              empty="No B2C Small supplies in this period"
              minWidth={700}
            />
          )}
          {section === 'hsn' && <HsnTable rows={r.hsn} />}
        </>
      )}
    </ReportPage>
  );
}

function HsnTable({ rows }: { rows: HsnRow[] }) {
  const cols: Col<HsnRow>[] = [
    { head: 'HSN', w: '90px', cell: (x) => x.hsn || '—' },
    { head: 'Description', w: 'minmax(120px,1fr)', wide: true, cell: (x) => x.description },
    { head: 'UQC', w: '60px', wide: true, cell: (x) => x.uqc },
    { head: 'Qty', w: '84px', num: true, wide: true, cell: (x) => qty(x.qty) },
    { head: 'Rate', w: '56px', num: true, cell: (x) => `${x.rate}%` },
    ...taxCols(rows),
    {
      head: 'Total',
      w: '110px',
      num: true,
      wide: true,
      cell: (x) => amt(x.total),
      total: amt(sum(rows, (x) => x.total)),
    },
  ];
  return (
    <ReportTable
      cols={cols}
      rows={rows}
      rowKey={(x) => `${x.hsn}|${x.rate}`}
      empty="Nothing in this period"
      minWidth={960}
    />
  );
}

// ── GSTR-3B ────────────────────────────────────────────────────────────────────

type Gstr3b = OkBody<Awaited<ReturnType<typeof api.api.gst.gstr3b.$get>>>;
type HeadRow = {
  label: string;
  igst: number;
  cgst: number;
  sgst: number;
  taxable?: number;
  strong?: boolean;
};

export function Gstr3bScreen() {
  const [p, setP] = useMonth();
  const q = useQuery({
    queryKey: ['gst', 'gstr3b', p],
    enabled: !!p && p.from <= p.to,
    queryFn: () => unwrap(api.api.gst.gstr3b.$get({ query: p! })),
  });
  if (!p)
    return (
      <ReportPage section="gst-reports" title={['GSTR-3B', '']} subtitle="" filters={null}>
        {null}
      </ReportPage>
    );
  const r: Gstr3b | undefined = q.data;
  const headCols: Col<HeadRow>[] = [
    {
      head: 'Particulars',
      w: 'minmax(180px,1fr)',
      cell: (x) => <span className={x.strong ? 'font-bold' : ''}>{x.label}</span>,
    },
    {
      head: 'Taxable',
      w: '120px',
      num: true,
      wide: true,
      cell: (x) => (x.taxable === undefined ? '' : amt(x.taxable)),
    },
    { head: 'IGST', w: '110px', num: true, cell: (x) => amt(x.igst) },
    { head: 'CGST', w: '110px', num: true, cell: (x) => amt(x.cgst) },
    { head: 'SGST', w: '110px', num: true, cell: (x) => amt(x.sgst) },
  ];
  const title = (t: string) => (
    <h2 className="m-0 font-mono text-xs font-medium uppercase tracking-[0.12em] text-primary-text print:text-black">
      {t}
    </h2>
  );
  return (
    <ReportPage
      section="gst-reports"
      title={['GSTR-3B', '']}
      subtitle={`Summary return · ${line(p)}`}
      filters={<Filters p={p} set={setP} />}
    >
      {r && (
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto print:overflow-visible">
          {title('3.1 Outward supplies')}
          <ReportTable
            cols={headCols}
            rowKey={(x) => x.label}
            empty=""
            grow={false}
            rows={[
              {
                label: '(a) Outward taxable supplies (other than nil rated and exempted)',
                ...r.outward,
              },
              {
                label: '(c) Nil rated and exempted',
                taxable: r.nilExempt,
                igst: 0,
                cgst: 0,
                sgst: 0,
              },
            ]}
          />
          {title('4 Eligible input tax credit')}
          <ReportTable
            cols={headCols}
            rowKey={(x) => x.label}
            empty=""
            grow={false}
            rows={[
              { label: '(A)(5) All other ITC — purchases from registered suppliers', ...r.itc },
            ]}
          />
          {title('6.1 Payment of tax')}
          <ReportTable
            cols={headCols}
            rowKey={(x) => x.label}
            empty=""
            grow={false}
            rows={[
              {
                label: 'Tax payable',
                igst: r.outward.igst,
                cgst: r.outward.cgst,
                sgst: r.outward.sgst,
              },
              { label: 'Paid through ITC', ...r.paidByItc },
              { label: 'Payable in cash', ...r.cash, strong: true },
              { label: 'ITC carried forward', ...r.carryForward },
            ]}
          />
          <p className="m-0 text-xs text-muted-foreground print:text-black">
            Credit is set off as the law orders it: IGST credit pays IGST first, then CGST and SGST;
            CGST credit pays CGST, then IGST; SGST credit pays SGST, then IGST. Credit on purchases
            from suppliers without a valid GSTIN is left out (see Input Tax Credit).
          </p>
        </div>
      )}
    </ReportPage>
  );
}

// ── HSN Summary ────────────────────────────────────────────────────────────────

export function HsnSummaryScreen() {
  const [p, setP] = useMonth();
  const [side, setSide] = useState<'out' | 'in'>('out');
  const q = useQuery({
    queryKey: ['gst', 'hsn', p, side],
    enabled: !!p && p.from <= p.to,
    queryFn: () => unwrap(api.api.gst.hsn.$get({ query: { ...p!, side } })),
  });
  if (!p)
    return (
      <ReportPage section="gst-reports" title={['HSN', 'Summary']} subtitle="" filters={null}>
        {null}
      </ReportPage>
    );
  return (
    <ReportPage
      section="gst-reports"
      title={['HSN', 'Summary']}
      subtitle={`${side === 'out' ? 'Outward (sales)' : 'Inward (purchases)'} · ${line(p)}`}
      filters={
        <Filters p={p} set={setP}>
          <Segments<'out' | 'in'>
            value={side}
            onChange={setSide}
            options={[
              { key: 'out', label: 'Outward (sales)' },
              { key: 'in', label: 'Inward (purchases)' },
            ]}
          />
        </Filters>
      }
    >
      <HsnTable rows={q.data ?? []} />
    </ReportPage>
  );
}

// ── Input Tax Credit ───────────────────────────────────────────────────────────

type ItcRow = OkBody<Awaited<ReturnType<typeof api.api.gst.itc.$get>>>[number];

export function ItcScreen() {
  const [p, setP] = useMonth();
  const q = useQuery({
    queryKey: ['gst', 'itc', p],
    enabled: !!p && p.from <= p.to,
    queryFn: () => unwrap(api.api.gst.itc.$get({ query: p! })),
  });
  if (!p)
    return (
      <ReportPage section="gst-reports" title={['Input Tax', 'Credit']} subtitle="" filters={null}>
        {null}
      </ReportPage>
    );
  const rows = q.data ?? [];
  const ok = rows.filter((r) => r.eligible);
  const cols: Col<ItcRow>[] = [
    { head: 'Date', w: '92px', wide: true, cell: (r) => dmyDash(r.date) },
    { head: 'Bill No', w: '90px', cell: (r) => r.billNo },
    { head: 'Supp. Inv', w: '90px', wide: true, cell: (r) => r.suppInvNo },
    { head: 'Supplier', w: 'minmax(120px,1fr)', wide: true, cell: (r) => r.supplier },
    { head: 'GSTIN', w: '150px', wide: true, cell: (r) => r.gstin || '—' },
    {
      head: 'Taxable',
      w: '104px',
      num: true,
      wide: true,
      cell: (r) => amt(r.taxable),
      total: amt(sum(ok, (r) => r.taxable)),
    },
    {
      head: 'IGST',
      w: '90px',
      num: true,
      wide: true,
      cell: (r) => amt(r.igst),
      total: amt(sum(ok, (r) => r.igst)),
    },
    {
      head: 'CGST',
      w: '90px',
      num: true,
      wide: true,
      cell: (r) => amt(r.cgst),
      total: amt(sum(ok, (r) => r.cgst)),
    },
    {
      head: 'SGST',
      w: '90px',
      num: true,
      wide: true,
      cell: (r) => amt(r.sgst),
      total: amt(sum(ok, (r) => r.sgst)),
    },
    {
      head: 'ITC',
      w: '100px',
      num: true,
      cell: (r) => amt(r.itc),
      total: amt(sum(ok, (r) => r.itc)),
    },
    {
      head: 'Status',
      w: '96px',
      cell: (r) =>
        r.eligible ? (
          <span className="text-primary-text">Eligible</span>
        ) : (
          <span className="text-destructive">No GSTIN</span>
        ),
    },
  ];
  return (
    <ReportPage
      section="gst-reports"
      title={['Input Tax', 'Credit']}
      subtitle={line(p)}
      filters={<Filters p={p} set={setP} />}
    >
      <ReportTable
        cols={cols}
        rows={rows}
        rowKey={(r) => r.billNo}
        empty="No purchases in this period"
        minWidth={1180}
      />
      <p className="m-0 text-xs text-muted-foreground print:text-black">
        Totals count eligible credit only — purchases from suppliers with a valid GSTIN.
      </p>
    </ReportPage>
  );
}

// ── GST Audit ──────────────────────────────────────────────────────────────────

export function GstAuditScreen() {
  const [p, setP] = useMonth();
  const q = useQuery({
    queryKey: ['gst', 'audit', p],
    enabled: !!p && p.from <= p.to,
    queryFn: () => unwrap(api.api.gst.audit.$get({ query: p! })),
  });
  if (!p)
    return (
      <ReportPage section="gst-reports" title={['GST', 'Audit']} subtitle="" filters={null}>
        {null}
      </ReportPage>
    );
  const found = q.data ?? [];
  const errors = found.filter((f) => f.level === 'error').length;
  return (
    <ReportPage
      section="gst-reports"
      title={['GST', 'Audit']}
      subtitle={line(p)}
      filters={<Filters p={p} set={setP} />}
    >
      {q.data && (
        <>
          <Figures
            items={[
              ['Errors', String(errors)],
              ['Warnings', String(found.length - errors)],
            ]}
          />
          <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto print:overflow-visible">
            {found.length === 0 && (
              <p className="m-0 border border-border bg-card px-4 py-6 text-center text-sm text-primary-text">
                ✓ {gm.allClear}
              </p>
            )}
            {found.map((f, i) => (
              <div
                key={i}
                className={`flex items-start gap-3 border-l-4 bg-card px-3 py-2 print:break-inside-avoid ${
                  f.level === 'error' ? 'border-destructive' : 'border-amber-500'
                }`}
              >
                <span
                  className={`mt-0.5 w-[72px] flex-none text-xs font-bold uppercase ${
                    f.level === 'error' ? 'text-destructive' : 'text-amber-700 dark:text-amber-400'
                  }`}
                >
                  {f.level}
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
                    {f.area}
                  </span>
                  <span className="text-sm">{f.text}</span>
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </ReportPage>
  );
}
