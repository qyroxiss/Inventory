// Stock Register (user's request, 2026-11-11; MDA has none): each item's stock movements in a
// period, run like a ledger, with Opening and Closing. One item or several (ticked, or All
// items); Show narrows the rows to Purchase or Sales (docs/design/REPORTS.md).

import {
  REGISTER_SHOW,
  REGISTER_SHOW_LABELS,
  VCHR_KINDS,
  reportMessages as rm,
  type RegisterItem,
  type RegisterLine,
  type RegisterShow,
} from '@qi/core';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api, unwrap } from '../../api.ts';
import { Dialog } from '../../components/Dialog.tsx';
import { SearchSelect } from '../../components/SearchSelect.tsx';
import { boxClass, dmy } from '../transactions/shared.tsx';
import {
  PeriodDate,
  ReportPage,
  ReportTable,
  amt,
  defaultPeriod,
  qty,
  useBook,
  type Col,
} from './shared.tsx';

type Row = {
  key: string;
  kind: 'item' | 'open' | 'line' | 'close';
  item: RegisterItem;
  line?: RegisterLine;
};

const label = 'flex flex-col gap-0.5 text-[13px] font-semibold text-muted-foreground';

export function StockRegisterScreen() {
  const book = useBook();
  const [p, setP] = useState<{ from: string; to: string } | null>(null);
  useEffect(() => {
    if (book && !p) setP(defaultPeriod(book.fyFrom, book.fyTo));
  }, [book]);
  const [show, setShow] = useState<RegisterShow>('all');
  const [mode, setMode] = useState<'single' | 'multi'>('single');
  const [single, setSingle] = useState('');
  const [all, setAll] = useState(true);
  const [picked, setPicked] = useState<string[]>([]);
  const [picking, setPicking] = useState(false);
  const [filter, setFilter] = useState('');

  const itemList = useQuery({
    queryKey: ['stock-items'],
    queryFn: () => unwrap(api.api['stock-items'].$get()),
  });
  const items = itemList.data ?? [];

  const codes = mode === 'single' ? (single ? [single] : []) : all ? null : picked;
  const ready = !!p && p.from <= p.to && (codes === null || codes.length > 0);
  const q = useQuery({
    queryKey: ['report', 'stock-register', p, show, codes],
    enabled: ready,
    queryFn: () =>
      unwrap(
        api.api.reports['stock-register'].$get({
          query: {
            from: p!.from,
            to: p!.to,
            show,
            ...(codes ? { items: codes.join(',') } : {}),
          },
        }),
      ),
  });

  if (!p)
    return (
      <ReportPage title={['Stock', 'Register']} subtitle="" filters={null}>
        {null}
      </ReportPage>
    );

  const rows: Row[] = (ready ? (q.data ?? []) : []).flatMap((it) => [
    { key: `${it.code}-h`, kind: 'item' as const, item: it },
    { key: `${it.code}-o`, kind: 'open' as const, item: it },
    ...it.lines.map((line, i) => ({
      key: `${it.code}-${i}`,
      kind: 'line' as const,
      item: it,
      line,
    })),
    { key: `${it.code}-c`, kind: 'close' as const, item: it },
  ]);

  const ln = (r: Row) => (r.kind === 'line' ? r.line! : null);
  const cols: Col<Row>[] = [
    { head: 'Date', w: '86px', cell: (r) => (ln(r) ? dmy(ln(r)!.date) : '') },
    {
      head: 'Type',
      w: '120px',
      wide: true,
      cell: (r) => (ln(r) ? (VCHR_KINDS[ln(r)!.vchrType]?.[0] ?? ln(r)!.vchrType) : ''),
    },
    { head: 'Bill No', w: '100px', wide: true, cell: (r) => ln(r)?.billNo ?? '' },
    {
      head: 'Particulars',
      w: 'minmax(140px,1fr)',
      cell: (r) =>
        r.kind === 'open'
          ? 'Opening Balance'
          : r.kind === 'close'
            ? 'Closing Balance'
            : (ln(r)?.particulars ?? ''),
    },
    {
      head: 'Inward',
      w: '84px',
      num: true,
      cell: (r) =>
        r.kind === 'close' ? qty(r.item.inward) : ln(r)?.inQty ? qty(ln(r)!.inQty) : '',
    },
    {
      head: 'Outward',
      w: '84px',
      num: true,
      cell: (r) =>
        r.kind === 'close' ? qty(r.item.outward) : ln(r)?.outQty ? qty(ln(r)!.outQty) : '',
    },
    // Balance sits right after the quantities, before Rate (user's request, 2026-11-11).
    {
      head: 'Balance',
      w: '96px',
      num: true,
      cell: (r) =>
        r.kind === 'open'
          ? qty(r.item.opening)
          : r.kind === 'close'
            ? qty(r.item.closing)
            : ln(r)
              ? qty(ln(r)!.balance)
              : '',
    },
    {
      head: 'Rate',
      w: '90px',
      num: true,
      wide: true,
      cell: (r) => (ln(r) ? amt(ln(r)!.rate) : ''),
    },
    {
      head: 'Amount',
      w: '110px',
      num: true,
      wide: true,
      cell: (r) => (ln(r) ? amt(ln(r)!.amount) : ''),
    },
  ];

  const pickedLabel = all
    ? 'All items'
    : picked.length === 0
      ? 'Select items…'
      : `${picked.length} item${picked.length > 1 ? 's' : ''} selected`;
  const singleName = items.find((i) => i.code === single)?.name;
  const subtitle = [
    `From ${dmy(p.from)} to ${dmy(p.to)}`,
    mode === 'single' ? singleName : all ? 'All items' : pickedLabel,
    show === 'all' ? '' : REGISTER_SHOW_LABELS[show],
  ]
    .filter(Boolean)
    .join(' · ');
  const shown = items.filter(
    (i) =>
      !filter ||
      i.name.toLowerCase().includes(filter.toLowerCase()) ||
      i.code.toLowerCase().includes(filter.toLowerCase()),
  );
  const toggle = (code: string) =>
    setPicked((s) => (s.includes(code) ? s.filter((c) => c !== code) : [...s, code]));

  return (
    <ReportPage
      title={['Stock', 'Register']}
      subtitle={subtitle}
      filters={
        <>
          <PeriodDate
            id="rp-from"
            label="From"
            value={p.from}
            onChange={(from) => setP({ ...p, from })}
          />
          <PeriodDate id="rp-to" label="To" value={p.to} onChange={(to) => setP({ ...p, to })} />
          <fieldset className={`${label} m-0 border-0 p-0`}>
            <legend className="mb-0.5 p-0">Item</legend>
            <div className="flex h-[34px] items-center gap-3 text-sm font-normal text-foreground">
              {(['single', 'multi'] as const).map((m) => (
                <label key={m} className="flex cursor-pointer items-center gap-1.5">
                  <input
                    type="radio"
                    name="rp-mode"
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
            <label htmlFor="rp-item" className={`${label} w-72 max-sm:w-full`}>
              Stock Item
              <SearchSelect
                id="rp-item"
                compact
                value={single}
                options={items.map((i) => ({ value: i.code, label: i.name }))}
                placeholder="Search item…"
                onCommit={(v) => setSingle(v)}
              />
            </label>
          ) : (
            <label htmlFor="rp-items" className={`${label} w-56 max-sm:w-full`}>
              Stock Items
              <button
                id="rp-items"
                type="button"
                onClick={() => setPicking(true)}
                className={`${boxClass()} cursor-pointer text-left`}
              >
                {pickedLabel}
              </button>
            </label>
          )}
          <label htmlFor="rp-show" className={`${label} w-36`}>
            Show
            <select
              id="rp-show"
              value={show}
              onChange={(e) => setShow(e.target.value as RegisterShow)}
              className={`${boxClass()} cursor-pointer`}
            >
              {REGISTER_SHOW.map((s) => (
                <option key={s} value={s}>
                  {REGISTER_SHOW_LABELS[s]}
                </option>
              ))}
            </select>
          </label>
          {p.from > p.to && (
            <span className="pb-2 text-[13px] text-destructive">{rm.badRange}</span>
          )}
        </>
      }
    >
      {codes !== null && codes.length === 0 ? (
        <p className="m-0 py-10 text-center text-sm text-muted-foreground">{rm.pickItem}</p>
      ) : (
        <ReportTable
          cols={cols}
          rows={rows}
          rowKey={(r) => r.key}
          empty={q.isLoading ? '' : rm.noMovements}
          minWidth={1014}
          scrollOnPhone
          fullRow={(r) =>
            r.kind === 'item' ? (
              <>
                {r.item.name}
                <span className="ml-2 font-mono text-xs font-normal text-muted-foreground">
                  {r.item.code}
                  {r.item.unit ? ` · ${r.item.unit}` : ''}
                </span>
              </>
            ) : null
          }
          rowClass={(r) => (r.kind === 'line' ? '' : 'font-semibold')}
        />
      )}
      <p className="m-0 text-xs text-muted-foreground print:text-black">
        Opening is the item&apos;s opening stock plus every movement before From. Balance is the
        stock after each entry; Closing is the stock on To.
        {show !== 'all'
          ? ` Showing ${REGISTER_SHOW_LABELS[show]} Invoices and Returns only; Opening, Balance and Closing still count every movement.`
          : ''}
      </p>

      <Dialog
        open={picking}
        onClose={() => setPicking(false)}
        title={['Stock', 'Items']}
        className="w-[420px] max-sm:w-[calc(100vw-32px)]"
      >
        <div className="flex flex-col gap-2 px-[26px] pb-[22px] pt-3">
          <label className="flex cursor-pointer items-center gap-2 border-b border-border pb-2 text-sm font-semibold">
            <input
              type="checkbox"
              checked={all}
              onChange={(e) => setAll(e.target.checked)}
              className="size-4 accent-[var(--primary)]"
            />
            All items
          </label>
          <input
            aria-label="Search items"
            value={filter}
            disabled={all}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search item…"
            className={boxClass()}
          />
          <div className="flex max-h-[45vh] flex-col overflow-auto">
            {shown.map((i) => (
              <label
                key={i.code}
                className={`flex cursor-pointer items-center gap-2 px-1 py-1 text-sm hover:bg-accent ${all ? 'opacity-50' : ''}`}
              >
                <input
                  type="checkbox"
                  disabled={all}
                  checked={all || picked.includes(i.code)}
                  onChange={() => toggle(i.code)}
                  className="size-4 accent-[var(--primary)]"
                />
                <span className="flex-1 truncate">{i.name}</span>
                <span className="font-mono text-xs text-muted-foreground">{i.code}</span>
              </label>
            ))}
            {shown.length === 0 && (
              <p className="m-0 py-4 text-center text-sm text-muted-foreground">{rm.noStock}</p>
            )}
          </div>
          <div className="flex items-center gap-2 border-t border-border pt-2">
            <span className="flex-1 text-xs text-muted-foreground">{pickedLabel}</span>
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
