// Purchase Invoice (purchase_invoice_page.dart). The bill's header, the "Purchased Item Detail"
// entry row with its grid and totals, and the footer buttons. Every figure is worked out as you
// type with MDA's own maths (@qi/core purcLine / purcTotals); the server works it out again on
// save. The State beside the supplier decides CGST + SGST or IGST: it fills from the supplier's
// ledger, can be changed for the bill, and changing it recomputes every line.
//
// Changed from MDA at the user's request (2026-10-11): one Location for the whole bill sits in
// the header; Order No./Date/Type, Goods Rec No, Rec. Date, Narration and Transporter moved into
// the optional "Other Details" popup.
//
// Kept as MDA has it: Enter walks the fields in order, starting on Supply With; picking an item
// jumps to Quantity; Add returns to the item.
// A cancelled bill opens for reference only and its Save collides with its own number (Q-50).

import {
  GST_STATES,
  INDIAN_STATES,
  f2,
  isInterState,
  purcLine,
  purcTotals,
  purchaseMessages as pm,
  stateCodeOfName,
  type PurcLine,
} from '@qi/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { api, unwrap, type OkBody } from '../../api.ts';
import { fa, fq } from '../../format.ts';
import { ConfirmDelete, Dialog } from '../../components/Dialog.tsx';
import { SearchSelect } from '../../components/SearchSelect.tsx';
import { toast } from '../../components/Toast.tsx';
import { DateBox, defaultVoucherDate, errorText } from '../vouchers/shared.tsx';
import { PurchaseList } from './PurchaseList.tsx';
import { PrintInvoice } from './print.tsx';
import {
  BAR_BTN,
  Cell,
  ItemGrid,
  Total,
  type GridCol,
  Chip,
  Lookup,
  NumBox,
  ReadOnly,
  TransactionPage,
  boxClass,
  dmy,
  enterToNext,
  focusNav,
} from './shared.tsx';

type Setup = OkBody<Awaited<ReturnType<typeof api.api.purchases.setup.$get>>>;
type Supplier = Setup['suppliers'][number];
type Item = Setup['items'][number];
type Godown = Setup['godowns'][number];
type ListRow = OkBody<Awaited<ReturnType<typeof api.api.purchases.$get>>>[number];

/** Enter follows these numbers (MDA's NumericFocusOrder, with Location now in the header). */
const NAV = {
  billDate: 1,
  supplyWith: 2,
  suppInvNo: 3,
  suppInvDate: 4,
  location: 5,
  supplier: 10,
  state: 11,
  item: 13,
  qty: 14,
  rate: 15,
  discPct: 16,
  discAmt: 17,
  add: 18,
} as const;

const STATE_OPTIONS = INDIAN_STATES.map((s) => ({ value: s, label: s }));

/** A supplier's State as the bill shows it: the ledger's State, else the state of its code. */
const stateOf = (s: Supplier) => s.state.trim() || GST_STATES[s.stateCode] || '';

type Header = {
  billNo: string;
  billDate: string;
  supplyWith: string;
  suppInvNo: string;
  suppInvDate: string;
  orderNo: string;
  orderDate: string;
  orderType: string;
  goodsRecNo: string;
  recDate: string;
  transporter: string;
  narration: string;
  location: string;
  supplier: Supplier | null;
  state: string;
  interState: boolean;
  /** Added straight to the net, without GST. */
  freight: string;
};

type Entry = {
  item: Item | null;
  qty: string;
  rate: string;
  discPct: string;
  discAmt: string;
  /** Which discount box was typed in; the other one is worked out from it. */
  discBy: 'pct' | 'amt';
  /** Up to four description lines for this item. */
  desc: string[];
  /** Index being re-edited, null when adding. */
  line: number | null;
};
const blankEntry = (): Entry => ({
  item: null,
  qty: fq(0),
  rate: fa(0),
  discPct: '0.00',
  discAmt: fa(0),
  discBy: 'pct',
  desc: ['', '', '', ''],
  line: null,
});
const num = (s: string) => Number(s) || 0;

