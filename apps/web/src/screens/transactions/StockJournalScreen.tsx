// Stock Journal. MDA lists it as "Not built yet", so the screen follows the other transaction
// screens' look and keys (docs/design/TRANSACTIONS.md):
//   - Voucher No (STJ-001…) | Date | Narration.
//   - Consumption (Source): items going out, each from a godown, showing what's in hand.
//   - Production (Destination): items coming in, each into a godown.
//   - Save checks the source against stock in hand; it posts no ledger lines.
//   - View lists them; picking one opens it to update or cancel. Cancelling reverses the stock.

import {
  f2,
  stjLine,
  stjTotals,
  stockJournalMessages as jm,
  type StjLine,
  type StjSide,
} from '@qi/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { api, unwrap, type OkBody } from '../../api.ts';
import { ConfirmDelete, Dialog } from '../../components/Dialog.tsx';
import { toast } from '../../components/Toast.tsx';
import { DateBox, defaultVoucherDate, errorText } from '../vouchers/shared.tsx';
import {
  BAR_BTN,
  Cell,
  Chip,
  ItemGrid,
  Lookup,
  NumBox,
  ReadOnly,
  Total,
  TransactionPage,
  boxClass,
  dmyDash,
  enterToNext,
  focusNav,
  type GridCol,
} from './shared.tsx';

type Setup = OkBody<Awaited<ReturnType<typeof api.api.purchases.setup.$get>>>;
type Item = Setup['items'][number];
type Godown = Setup['godowns'][number];
type Row = OkBody<Awaited<ReturnType<(typeof api.api)['stock-journals']['$get']>>>[number];

type Entry = { item: Item | null; godown: string; qty: string; rate: string; line: number | null };
const blankEntry = (): Entry => ({ item: null, godown: '', qty: '0.00', rate: '0.00', line: null });
const num = (s: string) => Number(s) || 0;

/** Enter order: the header, then each side's Item → Godown → Qty → Rate → Add. */
const NAV = {
  date: 1,
  narration: 2,
  out: { item: 10, godown: 11, qty: 12, rate: 13, add: 14 },
  in: { item: 20, godown: 21, qty: 22, rate: 23, add: 24 },
  save: 30,
} as const;

const SIDES: { side: StjSide; title: string }[] = [
  { side: 'out', title: 'Consumption (Source)' },
  { side: 'in', title: 'Production (Destination)' },
];

const fetchNo = async () => (await unwrap(api.api['stock-journals'].next.$get())).vchrNo;

