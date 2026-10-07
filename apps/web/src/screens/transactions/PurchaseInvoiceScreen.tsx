// Purchase Invoice (purchase_invoice_page.dart). The bill's header, the "Purchased Item Detail"
// entry row with its grid and totals, and the footer buttons. Every figure is worked out as you
// type with MDA's own maths (@qi/core purcLine / purcTotals); the server works it out again on
// save. The supplier decides CGST + SGST or IGST, so changing it recomputes every line.
//
// Kept as MDA has it: Enter walks the fields in MDA's order, starting on Supply With; picking a
// supplier jumps to Transporter, an item to Quantity, a godown to Add; Add returns to the item.
// A cancelled bill opens for reference only and its Save collides with its own number (Q-50).

import {
  f2,
  isInterState,
  purcLine,
  purcTotals,
  purchaseMessages as pm,
  type PurcLine,
} from '@qi/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { api, unwrap, type OkBody } from '../../api.ts';
import { ConfirmDelete } from '../../components/Dialog.tsx';
import { toast } from '../../components/Toast.tsx';
import { DateBox, defaultVoucherDate, errorText } from '../vouchers/shared.tsx';
import { PurchaseList } from './PurchaseList.tsx';
import {
  BAR_BTN,
  Cell,
  Chip,
  Lookup,
  NumBox,
  ReadOnly,
  TransactionPage,
  boxClass,
  dmyDash,
  enterToNext,
  focusNav,
} from './shared.tsx';

type Setup = OkBody<Awaited<ReturnType<typeof api.api.purchases.setup.$get>>>;
type Supplier = Setup['suppliers'][number];
type Item = Setup['items'][number];
type Godown = Setup['godowns'][number];
type ListRow = OkBody<Awaited<ReturnType<typeof api.api.purchases.$get>>>[number];

/** MDA's order numbers (NumericFocusOrder): Enter follows them; Location comes last (Q-35). */
const NAV = {
  billDate: 1,
  supplyWith: 2,
  suppInvNo: 3,
  suppInvDate: 4,
  orderNo: 5,
  orderDate: 6,
  orderType: 7,
  goodsRecNo: 8,
  recDate: 9,
  supplier: 10,
  transporter: 11,
  narration: 12,
  item: 13,
  qty: 14,
  rate: 15,
  discPct: 16,
  discAmt: 17,
  add: 18,
  location: 26,
} as const;

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
  supplier: Supplier | null;
  interState: boolean;
};