export function PurchaseInvoiceScreen() {
  const queryClient = useQueryClient();
  const me = useQuery({ queryKey: ['book-me'], queryFn: () => unwrap(api.api.book.me.$get()) });
  const setup = useQuery({
    queryKey: ['purchase-setup'],
    queryFn: () => unwrap(api.api.purchases.setup.$get()),
    // The next bill number and the masters are read fresh each time the page opens (`_load`).
    staleTime: 0,
    gcTime: 0,
  });
  const data = setup.data;

  const blankHeader = (billNo: string): Header => ({
    billNo,
    billDate: defaultVoucherDate(me.data?.fyFrom, me.data?.fyTo),
    supplyWith: '',
    suppInvNo: '',
    suppInvDate: '',
    orderNo: '',
    orderDate: '',
    orderType: '',
    goodsRecNo: '',
    recDate: '',
    transporter: '',
    narration: '',
    location: '',
    supplier: null,
    state: '',
    interState: false,
    freight: fa(0),
  });

  const [h, setH] = useState<Header | null>(null);
  const [lines, setLines] = useState<PurcLine[]>([]);
  const [entry, setEntry] = useState<Entry>(blankEntry);
  const [byCode, setByCode] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [supplierError, setSupplierError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [list, setList] = useState<ListRow[] | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);
  /** The bill last saved here, offered first by Purchase Print. */
  const [lastSaved, setLastSaved] = useState('');
  const [otherOpen, setOtherOpen] = useState(false);
  const [descOpen, setDescOpen] = useState(false);
  const started = useRef(false);

  // First load: a fresh bill, the cursor on Supply With, and MDA's warning when there's no
  // supplier to buy from.
  useEffect(() => {
    if (!data || !me.data || started.current) return;
    started.current = true;
    setH(blankHeader(data.billNo));
    focusNav(NAV.supplyWith);
    if (!data.suppliers.length) toast(pm.noSuppliers, 'error');
  }, [data, me.data]);

  if (!data || !me.data || !h) {
    return <TransactionPage title={['Purchase', 'Invoice']}>{null}</TransactionPage>;
  }

  const set = (patch: Partial<Header>) => setH((x) => ({ ...x!, ...patch }));
  const setE = (patch: Partial<Entry>) => setEntry((x) => ({ ...x, ...patch }));
  // The lookups show each item's Unit, GST % and Rate beside it.
  const itemRefs = data.items.map((i) => ({
    ...i,
    extra: [i.unit, `GST ${i.gstRate}%`, i.purRate > 0 ? `₹${fa(i.purRate)}` : '']
      .filter(Boolean)
      .join('  ·  '),
  }));
  const gstRateOf = (code: string) => data.items.find((i) => i.code === code)?.gstRate ?? 0;
  const totals = purcTotals(lines, num(h.freight));

  // The entry row's discount: the box typed in wins, the other shows what it comes to.
  const disP = entry.discBy === 'pct' ? num(entry.discPct) : 0;
  const disA = entry.discBy === 'amt' ? num(entry.discAmt) : 0;
  const gross = num(entry.qty) * num(entry.rate);
  const shownPct =
    entry.discBy === 'pct' ? entry.discPct : gross > 0 ? f2((disA / gross) * 100) : '0.00';
  const shownAmt = entry.discBy === 'amt' ? entry.discAmt : fa(Math.round(gross * disP) / 100);
  const descCount = entry.desc.filter((d) => d.trim()).length;

  // The entry row's Tax and Amount, as typed.
  const entryLine = entry.item
    ? purcLine({
        itemCode: entry.item.code,
        itemName: entry.item.name,
        qty: num(entry.qty),
        rate: num(entry.rate),
        disP,
        disA,
        gstRate: entry.item.gstRate,
        interState: h.interState,
      })
    : null;
  const entryTax = entryLine ? entryLine.sgstA + entryLine.cgstA + entryLine.igstA : 0;

  /** A new State can change the tax split, so every line is recomputed with the item master's
   *  current rate (`_onSupplierChanged` → `_recomputeAllLines`). Blank counts as the company's
   *  own state. */
  const applyState = (state: string, supplier: Supplier | null) => {
    const inter = isInterState(data.companyStateCode, stateCodeOfName(state));
    set({ supplier, state, interState: inter });
    setLines((ls) =>
      ls.map((l) =>
        purcLine({
          ...l,
          disA: l.disP > 0 ? 0 : l.disA,
          gstRate: gstRateOf(l.itemCode),
          interState: inter,
          desc: l.desc,
        }),
      ),
    );
  };

  const onSupplier = (s: Supplier) => {
    applyState(stateOf(s), s);
    setSupplierError(false);
    focusNav(NAV.state);
  };

  const onItem = (it: Item) => {
    // The purchase rate travels with the item and fills an empty Rate.
    setEntry((x) => ({
      ...x,
      item: it,
      rate: it.purRate > 0 && num(x.rate) === 0 ? fa(it.purRate) : x.rate,
    }));
    focusNav(NAV.qty);
  };

  const clearEntry = () => setEntry(blankEntry());

  const addLine = () => {
    if (!entry.item) {
      toast(pm.selectItemFirst, 'error');
      return focusNav(NAV.item);
    }
    if (num(entry.qty) <= 0) {
      toast(pm.qtyZero, 'error');
      return focusNav(NAV.qty);
    }
    if (!h.supplier) {
      toast(pm.supplierFirst, 'error');
      return focusNav(NAV.supplier);
    }
    const line = purcLine({
      itemCode: entry.item.code,
      itemName: entry.item.name,
      hsnNo: entry.item.hsnNo,
      unit: entry.item.unit,
      location: h.location.trim() || null,
      qty: num(entry.qty),
      rate: num(entry.rate),
      disP,
      disA,
      gstRate: entry.item.gstRate,
      interState: h.interState,
      desc: descCount ? entry.desc.map((d) => d.trim()) : undefined,
    });
    setLines((ls) =>
      entry.line !== null ? ls.map((l, i) => (i === entry.line ? line : l)) : [...ls, line],
    );
    clearEntry();
    focusNav(NAV.item);
  };

  const editLine = (i: number) => {
    const l = lines[i]!;
    // The item may have left the master since the bill was entered; the line's own details
    // stand in for it.
    const it = data.items.find((x) => x.code === l.itemCode) ?? {
      code: l.itemCode,
      name: l.itemName,
      unit: l.unit,
      hsnNo: l.hsnNo,
      gstRate: l.sgstP + l.cgstP + l.igstP,
      purRate: 0,
    };
    setEntry({
      item: it,
      qty: fq(l.qty),
      rate: fa(l.rate),
      discPct: f2(l.disP),
      discAmt: fa(l.disA),
      discBy: l.disP > 0 ? 'pct' : 'amt',
      desc: [0, 1, 2, 3].map((k) => l.desc?.[k] ?? ''),
      line: i,
    });
    focusNav(NAV.qty);
  };

  const removeLine = (i: number) => {
    setLines((ls) => ls.filter((_, k) => k !== i));
    if (entry.line === i) setE({ line: null });
  };

  const newBill = async () => {
    const { billNo } = await unwrap(api.api.purchases.next.$get());
    // Masters added meanwhile (another tab) show up on the fresh bill.
    void setup.refetch();
    setH(blankHeader(billNo));
    setLines([]);
    setEditing(null);
    setSupplierError(false);
    setByCode(false);
    clearEntry();
    focusNav(NAV.supplyWith);
  };

  const save = async () => {
    // The form's only validator: the supplier box turns red.
    if (!h.supplier) {
      setSupplierError(true);
      return;
    }
    if (saving) return;
    setSaving(true);
    const body = {
      billNo: h.billNo,
      billDate: h.billDate,
      suppCode: h.supplier.code,
      suppInvNo: h.suppInvNo,
      suppInvDate: h.suppInvDate,
      supplyWith: h.supplyWith,
      orderNo: h.orderNo,
      orderDate: h.orderDate || null,
      orderType: h.orderType,
      goodsRecNo: h.goodsRecNo,
      recDate: h.recDate,
      transporter: h.transporter,
      narration: h.narration,
      state: h.state,
      interState: h.interState,
      freight: num(h.freight),
      lines: lines.map((l) => ({
        itemCode: l.itemCode,
        itemName: l.itemName,
        hsnNo: l.hsnNo,
        unit: l.unit,
        // One Location for the whole bill.
        location: h.location.trim() || null,
        qty: l.qty,
        rate: l.rate,
        disP: l.disP,
        disA: l.disA,
        gstRate: l.sgstP + l.cgstP + l.igstP,
        desc: l.desc,
      })),
    };
    try {
      if (editing === null) await unwrap(api.api.purchases.$post({ json: body }));
      else await unwrap(api.api.purchases.$put({ json: body }));
      toast(editing === null ? pm.saved(h.billNo, totals.net) : pm.updated(h.billNo));
      setLastSaved(h.billNo);
      await queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      await newBill();
    } catch (err) {
      toast(errorText(err), 'error');
    }
    setSaving(false);
  };

  const showAll = async () => {
    try {
      setList(await unwrap(api.api.purchases.$get()));
    } catch (err) {
      toast(errorText(err), 'error');
    }
  };

  const loadBill = async (billNo: string) => {
    setList(null);
    const { bill } = await unwrap(api.api.purchases.bill.$get({ query: { no: billNo } }));
    if (!bill) return;
    const cancelled = bill.status === 'Cancelled';
    const supplier = data.suppliers.find((s) => s.code === bill.suppCode) ?? {
      code: bill.suppCode,
      name: bill.suppName,
      state: '',
      stateCode: '',
      gstin: '',
    };
    setH({
      billNo: bill.billNo,
      billDate: bill.billDate,
      supplyWith: bill.supplyWith,
      suppInvNo: bill.suppInvNo,
      suppInvDate: bill.suppInvDate,
      orderNo: bill.orderNo,
      orderDate: bill.orderDate ?? '',
      orderType: bill.orderType,
      goodsRecNo: bill.goodsRecNo,
      recDate: bill.recDate,
      transporter: bill.transporter,
      narration: bill.narration,
      location: bill.lines.find((l) => l.location)?.location ?? '',
      supplier,
      // Bills saved before the State box existed show the supplier's.
      state: bill.state || stateOf(supplier),
      interState: bill.isInterState,
      freight: fa(bill.freight),
    });
    setLines(bill.lines);
    // A cancelled bill opens for reference only: saving would re-post it.
    setEditing(cancelled ? null : bill.billNo);
    setSupplierError(false);
    clearEntry();
    if (cancelled) toast(pm.shownCancelled(bill.billNo), 'error');
  };

  const cancelBill = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      await unwrap(api.api.purchases.cancel.$post({ json: { billNo: editing } }));
      toast(pm.cancelled(h.billNo));
      setConfirm(false);
      await newBill();
    } catch (err) {
      toast(errorText(err), 'error');
    }
    setConfirm(false);
    setSaving(false);
  };

  const text = (id: keyof Header & string, nav?: number, hint?: string) => (
    <input
      id={`pi-${id}`}
      data-nav={nav}
      value={h[id] as string}
      placeholder={hint}
      autoComplete="off"
      onChange={(e) => set({ [id]: e.target.value })}
      className={boxClass()}
    />
  );

  const itemCodeBox = (active: boolean) => (
    <Cell id={active ? 'pi-item' : undefined} label="Item Code" required={active}>
      {active ? (
        <Lookup<Item>
          id="pi-item"
          nav={NAV.item}
          value={entry.item}
          items={itemRefs}
          hint="Type to search by code"
          showCode
          onChange={onItem}
        />
      ) : (
        <ReadOnly text={entry.item?.code ?? ''} />
      )}
    </Cell>
  );
  const itemNameBox = (active: boolean) => (
    <Cell id={active ? 'pi-item' : undefined} label="Item Name" required={active}>
      {active ? (
        <Lookup<Item>
          id="pi-item"
          nav={NAV.item}
          value={entry.item}
          items={itemRefs}
          hint="Type to search by name"
          onChange={onItem}
        />
      ) : (
        <ReadOnly text={entry.item?.name ?? ''} />
      )}
    </Cell>
  );

  const chips = <>{editing && <Chip tone="warn">Editing {editing}</Chip>}</>;

  // Filled boxes in the popup, shown on its button so nothing entered there goes unseen.
  const otherCount = [
    h.orderNo,
    h.orderDate,
    h.orderType,
    h.goodsRecNo,
    h.recDate,
    h.narration,
    h.transporter,
  ].filter((v) => v.trim()).length;

  return (
    <>
      <TransactionPage title={['Purchase', 'Invoice']} chips={chips}>
        <div
          className="flex min-h-0 flex-1 flex-col gap-2"
          onKeyDown={(e) =>
            enterToNext(e, {
              [NAV.discAmt]: NAV.add,
            })
          }
        >
          {/* ── Header ── */}
          <div className="grid grid-cols-6 gap-x-2.5 gap-y-1.5 border border-border bg-card px-3 py-2 max-lg:grid-cols-3 max-md:grid-cols-2">
            <Cell label="Purchase No." required>
              <ReadOnly text={h.billNo} strong />
            </Cell>
            <Cell id="pi-billDate" label="Purchase Date" required>
              <DateBox
                id="pi-billDate"
                data-nav={NAV.billDate}
                value={h.billDate}
                min={me.data.fyFrom}
                max={me.data.fyTo}
                format={dmy}
                className={boxClass()}
                onChange={(billDate) => {
                  set({ billDate });
                  focusNav(NAV.supplyWith);
                }}
              />
            </Cell>
            <Cell id="pi-supplyWith" label="Supply With">
              {text('supplyWith', NAV.supplyWith, 'Transport / courier')}
            </Cell>
            <Cell id="pi-suppInvNo" label="No.">
              {text('suppInvNo', NAV.suppInvNo, 'Supplier bill no')}
            </Cell>
            <Cell id="pi-suppInvDate" label="Date">
              {text('suppInvDate', NAV.suppInvDate, 'Supplier bill date')}
            </Cell>
            <Cell id="pi-location" label="Location">
              {data.godowns.length ? (
                <Lookup<Godown>
                  id="pi-location"
                  nav={NAV.location}
                  value={data.godowns.find((g) => g.name === h.location) ?? null}
                  items={data.godowns}
                  hint="Godown (optional)"
                  onChange={(g) => {
                    set({ location: g.name });
                    focusNav(NAV.supplier);
                  }}
                />
              ) : (
                text('location', NAV.location, 'Godown (optional)')
              )}
            </Cell>
            <div className="col-span-6 grid grid-cols-[5fr_3fr_2fr_auto] items-end gap-x-2.5 gap-y-1.5 max-lg:col-span-3 max-md:col-span-2 max-md:grid-cols-2">
              <Cell id="pi-supplier" label="Supplier Name" required className="max-md:col-span-2">
                <Lookup<Supplier>
                  id="pi-supplier"
                  nav={NAV.supplier}
                  value={h.supplier}
                  items={data.suppliers.map((s) => ({ ...s, extra: s.gstin }))}
                  hint={data.suppliers.length ? 'Type to search supplier' : pm.noSuppliersHint}
                  error={supplierError}
                  onChange={onSupplier}
                />
              </Cell>
              <Cell id="pi-state" label="State">
                <SearchSelect
                  id="pi-state"
                  nav={NAV.state}
                  compact
                  value={h.state}
                  options={STATE_OPTIONS}
                  placeholder="Search state…"
                  onCommit={(state) => {
                    if (state !== h.state) applyState(state, h.supplier);
                  }}
                  onNext={() => focusNav(NAV.item)}
                />
              </Cell>
              <Cell label="GST">
                <ReadOnly text={h.interState ? 'IGST' : 'CGST + SGST'} strong />
              </Cell>
              <button
                type="button"
                onClick={() => setOtherOpen(true)}
                className="flex h-[34px] cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap border-[1.5px] border-foreground px-3 text-[15px] font-semibold max-md:col-span-2"
              >
                Other Details…
                {otherCount > 0 && (
                  <span className="bg-primary px-1.5 text-xs text-primary-foreground">
                    {otherCount}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* ── Purchased Item Detail ── */}
          <div className="flex min-h-0 flex-1 flex-col gap-1.5 border border-border bg-accent/40 px-3 py-2">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <h2 className="m-0 font-mono text-xs font-medium uppercase tracking-[0.12em] text-primary-text">
                Purchased Item Detail
              </h2>
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
                      onClick={() => {
                        if (on) return;
                        setByCode(k === 'Code');
                        focusNav(NAV.item);
                      }}
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
              <span className="flex-1" />
              {entry.line !== null && (
                <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                  Editing line {entry.line + 1}
                </span>
              )}
            </div>

            {/* Always Item Code | Item Name, as the grid below; the radio only picks which one you
                type in (changed from MDA's "typed box first" at the user's request, 2026-10-25). */}
            <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-2.5 max-sm:grid-cols-1">
              {itemCodeBox(byCode)}
              {itemNameBox(!byCode)}
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setDescOpen(true)}
                className="flex h-[34px] cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap border-[1.5px] border-foreground px-3 text-[15px] font-semibold"
              >
                Description
                {descCount > 0 && (
                  <span className="bg-primary px-1.5 text-xs text-primary-foreground">
                    {descCount}
                  </span>
                )}
              </button>
            </div>

            <div className="grid grid-cols-[repeat(6,minmax(0,1fr))_auto] items-end gap-2.5 max-lg:grid-cols-3 max-sm:grid-cols-2">
              <Cell id="pi-qty" label="Quantity" required>
                <NumBox
                  id="pi-qty"
                  format={fq}
                  nav={NAV.qty}
                  value={entry.qty}
                  onChange={(qty) => setE({ qty })}
                />
              </Cell>
              <Cell id="pi-rate" label="Rate">
                <NumBox
                  id="pi-rate"
                  format={fa}
                  nav={NAV.rate}
                  value={entry.rate}
                  onChange={(rate) => setE({ rate })}
                />
              </Cell>
              <Cell id="pi-discPct" label="Disc %">
                <NumBox
                  id="pi-discPct"
                  nav={NAV.discPct}
                  value={shownPct}
                  // Percent and amount are alternatives; the other box follows the one typed.
                  onChange={(discPct) => setE({ discPct, discBy: 'pct' })}
                />
              </Cell>
              <Cell id="pi-discAmt" label="Disc Amount">
                <NumBox
                  id="pi-discAmt"
                  format={fa}
                  nav={NAV.discAmt}
                  value={shownAmt}
                  onChange={(discAmt) => setE({ discAmt, discBy: 'amt' })}
                />
              </Cell>
              <Cell label="Tax">
                <ReadOnly text={fa(entryTax)} right />
              </Cell>
              <Cell label="Amount">
                <ReadOnly text={fa(entryLine?.lineTotal ?? 0)} right />
              </Cell>
              <div className="flex gap-2 max-lg:col-span-3 max-sm:col-span-2">
                <button
                  type="button"
                  data-nav={NAV.add}
                  onClick={addLine}
                  className="flex h-[34px] flex-1 cursor-pointer items-center justify-center bg-primary px-4 text-[15px] font-semibold text-primary-foreground"
                >
                  {entry.line === null ? 'Add' : 'Update'}
                </button>
                <button
                  type="button"
                  disabled={entry.line === null}
                  onClick={() => entry.line !== null && removeLine(entry.line)}
                  className="flex h-[34px] flex-1 cursor-pointer items-center justify-center border-[1.5px] border-destructive px-4 text-[15px] font-semibold text-destructive disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Remove
                </button>
              </div>
            </div>

            <ItemGrid
              cols={COLS}
              lines={lines}
              empty={pm.noLines}
              selected={entry.line}
              onEdit={editLine}
              onRemove={removeLine}
            />

            {/* Totals */}
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border border-border bg-card px-3 py-1">
              <Total label="Qty" value={fq(totals.qty)} />
              <Total label="Sub Total" value={fa(totals.subTotal)} />
              {totals.discount > 0 && <Total label="Discount" value={fa(totals.discount)} />}
              <Total label="SGST" value={fa(totals.sgst)} />
              <Total label="CGST" value={fa(totals.cgst)} />
              <Total label="IGST" value={fa(totals.igst)} />
              <label className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">Freight</span>
                <span className="w-[110px]">
                  <NumBox
                    id="pi-freight"
                    format={fa}
                    value={h.freight}
                    onChange={(freight) => set({ freight })}
                  />
                </span>
              </label>
              {totals.roundOff !== 0 && <Total label="Round Off" value={fa(totals.roundOff)} />}
              <span className="flex-1" />
              <span className="flex items-center gap-2">
                <span className="text-sm font-semibold text-muted-foreground">Net Amount</span>
                <span className="border-[1.5px] border-foreground bg-background px-3 py-0.5 font-mono text-lg font-bold">
                  {fa(totals.net)}
                </span>
              </span>
            </div>
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="flex flex-none flex-wrap items-center gap-2.5 border-t-[3px] border-double border-foreground pt-2 max-sm:[&>button]:flex-[1_1_40%]">
          <button type="button" onClick={() => setPrintOpen(true)} className={BAR_BTN}>
            Purchase Print
          </button>
          <button type="button" onClick={() => void showAll()} className={BAR_BTN}>
            Show All Purchase
          </button>
          <button type="button" onClick={() => void newBill()} className={BAR_BTN}>
            New Bill
          </button>
          <button
            type="button"
            disabled={!editing}
            onClick={() => setConfirm(true)}
            className={`${BAR_BTN} border-destructive text-destructive`}
          >
            Cancel Bill
          </button>
          <span className="flex-1 max-sm:hidden" />
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="flex h-11 min-w-[200px] cursor-pointer items-center justify-between gap-4 bg-primary px-[22px] text-[15px] font-semibold text-primary-foreground disabled:cursor-wait disabled:opacity-70 max-sm:order-last max-sm:w-full max-sm:min-w-0"
          >
            <span>{saving ? 'Saving...' : editing === null ? 'Save' : 'Update'}</span>
            <span aria-hidden="true" className="text-xl">
              →
            </span>
          </button>
        </div>
      </TransactionPage>

      <PrintInvoice
        kind="purchase"
        open={printOpen}
        defaultNo={editing ?? lastSaved}
        onDone={() => setPrintOpen(false)}
      />
      <PurchaseList
        open={!!list}
        rows={list ?? []}
        onPick={(r) => void loadBill(r.billNo)}
        onClose={() => setList(null)}
      />
      <Dialog
        open={descOpen}
        onClose={() => setDescOpen(false)}
        title={['Item', 'Description']}
        className="w-[520px]"
      >
        <div className="flex flex-col gap-3 px-[26px] pb-[22px] pt-[14px]">
          {entry.item && <p className="m-0 text-sm font-semibold">{entry.item.name}</p>}
          {[0, 1, 2, 3].map((k) => (
            <Cell key={k} id={`pi-desc-${k}`} label={`Description ${k + 1}`}>
              <input
                id={`pi-desc-${k}`}
                autoFocus={k === 0}
                value={entry.desc[k]}
                autoComplete="off"
                onChange={(e) =>
                  setE({ desc: entry.desc.map((d, i) => (i === k ? e.target.value : d)) })
                }
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return;
                  e.preventDefault();
                  if (k < 3) document.getElementById(`pi-desc-${k + 1}`)?.focus();
                  else setDescOpen(false);
                }}
                className={boxClass()}
              />
            </Cell>
          ))}
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => {
                setDescOpen(false);
                focusNav(NAV.qty);
              }}
              className="flex h-11 cursor-pointer items-center bg-primary px-5 text-[15px] font-semibold text-primary-foreground"
            >
              Done
            </button>
          </div>
        </div>
      </Dialog>
      <Dialog
        open={otherOpen}
        onClose={() => setOtherOpen(false)}
        title={['Other', 'Details']}
        className="w-[560px]"
      >
        <div className="flex flex-col gap-3 px-[26px] pb-[22px] pt-[14px]">
          <div className="grid grid-cols-2 gap-x-2.5 gap-y-1.5 max-sm:grid-cols-1">
            <Cell id="pi-orderNo" label="Order No.">
              {text('orderNo')}
            </Cell>
            <Cell id="pi-orderDate" label="Order Date">
              <DateBox
                id="pi-orderDate"
                value={h.orderDate}
                placeholder="Select date"
                format={dmy}
                className={boxClass()}
                onChange={(orderDate) => set({ orderDate })}
              />
            </Cell>
            <Cell id="pi-orderType" label="Order Type">
              {text('orderType')}
            </Cell>
            <Cell id="pi-goodsRecNo" label="Goods Rec No">
              {text('goodsRecNo')}
            </Cell>
            <Cell id="pi-recDate" label="Rec. Date">
              {text('recDate')}
            </Cell>
            <Cell id="pi-transporter" label="Transporter">
              {text('transporter')}
            </Cell>
            <Cell id="pi-narration" label="Narration" className="col-span-2 max-sm:col-span-1">
              {text('narration', undefined, 'Optional')}
            </Cell>
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => {
                setOtherOpen(false);
                focusNav(NAV.item);
              }}
              className="flex h-11 cursor-pointer items-center bg-primary px-5 text-[15px] font-semibold text-primary-foreground"
            >
              Done
            </button>
          </div>
        </div>
      </Dialog>
      <ConfirmDelete
        open={confirm}
        title={['Cancel', 'Purchase']}
        text={pm.cancelConfirm(h.billNo)}
        confirmLabel="Cancel bill"
        cancelLabel="Keep it"
        onCancel={() => setConfirm(false)}
        onConfirm={() => void cancelBill()}
        busy={saving}
      />
    </>
  );
}