export function StockJournalScreen() {
  const queryClient = useQueryClient();
  const me = useQuery({ queryKey: ['book-me'], queryFn: () => unwrap(api.api.book.me.$get()) });
  const setup = useQuery({
    queryKey: ['purchase-setup'],
    queryFn: () => unwrap(api.api.purchases.setup.$get()),
    staleTime: 0,
    gcTime: 0,
  });
  const data = setup.data;

  const [vchrNo, setVchrNo] = useState('');
  const [date, setDate] = useState('');
  const [narration, setNarration] = useState('');
  const [lines, setLines] = useState<StjLine[]>([]);
  const [entries, setEntries] = useState<Record<StjSide, Entry>>({
    out: blankEntry(),
    in: blankEntry(),
  });
  const [inHand, setInHand] = useState<number | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [cancelled, setCancelled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [list, setList] = useState<Row[] | null>(null);
  const [confirm, setConfirm] = useState(false);
  const started = useRef(false);

  const fresh = async () => {
    setVchrNo(await fetchNo());
    setDate(defaultVoucherDate(me.data?.fyFrom, me.data?.fyTo));
    setNarration('');
    setLines([]);
    setEntries({ out: blankEntry(), in: blankEntry() });
    setInHand(null);
    setEditId(null);
    setCancelled(false);
    focusNav(NAV.out.item);
  };

  useEffect(() => {
    if (!data || !me.data || started.current) return;
    started.current = true;
    void fresh();
  }, [data, me.data]);

  if (!data || !me.data || !vchrNo) {
    return <TransactionPage title={['Stock', 'Journal']}>{null}</TransactionPage>;
  }

  const totals = stjTotals(lines);
  const setE = (side: StjSide, patch: Partial<Entry>) =>
    setEntries((x) => ({ ...x, [side]: { ...x[side], ...patch } }));
  const sideLines = (side: StjSide) =>
    lines.map((l, i) => ({ l, i })).filter((x) => x.l.side === side);

  const onItem = async (side: StjSide, it: Item) => {
    setE(side, {
      item: it,
      rate: num(entries[side].rate) === 0 && it.purRate > 0 ? f2(it.purRate) : entries[side].rate,
    });
    focusNav(NAV[side].godown);
    if (side === 'out') {
      const r = await unwrap(
        api.api['stock-journals']['in-hand'].$get({ query: { item: it.code } }),
      );
      setInHand(r.qty);
    }
  };

  const add = (side: StjSide) => {
    const e = entries[side];
    if (!e.item) {
      toast(jm.selectItemFirst, 'error');
      return focusNav(NAV[side].item);
    }
    if (num(e.qty) <= 0) {
      toast(jm.qtyZero, 'error');
      return focusNav(NAV[side].qty);
    }
    const line = stjLine({
      side,
      itemCode: e.item.code,
      itemName: e.item.name,
      unit: e.item.unit,
      godown: e.godown.trim() || null,
      qty: num(e.qty),
      rate: num(e.rate),
    });
    setLines((ls) =>
      e.line !== null ? ls.map((l, i) => (i === e.line ? line : l)) : [...ls, line],
    );
    setE(side, blankEntry());
    if (side === 'out') setInHand(null);
    focusNav(NAV[side].item);
  };

  const edit = (side: StjSide, i: number) => {
    const l = lines[i]!;
    const it = data.items.find((x) => x.code === l.itemCode) ?? {
      code: l.itemCode,
      name: l.itemName,
      unit: l.unit,
      hsnNo: null,
      gstRate: 0,
      purRate: 0,
    };
    setE(side, { item: it, godown: l.godown ?? '', qty: f2(l.qty), rate: f2(l.rate), line: i });
    focusNav(NAV[side].qty);
  };

  const remove = (i: number) => {
    const side = lines[i]!.side;
    setLines((ls) => ls.filter((_, k) => k !== i));
    if (entries[side].line === i) setE(side, { line: null });
  };

  const save = async () => {
    if (saving) return;
    setSaving(true);
    const body = {
      vchrNo,
      date,
      narration,
      lines: lines.map((l) => ({
        side: l.side,
        itemCode: l.itemCode,
        itemName: l.itemName,
        unit: l.unit,
        godown: l.godown,
        qty: l.qty,
        rate: l.rate,
      })),
    };
    try {
      if (editId)
        await unwrap(api.api['stock-journals'][':id'].$put({ param: { id: editId }, json: body }));
      else await unwrap(api.api['stock-journals'].$post({ json: body }));
      toast(editId ? jm.updated(vchrNo) : jm.saved(vchrNo));
      await queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      await fresh();
    } catch (err) {
      toast(errorText(err), 'error');
    }
    setSaving(false);
  };

  const open = async (r: Row) => {
    setList(null);
    const ls = await unwrap(api.api['stock-journals'][':id'].lines.$get({ param: { id: r.id } }));
    setVchrNo(r.vchrNo);
    setDate(r.vchrDate);
    setNarration(r.narration);
    setLines(ls);
    setEntries({ out: blankEntry(), in: blankEntry() });
    setInHand(null);
    const isCancelled = r.status === 'Cancelled';
    setCancelled(isCancelled);
    setEditId(isCancelled ? null : r.id);
    if (isCancelled) toast(jm.shownCancelled(r.vchrNo), 'error');
  };

  const doCancel = async () => {
    if (!editId) return;
    setSaving(true);
    try {
      await unwrap(api.api['stock-journals'][':id'].cancel.$post({ param: { id: editId } }));
      toast(jm.cancelled(vchrNo));
      setConfirm(false);
      await fresh();
    } catch (err) {
      toast(errorText(err), 'error');
    }
    setConfirm(false);
    setSaving(false);
  };

  const panel = (side: StjSide, title: string) => {
    const e = entries[side];
    const nav = NAV[side];
    const mine = sideLines(side);
    return (
      <div
        key={side}
        className="flex min-h-0 min-w-0 flex-1 flex-col gap-1.5 border border-border bg-accent/40 px-3 py-2"
      >
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <h2 className="m-0 font-mono text-xs font-medium uppercase tracking-[0.12em] text-primary-text">
            {title}
          </h2>
          <span className="flex-1" />
          {e.line !== null && (
            <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">
              Editing line
            </span>
          )}
        </div>
        <div className="grid grid-cols-[3fr_2fr] gap-2 max-sm:grid-cols-1">
          <Cell id={`sj-${side}-item`} label="Item Name" required>
            <Lookup<Item>
              id={`sj-${side}-item`}
              nav={nav.item}
              value={e.item}
              items={data.items}
              hint="Type to search by name"
              searchTitle={['Select', 'Item']}
              onChange={(it) => void onItem(side, it)}
            />
          </Cell>
          <Cell id={`sj-${side}-godown`} label="Godown">
            {data.godowns.length ? (
              <Lookup<Godown>
                id={`sj-${side}-godown`}
                nav={nav.godown}
                value={data.godowns.find((g) => g.name === e.godown) ?? null}
                items={data.godowns}
                hint="Godown (optional)"
                searchTitle={['Select', 'Godown']}
                onChange={(g) => {
                  setE(side, { godown: g.name });
                  focusNav(nav.qty);
                }}
              />
            ) : (
              <input
                id={`sj-${side}-godown`}
                data-nav={nav.godown}
                value={e.godown}
                placeholder="Godown (optional)"
                autoComplete="off"
                onChange={(ev) => setE(side, { godown: ev.target.value })}
                className={boxClass()}
              />
            )}
          </Cell>
        </div>
        <div className="grid grid-cols-[repeat(3,minmax(0,1fr))_auto] items-end gap-2 max-sm:grid-cols-2">
          <Cell id={`sj-${side}-qty`} label="Quantity" required>
            <NumBox
              id={`sj-${side}-qty`}
              nav={nav.qty}
              value={e.qty}
              onChange={(qty) => setE(side, { qty })}
            />
          </Cell>
          <Cell id={`sj-${side}-rate`} label="Rate">
            <NumBox
              id={`sj-${side}-rate`}
              nav={nav.rate}
              value={e.rate}
              onChange={(rate) => setE(side, { rate })}
            />
          </Cell>
          <Cell
            label={side === 'out' && inHand !== null ? `Amount · In hand ${f2(inHand)}` : 'Amount'}
          >
            <ReadOnly text={f2(num(e.qty) * num(e.rate))} right />
          </Cell>
          <button
            type="button"
            data-nav={nav.add}
            onClick={() => add(side)}
            className="flex h-[34px] cursor-pointer items-center justify-center bg-primary px-5 text-[15px] font-semibold text-primary-foreground max-sm:col-span-2"
          >
            {e.line === null ? 'Add' : 'Update'}
          </button>
        </div>
        <ItemGrid
          cols={COLS}
          lines={mine.map((x) => x.l)}
          empty={jm.noLines}
          selected={mine.findIndex((x) => x.i === e.line)}
          minWidth={520}
          onEdit={(k) => edit(side, mine[k]!.i)}
          onRemove={(k) => remove(mine[k]!.i)}
        />
        <div className="flex flex-wrap items-center gap-x-5 border border-border bg-card px-3 py-1">
          <Total label="Qty" value={f2(side === 'out' ? totals.outQty : totals.inQty)} />
          <span className="flex-1" />
          <Total label="Value" value={f2(side === 'out' ? totals.outValue : totals.inValue)} />
        </div>
      </div>
    );
  };

  return (
    <>
      <TransactionPage
        title={['Stock', 'Journal']}
        chips={
          <>
            {editId && <Chip tone="warn">Editing {vchrNo}</Chip>}
            {cancelled && <Chip tone="warn">Cancelled</Chip>}
          </>
        }
      >
        <div
          className="flex min-h-0 flex-1 flex-col gap-2"
          onKeyDown={(e) =>
            enterToNext(e, {
              [NAV.narration]: NAV.out.item,
              [NAV.out.rate]: NAV.out.add,
              [NAV.in.rate]: NAV.in.add,
            })
          }
        >
          <div className="grid grid-cols-[1fr_1fr_3fr] gap-x-2.5 gap-y-1.5 border border-border bg-card px-3 py-2 max-md:grid-cols-2">
            <Cell label="Voucher No" required>
              <ReadOnly text={vchrNo} strong />
            </Cell>
            <Cell id="sj-date" label="Date" required>
              <DateBox
                id="sj-date"
                data-nav={NAV.date}
                value={date}
                min={me.data.fyFrom}
                max={me.data.fyTo}
                format={dmyDash}
                className={boxClass()}
                onChange={(d) => {
                  setDate(d);
                  focusNav(NAV.narration);
                }}
              />
            </Cell>
            <Cell id="sj-narration" label="Narration" className="max-md:col-span-2">
              <input
                id="sj-narration"
                data-nav={NAV.narration}
                value={narration}
                placeholder="Optional"
                autoComplete="off"
                onChange={(e) => setNarration(e.target.value)}
                className={boxClass()}
              />
            </Cell>
          </div>
          <div className="flex min-h-0 flex-1 gap-2 max-lg:flex-col">
            {SIDES.map((s) => panel(s.side, s.title))}
          </div>
        </div>

        <div className="flex flex-none flex-wrap items-center gap-2.5 border-t-[3px] border-double border-foreground pt-2 max-sm:[&>button]:flex-[1_1_40%]">
          <button
            type="button"
            onClick={async () => {
              try {
                setList(await unwrap(api.api['stock-journals'].$get()));
              } catch (err) {
                toast(errorText(err), 'error');
              }
            }}
            className={BAR_BTN}
          >
            View
          </button>
          <button type="button" onClick={() => void fresh()} className={BAR_BTN}>
            New
          </button>
          <button
            type="button"
            disabled={!editId}
            onClick={() => setConfirm(true)}
            className={`${BAR_BTN} border-destructive text-destructive`}
          >
            Cancel Vchr
          </button>
          <span className="flex-1 max-sm:hidden" />
          <button
            type="button"
            data-nav={NAV.save}
            onClick={() => void save()}
            disabled={saving || cancelled}
            className="flex h-11 min-w-[200px] cursor-pointer items-center justify-between gap-4 bg-primary px-[22px] text-[15px] font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60 max-sm:order-last max-sm:w-full max-sm:min-w-0"
          >
            <span>{saving ? 'Saving...' : editId ? 'Update' : 'Save'}</span>
            <span aria-hidden="true" className="text-xl">
              →
            </span>
          </button>
        </div>
      </TransactionPage>

      <JournalList
        open={!!list}
        rows={list ?? []}
        onPick={(r) => void open(r)}
        onClose={() => setList(null)}
      />
      <ConfirmDelete
        open={confirm}
        title={['Cancel', 'Voucher']}
        text={jm.cancelConfirm(vchrNo)}
        confirmLabel="Cancel voucher"
        cancelLabel="Keep it"
        onCancel={() => setConfirm(false)}
        onConfirm={() => void doCancel()}
        busy={saving}
      />
    </>
  );
}

const COLS: GridCol<StjLine>[] = [
  { label: 'Item', w: 'minmax(140px,1fr)', cell: (l) => l.itemName },
  { label: 'Godown', w: '110px', cell: (l) => l.godown ?? '' },
  { label: 'Qty.', w: '70px', num: true, cell: (l) => f2(l.qty) },
  { label: 'Rate', w: '76px', num: true, cell: (l) => f2(l.rate) },
  { label: 'Amount', w: '90px', num: true, cell: (l) => f2(l.amount) },
];

function JournalList({
  open,
  rows,
  onPick,
  onClose,
}: {
  open: boolean;
  rows: Row[];
  onPick: (r: Row) => void;
  onClose: () => void;
}) {
  const cols =
    'grid grid-cols-[100px_96px_minmax(0,1fr)_54px_104px_84px] gap-3 max-sm:grid-cols-[minmax(0,1fr)_96px] max-sm:gap-2';
  return (
    <Dialog open={open} onClose={onClose} title={['Stock', 'Journals']} className="w-[760px]">
      <span className="absolute right-[26px] top-[30px] font-mono text-xs text-muted-foreground">
        {rows.length} voucher{rows.length === 1 ? '' : 's'}
      </span>
      <div
        className={`${cols} mt-3.5 border-y border-border px-[26px] py-2.5 font-mono text-xs uppercase tracking-[0.06em] text-muted-foreground max-sm:px-4`}
      >
        <span className="max-sm:hidden">Voucher</span>
        <span className="max-sm:hidden">Date</span>
        <span>Narration</span>
        <span className="max-sm:hidden">Lines</span>
        <span className="text-right">Value</span>
        <span className="max-sm:hidden" />
      </div>
      <div className="h-[46vh] overflow-y-auto max-sm:h-auto max-sm:max-h-[50vh]">
        {rows.length === 0 && (
          <p className="m-0 px-[26px] py-8 text-center text-sm text-muted-foreground">
            {jm.noJournals}
          </p>
        )}
        {rows.map((r) => {
          const cancelled = r.status === 'Cancelled';
          const strike = cancelled ? 'text-muted-foreground line-through' : '';
          return (
            <button
              key={r.id}
              type="button"
              onClick={() => onPick(r)}
              className={`${cols} min-h-11 w-full cursor-pointer items-center border-b border-border px-[26px] text-left text-sm hover:bg-accent max-sm:px-4`}
            >
              <span className={`font-mono text-xs font-semibold max-sm:hidden ${strike}`}>
                {r.vchrNo}
              </span>
              <span className="font-mono text-xs text-muted-foreground max-sm:hidden">
                {dmyDash(r.vchrDate)}
              </span>
              <span className="truncate">
                <span className="hidden font-mono text-xs max-sm:inline">{r.vchrNo} · </span>
                {r.narration || '—'}
              </span>
              <span className="text-muted-foreground max-sm:hidden">{r.lineCount}</span>
              <span className={`text-right font-mono font-semibold ${strike}`}>
                {r.value.toFixed(2)}
              </span>
              <span className="max-sm:hidden">
                {cancelled && (
                  <span className="block border border-destructive/40 bg-destructive-bg px-1.5 py-0.5 text-center text-[11px] font-semibold text-destructive">
                    Cancelled
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
      <div className="flex justify-end border-t border-border px-[26px] py-3 max-sm:px-4">
        <button
          type="button"
          onClick={onClose}
          className="flex h-11 cursor-pointer items-center border-[1.5px] border-foreground px-[18px] text-sm font-semibold"
        >
          Close
        </button>
      </div>
    </Dialog>
  );
}