type Entry = {
  item: Item | null;
  qty: string;
  rate: string;
  discPct: string;
  discAmt: string;
  location: string;
  /** Index being re-edited, null when adding. */
  line: number | null;
};
const blankEntry = (): Entry => ({
  item: null,
  qty: '0.00',
  rate: '0',
  discPct: '0.00',
  discAmt: '0.00',
  location: '',
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
    supplier: null,
    interState: false,
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
  const gstRateOf = (code: string) => data.items.find((i) => i.code === code)?.gstRate ?? 0;
  const totals = purcTotals(lines);

  // The entry row's Tax and Amount, as typed.
  const entryLine = entry.item
    ? purcLine({
        itemCode: entry.item.code,
        itemName: entry.item.name,
        qty: num(entry.qty),
        rate: num(entry.rate),
        disP: num(entry.discPct),
        disA: num(entry.discAmt),
        gstRate: entry.item.gstRate,
        interState: h.interState,
      })
    : null;
  const entryTax = entryLine ? entryLine.sgstA + entryLine.cgstA + entryLine.igstA : 0;

  /** A new supplier changes the tax split, so every line is recomputed with the item master's
   *  current rate (`_onSupplierChanged` → `_recomputeAllLines`). */
  const onSupplier = (s: Supplier) => {
    const inter = isInterState(data.companyStateCode, s.stateCode);
    set({ supplier: s, interState: inter });
    setSupplierError(false);
    setLines((ls) =>
      ls.map((l) =>
        purcLine({
          ...l,
          disA: l.disP > 0 ? 0 : l.disA,
          gstRate: gstRateOf(l.itemCode),
          interState: inter,
        }),
      ),
    );
    focusNav(NAV.transporter);
  };

  const onItem = (it: Item) => {
    // The purchase rate travels with the item and fills an empty Rate.
    setEntry((x) => ({
      ...x,
      item: it,
      rate: it.purRate > 0 && num(x.rate) === 0 ? f2(it.purRate) : x.rate,
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
      location: entry.location.trim() || null,
      qty: num(entry.qty),
      rate: num(entry.rate),
      disP: num(entry.discPct),
      disA: num(entry.discAmt),
      gstRate: entry.item.gstRate,
      interState: h.interState,
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
      qty: f2(l.qty),
      rate: f2(l.rate),
      discPct: f2(l.disP),
      discAmt: f2(l.disA),
      location: l.location ?? '',
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
    setH(blankHeader(billNo));
    setLines([]);
    setEditing(null);
    setSupplierError(false);
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
      interState: h.interState,
      lines: lines.map((l) => ({
        itemCode: l.itemCode,
        itemName: l.itemName,
        hsnNo: l.hsnNo,
        unit: l.unit,
        location: l.location,
        qty: l.qty,
        rate: l.rate,
        disP: l.disP,
        disA: l.disA,
        gstRate: l.sgstP + l.cgstP + l.igstP,
      })),
    };
    try {
      if (editing === null) await unwrap(api.api.purchases.$post({ json: body }));
      else await unwrap(api.api.purchases.$put({ json: body }));
      toast(editing === null ? pm.saved(h.billNo, totals.net) : pm.updated(h.billNo));
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
      supplier: data.suppliers.find((s) => s.code === bill.suppCode) ?? {
        code: bill.suppCode,
        name: bill.suppName,
        stateCode: '',
        gstin: '',
      },
      interState: bill.isInterState,
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

  const text = (id: keyof Header & string, nav: number, hint?: string) => (
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
          items={data.items}
          hint="Type to search by code"
          showCode
          searchTitle={['Select', 'Item']}
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
          items={data.items}
          hint="Type to search by name"
          searchTitle={['Select', 'Item']}
          onChange={onItem}
        />
      ) : (
        <ReadOnly text={entry.item?.name ?? ''} />
      )}
    </Cell>
  );

  const chips = (
    <>
      {editing && <Chip tone="warn">Editing {editing}</Chip>}
      {h.supplier && (
        <Chip tone={h.interState ? 'violet' : 'ok'}>
          {h.interState ? 'Inter-state - IGST' : 'Intra-state - CGST + SGST'}
        </Chip>
      )}
    </>
  );

  return (
    <>
      <TransactionPage title={['Purchase', 'Invoice']} chips={chips}>
        <div
          className="flex min-h-0 flex-1 flex-col gap-2"
          onKeyDown={(e) =>
            enterToNext(e, {
              [NAV.narration]: NAV.item,
              [NAV.discAmt]: NAV.add,
              [NAV.location]: NAV.add,
            })
          }
        >
          {/* ── Header ── */}
          <div className="grid grid-cols-5 gap-x-2.5 gap-y-1.5 border border-border bg-card px-3 py-2 max-md:grid-cols-2">
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
                format={dmyDash}
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
            <Cell id="pi-orderNo" label="Order No.">
              {text('orderNo', NAV.orderNo)}
            </Cell>
            <Cell id="pi-orderDate" label="Order Date">
              <DateBox
                id="pi-orderDate"
                data-nav={NAV.orderDate}
                value={h.orderDate}
                placeholder="Select date"
                format={dmyDash}
                className={boxClass()}
                onChange={(orderDate) => {
                  set({ orderDate });
                  focusNav(NAV.orderType);
                }}
              />
            </Cell>
            <Cell id="pi-orderType" label="Order Type">
              {text('orderType', NAV.orderType)}
            </Cell>
            <Cell id="pi-goodsRecNo" label="Goods Rec No">
              {text('goodsRecNo', NAV.goodsRecNo)}
            </Cell>
            <Cell id="pi-recDate" label="Rec. Date">
              {text('recDate', NAV.recDate)}
            </Cell>
            <div className="col-span-5 grid grid-cols-[5fr_4fr_5fr] gap-x-2.5 gap-y-1.5 max-md:col-span-2 max-md:grid-cols-1">
              <Cell id="pi-supplier" label="Supplier Name" required>
                <Lookup<Supplier>
                  id="pi-supplier"
                  nav={NAV.supplier}
                  value={h.supplier}
                  items={data.suppliers.map((s) => ({ ...s, extra: s.gstin }))}
                  hint={data.suppliers.length ? 'Type to search supplier' : pm.noSuppliersHint}
                  error={supplierError}
                  searchTitle={['Select', 'Supplier']}
                  onChange={onSupplier}
                />
              </Cell>
              <Cell id="pi-transporter" label="Transporter">
                {text('transporter', NAV.transporter)}
              </Cell>
              <Cell id="pi-narration" label="Narration">
                {text('narration', NAV.narration, 'Optional')}
              </Cell>
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

            {/* Whichever of Code / Name the radio picks is the box you type in, placed first. */}
            <div className="grid grid-cols-[4fr_4fr_3fr] gap-2.5 max-md:grid-cols-2 max-sm:grid-cols-1">
              {byCode ? itemCodeBox(true) : itemNameBox(true)}
              {byCode ? itemNameBox(false) : itemCodeBox(false)}
              <Cell
                id="pi-location"
                label="Location"
                className="max-md:col-span-2 max-sm:col-span-1"
              >
                {data.godowns.length ? (
                  <Lookup<Godown>
                    id="pi-location"
                    nav={NAV.location}
                    value={data.godowns.find((g) => g.name === entry.location) ?? null}
                    items={data.godowns}
                    hint="Godown (optional)"
                    searchTitle={['Select', 'Godown']}
                    onChange={(g) => {
                      setE({ location: g.name });
                      focusNav(NAV.add);
                    }}
                  />
                ) : (
                  <input
                    id="pi-location"
                    data-nav={NAV.location}
                    value={entry.location}
                    placeholder="Godown (optional)"
                    autoComplete="off"
                    onChange={(e) => setE({ location: e.target.value })}
                    className={boxClass()}
                  />
                )}
              </Cell>
            </div>

            <div className="grid grid-cols-[repeat(6,minmax(0,1fr))_auto] items-end gap-2.5 max-lg:grid-cols-3 max-sm:grid-cols-2">
              <Cell id="pi-qty" label="Quantity" required>
                <NumBox
                  id="pi-qty"
                  nav={NAV.qty}
                  value={entry.qty}
                  onChange={(qty) => setE({ qty })}
                />
              </Cell>
              <Cell id="pi-rate" label="Rate">
                <NumBox
                  id="pi-rate"
                  nav={NAV.rate}
                  value={entry.rate}
                  onChange={(rate) => setE({ rate })}
                />
              </Cell>
              <Cell id="pi-discPct" label="Disc %">
                <NumBox
                  id="pi-discPct"
                  nav={NAV.discPct}
                  value={entry.discPct}
                  // Percent and amount are alternatives.
                  onChange={(discPct) =>
                    setE(num(discPct) > 0 ? { discPct, discAmt: '0.00' } : { discPct })
                  }
                />
              </Cell>
              <Cell id="pi-discAmt" label="Disc Amount">
                <NumBox
                  id="pi-discAmt"
                  nav={NAV.discAmt}
                  value={entry.discAmt}
                  onChange={(discAmt) =>
                    setE(num(discAmt) > 0 ? { discAmt, discPct: '0.00' } : { discAmt })
                  }
                />
              </Cell>
              <Cell label="Tax">
                <ReadOnly text={f2(entryTax)} right />
              </Cell>
              <Cell label="Amount">
                <ReadOnly text={f2(entryLine?.lineTotal ?? 0)} right />
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

            <LineGrid lines={lines} selected={entry.line} onEdit={editLine} onRemove={removeLine} />

            {/* Totals */}
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border border-border bg-card px-3 py-1">
              <Total label="Qty" value={f2(totals.qty)} />
              <Total label="Sub Total" value={f2(totals.subTotal)} />
              {totals.discount > 0 && <Total label="Discount" value={f2(totals.discount)} />}
              <Total label="SGST" value={f2(totals.sgst)} />
              <Total label="CGST" value={f2(totals.cgst)} />
              <Total label="IGST" value={f2(totals.igst)} />
              {totals.roundOff !== 0 && <Total label="Round Off" value={f2(totals.roundOff)} />}
              <span className="flex-1" />
              <span className="flex items-center gap-2">
                <span className="text-sm font-semibold text-muted-foreground">Net Amount</span>
                <span className="border-[1.5px] border-foreground bg-background px-3 py-0.5 font-mono text-lg font-bold">
                  {f2(totals.net)}
                </span>
              </span>
            </div>
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="flex flex-none flex-wrap items-center gap-2.5 border-t-[3px] border-double border-foreground pt-2 max-sm:[&>button]:flex-[1_1_40%]">
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

      <PurchaseList
        open={!!list}
        rows={list ?? []}
        onPick={(r) => void loadBill(r.billNo)}
        onClose={() => setList(null)}
      />
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

const Total = ({ label, value }: { label: string; value: string }) => (
  <span className="flex items-baseline gap-1.5">
    <span className="text-xs text-muted-foreground">{label}</span>
    <span className="font-mono text-sm font-bold">{value}</span>
  </span>
);

/** The grid's columns, as MDA's (`_cols`); Item Name takes the spare width. */
const COLS: { label: string; w: string; num?: boolean }[] = [
  { label: 'SNo.', w: '44px' },
  { label: 'Code', w: '78px' },
  { label: 'Item Name', w: 'minmax(170px,1fr)' },
  { label: 'Qty.', w: '62px', num: true },
  { label: 'Rate', w: '76px', num: true },
  { label: 'DisP', w: '52px', num: true },
  { label: 'DisA', w: '66px', num: true },
  { label: 'Amount', w: '86px', num: true },
  { label: 'SGSTP', w: '54px', num: true },
  { label: 'SGSTA', w: '70px', num: true },
  { label: 'CGSTP', w: '54px', num: true },
  { label: 'CGSTA', w: '70px', num: true },
  { label: 'IGSTP', w: '54px', num: true },
  { label: 'IGSTA', w: '70px', num: true },
  { label: '', w: '64px' },
];
const TRACKS = { gridTemplateColumns: COLS.map((c) => c.w).join(' ') };

/** "Purchased Item Detail" grid: tap a row to edit it. It fills the space left and scrolls on its
 *  own, sideways too on narrow screens; the page itself doesn't. */
function LineGrid({
  lines,
  selected,
  onEdit,
  onRemove,
}: {
  lines: PurcLine[];
  selected: number | null;
  onEdit: (i: number) => void;
  onRemove: (i: number) => void;
}) {
  return (
    <div className="flex min-h-[88px] flex-1 flex-col overflow-auto border border-border bg-card max-sm:min-h-[180px] max-sm:flex-none">
      <div className="min-w-[1110px]">
        <div
          style={TRACKS}
          className="sticky top-0 grid border-b border-border bg-muted text-xs font-bold text-muted-foreground"
        >
          {COLS.map((c, i) => (
            <span key={i} className={`px-1.5 py-1.5 ${c.num ? 'text-right' : ''}`}>
              {c.label}
            </span>
          ))}
        </div>
        {lines.map((l, i) => {
          const cells = [
            String(i + 1),
            l.itemCode,
            l.itemName,
            f2(l.qty),
            f2(l.rate),
            f2(l.disP),
            f2(l.disA),
            f2(l.amount),
            f2(l.sgstP),
            f2(l.sgstA),
            f2(l.cgstP),
            f2(l.cgstA),
            f2(l.igstP),
            f2(l.igstA),
          ];
          return (
            <div
              key={i}
              style={TRACKS}
              onClick={() => onEdit(i)}
              className={`grid cursor-pointer items-center border-b border-border/60 text-[13px] hover:bg-accent ${selected === i ? 'bg-accent' : ''}`}
            >
              {cells.map((v, c) => (
                <span
                  key={c}
                  className={`truncate px-1.5 py-1.5 ${COLS[c]!.num ? 'text-right font-mono' : ''}`}
                >
                  {v}
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
          );
        })}
      </div>
      {/* Outside the wide rows, so it stays centred in what's visible. */}
      {lines.length === 0 && (
        <p className="sticky left-0 m-0 py-6 text-center text-sm text-muted-foreground">
          {pm.noLines}
        </p>
      )}
    </div>
  );
}