/** The grid's columns, as MDA's (`_cols`); Item Name takes the spare width. */
const COLS: GridCol<PurcLine>[] = [
  { label: 'SNo.', w: '44px', cell: (_, i) => String(i + 1) },
  { label: 'Code', w: '78px', cell: (l) => l.itemCode },
  {
    label: 'Item Name',
    w: 'minmax(170px,1fr)',
    // Description lines follow the name.
    cell: (l) => [l.itemName, ...(l.desc ?? []).filter((d) => d.trim())].join('  ·  '),
  },
  { label: 'Qty.', w: '62px', num: true, cell: (l) => fq(l.qty) },
  { label: 'Rate', w: '76px', num: true, cell: (l) => fa(l.rate) },
  { label: 'DisP', w: '52px', num: true, cell: (l) => f2(l.disP) },
  { label: 'DisA', w: '66px', num: true, cell: (l) => fa(l.disA) },
  { label: 'Amount', w: '86px', num: true, cell: (l) => fa(l.amount) },
  { label: 'SGSTP', w: '54px', num: true, cell: (l) => f2(l.sgstP) },
  { label: 'SGSTA', w: '70px', num: true, cell: (l) => fa(l.sgstA) },
  { label: 'CGSTP', w: '54px', num: true, cell: (l) => f2(l.cgstP) },
  { label: 'CGSTA', w: '70px', num: true, cell: (l) => fa(l.cgstA) },
  { label: 'IGSTP', w: '54px', num: true, cell: (l) => f2(l.igstP) },
  { label: 'IGSTA', w: '70px', num: true, cell: (l) => fa(l.igstA) },
];
