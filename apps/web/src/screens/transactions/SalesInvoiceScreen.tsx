// Sales Invoice (sale_invoice_page.dart). The bill header with the sale type, Cash/Credit and
// the customer's address block, the "Items Detail" entry row with its grid, the totals with the
// bill discount, and the footer buttons. Figures are worked out as you type with MDA's maths
// (@qi/core saleLine / saleTotals); the server works them out again and checks the stock.
//
// Kept as MDA has it:
//   - The page opens on Sale Type, set to the first type; changing it on a new bill renumbers
//     the bill under that type's prefix.
//   - The customer is picked from Sundry Debtors; picking fills the address block, which stays
//     editable for a one-off delivery address. Picking jumps to Area; an item to Required Qty;
//     Add returns to the item.
//   - The header Location is stamped on each line as it's added.
//   - A cancelled bill opens for reference only and its Save collides with its own number.

import {
  f2,
  isInterState,
  round2,
  saleLine,
  saleMessages as sm,
  saleTotals,
  type SaleLine,
} from '@qi/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { api, unwrap, type OkBody } from '../../api.ts';
import { ConfirmDelete } from '../../components/Dialog.tsx';
import { toast } from '../../components/Toast.tsx';
import { DateBox, defaultVoucherDate, errorText } from '../vouchers/shared.tsx';
import { SaleList } from './SaleList.tsx';
import {
  BAR_BTN,
  Cell,
  Chip,
  EntryBySwitch,
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

type Setup = OkBody<Awaited<ReturnType<typeof api.api.sales.setup.$get>>>;
type Customer = Setup['customers'][number];
type Item = Setup['items'][number];
type SaleType = Setup['saleTypes'][number];
type ListRow = OkBody<Awaited<ReturnType<typeof api.api.sales.$get>>>[number];

/** MDA's order numbers (NumericFocusOrder); Enter follows them. */
const NAV = {
  saleType: 1,
  billDate: 2,
  location: 3,
  customer: 4,
  area: 5,
  city: 6,
  address: 7,
  state: 8,
  mobile: 9,
  gstNo: 10,
  item: 11,
  qty: 12,
  rate: 13,
  discPct: 14,
  discAmt: 15,
  add: 16,
  billDiscPct: 17,
  billDiscAmt: 18,
  save: 19,
} as const;

type Header = {
  billNo: string;
  billDate: string;
  saleType: SaleType | null;
  isCash: boolean;
  customer: Customer | null;
  /** What's printed: the picked customer's name, or the stored one on a reopened bill. */
  custName: string;
  area: string;
  city: string;
  address: string;
  state: string;
  mobile: string;
  gstNo: string;
  location: string;
  interState: boolean;
  billDiscPct: string;
  billDiscAmt: string;
};

type Entry = {
  item: Item | null;
  qty: string;
  rate: string;
  discPct: string;
  discAmt: string;
  line: number | null;
};
const blankEntry = (): Entry => ({
  item: null,
  qty: '0.00',
  rate: '0.00',
  discPct: '0.00',
  discAmt: '0.00',
  line: null,
});
const num = (s: string) => Number(s) || 0;
const nextNo = async (prefix?: string) =>
  (await unwrap(api.api.sales.next.$get({ query: prefix ? { prefix } : {} }))).billNo;

export function SalesInvoiceScreen() {
  const queryClient = useQueryClient();
  const me = useQuery({ queryKey: ['book-me'], queryFn: () => unwrap(api.api.book.me.$get()) });
  const setup = useQuery({
    queryKey: ['sale-setup'],
    queryFn: () => unwrap(api.api.sales.setup.$get()),
    staleTime: 0,
    gcTime: 0,
  });
  const data = setup.data;

  const [h, setH] = useState<Header | null>(null);
  const [lines, setLines] = useState<SaleLine[]>([]);
  const [entry, setEntry] = useState<Entry>(blankEntry);
  const [byCode, setByCode] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [errors, setErrors] = useState<{ saleType?: boolean; customer?: boolean }>({});
  const [saving, setSaving] = useState(false);
  const [list, setList] = useState<ListRow[] | null>(null);
  const [confirm, setConfirm] = useState(false);
  const started = useRef(false);

  const firstType = () => data?.saleTypes[0] ?? null;
  const blankHeader = (billNo: string): Header => ({
    billNo,
    billDate: defaultVoucherDate(me.data?.fyFrom, me.data?.fyTo),
    saleType: firstType(),
    isCash: true,
    customer: null,
    custName: '',
    area: '',
    city: '',
    address: '',
    state: '',
    mobile: '',
    gstNo: '',
    location: '',
    interState: false,
    billDiscPct: '0.00',
    billDiscAmt: '0.00',
  });

  useEffect(() => {
    if (!data || !me.data || started.current) return;
    started.current = true;
    void nextNo(firstType()?.prefix).then((no) => {
      setH(blankHeader(no));
      focusNav(NAV.saleType);
      if (!data.saleTypes.length) toast(sm.noSaleTypes, 'error');
    });
  }, [data, me.data]);

  if (!data || !me.data || !h) {
    return <TransactionPage title={['Sales', 'Invoice']}>{null}</TransactionPage>;
  }

  const set = (patch: Partial<Header>) => setH((x) => ({ ...x!, ...patch }));
  const setE = (patch: Partial<Entry>) => setEntry((x) => ({ ...x, ...patch }));
  const gstRateOf = (code: string) => data.items.find((i) => i.code === code)?.gstRate ?? 0;
  const totals = saleTotals(lines, num(h.billDiscPct), num(h.billDiscAmt));
  const entryLine = entry.item
    ? saleLine({
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

  /** Only a new bill renumbers; an existing one keeps the number it was saved under. */
  const onSaleType = async (t: SaleType) => {
    set({ saleType: t });
    setErrors((e) => ({ ...e, saleType: false }));
    if (editing === null) {
      const billNo = await nextNo(t.prefix);
      set({ billNo });
    }
    focusNav(NAV.billDate);
  };

  /** The address block comes from the ledger; the supply type is decided again and every line
   *  recomputed. */
  const onCustomer = (c: Customer) => {
    const inter = isInterState(data.companyStateCode, c.stateCode);
    set({
      customer: c,
      custName: c.name,
      address: c.address,
      city: c.city,
      state: c.state,
      mobile: c.mobile,
      gstNo: c.gstNo,
      interState: inter,
    });
    setErrors((e) => ({ ...e, customer: false }));
    setLines((ls) =>
      ls.map((l) =>
        saleLine({
          ...l,
          disA: l.disP > 0 ? 0 : l.disA,
          gstRate: gstRateOf(l.itemCode),
          interState: inter,
        }),
      ),
    );
    focusNav(NAV.area);
  };

  const onItem = (it: Item) => {
    setEntry((x) => ({
      ...x,
      item: it,
      rate: it.saleRate > 0 && num(x.rate) === 0 ? f2(it.saleRate) : x.rate,
    }));
    focusNav(NAV.qty);
  };

  const addLine = () => {
    if (!entry.item) {
      toast(sm.selectItemFirst, 'error');
      return focusNav(NAV.item);
    }
    if (num(entry.qty) <= 0) {
      toast(sm.qtyZero, 'error');
      return focusNav(NAV.qty);
    }
    const line = saleLine({
      itemCode: entry.item.code,
      itemName: entry.item.name,
      hsnNo: entry.item.hsnNo,
      unit: entry.item.unit,
      location: h.location.trim() || null,
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
    setEntry(blankEntry());
    focusNav(NAV.item);
  };

  const editLine = (i: number) => {
    const l = lines[i]!;
    const it = data.items.find((x) => x.code === l.itemCode) ?? {
      code: l.itemCode,
      name: l.itemName,
      unit: l.unit,
      hsnNo: l.hsnNo,
      gstRate: l.sgstP + l.cgstP + l.igstP,
      saleRate: 0,
    };
    setEntry({
      item: it,
      qty: f2(l.qty),
      rate: f2(l.rate),
      discPct: f2(l.disP),
      discAmt: f2(l.disA),
      line: i,
    });
    focusNav(NAV.qty);
  };

  const removeLine = (i: number) => {
    setLines((ls) => ls.filter((_, k) => k !== i));
    if (entry.line === i) setE({ line: null });
  };

  const newBill = async () => {
    const billNo = await nextNo(firstType()?.prefix);
    setH(blankHeader(billNo));
    setLines([]);
    setEditing(null);
    setErrors({});
    setEntry(blankEntry());
    focusNav(NAV.saleType);
  };

  const save = async () => {
    // The form's validators: Sale Type and the customer turn red.
    const e = { saleType: !h.saleType, customer: !h.custName.trim() };
    setErrors(e);
    if (e.saleType || e.customer || saving) return;
    setSaving(true);
    const body = {
      billNo: h.billNo,
      billDate: h.billDate,
      saleType: h.saleType?.name ?? null,
      isCash: h.isCash,
      custCode: h.customer?.code ?? null,
      custName: h.custName,
      address: h.address,
      area: h.area,
      city: h.city,
      state: h.state,
      stateCode: h.customer?.stateCode ?? null,
      mobile: h.mobile,
      gstNo: h.gstNo,
      location: h.location,
      billDiscPct: num(h.billDiscPct),
      billDiscAmt: num(h.billDiscAmt),
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
      if (editing === null) await unwrap(api.api.sales.$post({ json: body }));
      else await unwrap(api.api.sales.$put({ json: body }));
      toast(editing === null ? sm.saved(h.billNo, totals.net) : sm.updated(h.billNo));
      await queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      await newBill();
    } catch (err) {
      toast(errorText(err), 'error');
    }
    setSaving(false);
  };

  const showAll = async () => {
    try {
      setList(await unwrap(api.api.sales.$get()));
    } catch (err) {
      toast(errorText(err), 'error');
    }
  };

  const loadBill = async (billNo: string) => {
    setList(null);
    const { bill } = await unwrap(api.api.sales.bill.$get({ query: { no: billNo } }));
    if (!bill) return;
    const cancelled = bill.status === 'Cancelled';
    setH({
      billNo: bill.billNo,
      billDate: bill.billDate,
      saleType: data.saleTypes.find((t) => t.name === bill.saleType) ?? null,
      isCash: bill.payMode !== 'Credit',
      customer: data.customers.find((c) => c.code === bill.custCode) ?? null,
      custName: bill.custName,
      area: bill.area,
      city: bill.city,
      address: bill.address,
      state: bill.state,
      mobile: bill.mobile,
      gstNo: bill.gstNo,
      location: bill.location,
      interState: bill.isInterState,
      billDiscPct: f2(bill.billDiscPct),
      billDiscAmt: f2(bill.billDiscAmt),
    });
    setLines(bill.lines);
    setEditing(cancelled ? null : bill.billNo);
    setErrors({});
    setEntry(blankEntry());
    if (cancelled) toast(sm.shownCancelled(bill.billNo), 'error');
  };

  const cancelBill = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      await unwrap(api.api.sales.cancel.$post({ json: { billNo: editing } }));
      toast(sm.cancelled(h.billNo));
      setConfirm(false);
      await newBill();
    } catch (err) {
      toast(errorText(err), 'error');
    }
    setConfirm(false);
    setSaving(false);
  };

  const text = (id: 'area' | 'city' | 'address' | 'state' | 'mobile' | 'gstNo' | 'location') => (
    <input
      id={`si-${id}`}
      data-nav={NAV[id]}
      value={h[id]}
      autoComplete="off"
      onChange={(e) => set({ [id]: e.target.value })}
      className={boxClass()}
    />
  );

  const itemBox = (kind: 'code' | 'name', active: boolean) => (
    <Cell
      id={active ? 'si-item' : undefined}
      label={kind === 'code' ? 'Item Code' : 'Item Name'}
      required={active}
    >
      {active ? (
        <Lookup<Item>
          id="si-item"
          nav={NAV.item}
          value={entry.item}
          items={data.items}
          hint={kind === 'code' ? 'Type to search by code' : 'Type to search by name'}
          showCode={kind === 'code'}
          searchTitle={['Select', 'Item']}
          onChange={onItem}
        />
      ) : (
        <ReadOnly text={(kind === 'code' ? entry.item?.code : entry.item?.name) ?? ''} />
      )}
    </Cell>
  );

  const radio = (label: string, on: boolean, pick: () => void) => (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      tabIndex={-1}
      onClick={pick}
      className={`flex h-[34px] cursor-pointer items-center gap-1.5 text-sm ${on ? 'font-semibold text-primary-text' : 'text-muted-foreground'}`}
    >
      <span
        aria-hidden="true"
        className={`grid size-4 place-items-center rounded-full border-[1.5px] ${on ? 'border-primary-text' : 'border-muted-foreground'}`}
      >
        {on && <span className="size-2 rounded-full bg-primary-text" />}
      </span>
      {label}
    </button>
  );

  const chips = (
    <>
      {editing && <Chip tone="warn">Editing {editing}</Chip>}
      {h.customer && (
        <Chip tone={h.interState ? 'violet' : 'ok'}>
          {h.interState ? 'Inter-state - IGST' : 'Intra-state - CGST + SGST'}
        </Chip>
      )}
    </>
  );

  return (
    <>
      <TransactionPage title={['Sales', 'Invoice']} chips={chips}>
        <div
          className="flex min-h-0 flex-1 flex-col gap-2"
          onKeyDown={(e) =>
            enterToNext(e, {
              [NAV.gstNo]: NAV.item,
              [NAV.discAmt]: NAV.add,
              [NAV.billDiscAmt]: NAV.save,
            })
          }
        >
          {/* ── Header ── */}
          <div className="grid grid-cols-[3fr_auto_2fr_2fr_2fr] gap-x-2.5 gap-y-1.5 border border-border bg-card px-3 py-2 max-lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] max-md:grid-cols-2">
            <Cell id="si-saleType" label="Sale Type" required>
              <Lookup<SaleType>
                id="si-saleType"
                nav={NAV.saleType}
                value={h.saleType}
                items={data.saleTypes}
                hint={data.saleTypes.length ? 'Type to search sale type' : sm.noSaleTypesHint}
                error={errors.saleType}
                searchTitle={['Select', 'Sale Type']}
                onChange={(t) => void onSaleType(t)}
              />
            </Cell>
            <div role="radiogroup" aria-label="Payment" className="flex items-end gap-3">
              {radio('Cash', h.isCash, () => set({ isCash: true }))}
              {radio('Credit', !h.isCash, () => set({ isCash: false }))}
            </div>
            <Cell label="Bill No" required>
              <ReadOnly text={h.billNo} strong />
            </Cell>
            <Cell id="si-billDate" label="Date" required>
              <DateBox
                id="si-billDate"
                data-nav={NAV.billDate}
                value={h.billDate}
                min={me.data.fyFrom}
                max={me.data.fyTo}
                format={dmyDash}
                className={boxClass()}
                onChange={(billDate) => {
                  set({ billDate });
                  focusNav(NAV.location);
                }}
              />
            </Cell>
            <Cell id="si-location" label="Location">
              {text('location')}
            </Cell>
            <div className="col-span-5 grid grid-cols-[4fr_3fr_3fr_3fr] gap-x-2.5 gap-y-1.5 max-lg:col-span-3 max-md:col-span-2 max-md:grid-cols-2">
              <Cell id="si-customer" label="Name" required className="max-md:col-span-2">
                <Lookup<Customer>
                  id="si-customer"
                  nav={NAV.customer}
                  value={
                    h.customer ?? (h.custName ? ({ code: '', name: h.custName } as Customer) : null)
                  }
                  items={data.customers.map((c) => ({ ...c, extra: c.gstNo }))}
                  hint={data.customers.length ? 'Type to search customer' : sm.noCustomersHint}
                  error={errors.customer}
                  searchTitle={['Select', 'Customer']}
                  onChange={onCustomer}
                />
              </Cell>
              <Cell id="si-area" label="Area">
                {text('area')}
              </Cell>
              <Cell id="si-city" label="City">
                {text('city')}
              </Cell>
              <Cell id="si-mobile" label="Mobile">
                {text('mobile')}
              </Cell>
            </div>
            <div className="col-span-5 grid grid-cols-[4fr_3fr_6fr] gap-x-2.5 gap-y-1.5 max-lg:col-span-3 max-md:col-span-2 max-md:grid-cols-2">
              <Cell id="si-address" label="Address" className="max-md:col-span-2">
                {text('address')}
              </Cell>
              <Cell id="si-state" label="State">
                {text('state')}
              </Cell>
              <Cell id="si-gstNo" label="GST No">
                {text('gstNo')}
              </Cell>
            </div>
          </div>

          {/* ── Items Detail ── */}
          <div className="flex min-h-0 flex-1 flex-col gap-1.5 border border-border bg-accent/40 px-3 py-2">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <h2 className="m-0 font-mono text-xs font-medium uppercase tracking-[0.12em] text-primary-text">
                Items Detail
              </h2>
              <EntryBySwitch
                byCode={byCode}
                onChange={(c) => {
                  setByCode(c);
                  focusNav(NAV.item);
                }}
              />
              <span className="flex-1" />
              {entry.line !== null && (
                <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                  Editing line {entry.line + 1}
                </span>
              )}
            </div>

            <div className="grid grid-cols-[repeat(5,minmax(0,1fr))_auto] items-end gap-2.5 max-lg:grid-cols-3 max-sm:grid-cols-2">
              <div className="col-span-6 grid grid-cols-[5fr_4fr] gap-2.5 max-lg:col-span-3 max-sm:col-span-2 max-sm:grid-cols-1">
                {itemBox(byCode ? 'code' : 'name', true)}
                {itemBox(byCode ? 'name' : 'code', false)}
              </div>
              <Cell id="si-qty" label="Required Qty" required>
                <NumBox
                  id="si-qty"
                  nav={NAV.qty}
                  value={entry.qty}
                  onChange={(qty) => setE({ qty })}
                />
              </Cell>
              <Cell id="si-rate" label="Rate">
                <NumBox
                  id="si-rate"
                  nav={NAV.rate}
                  value={entry.rate}
                  onChange={(rate) => setE({ rate })}
                />
              </Cell>
              <Cell id="si-discPct" label="Discount %">
                <NumBox
                  id="si-discPct"
                  nav={NAV.discPct}
                  value={entry.discPct}
                  onChange={(discPct) =>
                    setE(num(discPct) > 0 ? { discPct, discAmt: '0.00' } : { discPct })
                  }
                />
              </Cell>
              <Cell id="si-discAmt" label="Discount Amount">
                <NumBox
                  id="si-discAmt"
                  nav={NAV.discAmt}
                  value={entry.discAmt}
                  onChange={(discAmt) =>
                    setE(num(discAmt) > 0 ? { discAmt, discPct: '0.00' } : { discAmt })
                  }
                />
              </Cell>
              <Cell label="Amount">
                <ReadOnly text={f2(entryLine?.lineTotal ?? 0)} right />
              </Cell>
              <div className="flex gap-2 max-lg:col-span-1 max-sm:col-span-2">
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
              empty={sm.noLines}
              selected={entry.line}
              minWidth={1080}
              onEdit={editLine}
              onRemove={removeLine}
            />

            {/* Totals */}
            <div className="flex flex-col gap-1 border border-border bg-card px-3 py-1.5">
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
                <Total label="Qty" value={f2(totals.qty)} />
                <Total label="Sub Total" value={f2(totals.subTotal)} />
                <Total label="CGST" value={f2(totals.cgst)} />
                <Total label="SGST" value={f2(totals.sgst)} />
                <Total label="IGST" value={f2(totals.igst)} />
                {totals.itemDisc > 0 && (
                  <Total label="Discount On Items" value={f2(totals.itemDisc)} />
                )}
                <span className="flex-1" />
                <Total
                  label="Total"
                  value={f2(round2(totals.subTotal + totals.cgst + totals.sgst + totals.igst))}
                />
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
                <label
                  htmlFor="si-billDiscPct"
                  className="text-[13px] font-semibold text-muted-foreground"
                >
                  % On
                </label>
                <div className="w-24">
                  <NumBox
                    id="si-billDiscPct"
                    nav={NAV.billDiscPct}
                    value={h.billDiscPct}
                    onChange={(billDiscPct) =>
                      set(
                        num(billDiscPct) > 0
                          ? { billDiscPct, billDiscAmt: '0.00' }
                          : { billDiscPct },
                      )
                    }
                  />
                </div>
                <label
                  htmlFor="si-billDiscAmt"
                  className="text-[13px] font-semibold text-muted-foreground"
                >
                  Discount Amount
                </label>
                <div className="w-28">
                  <NumBox
                    id="si-billDiscAmt"
                    nav={NAV.billDiscAmt}
                    value={h.billDiscAmt}
                    onChange={(billDiscAmt) =>
                      set(
                        num(billDiscAmt) > 0
                          ? { billDiscAmt, billDiscPct: '0.00' }
                          : { billDiscAmt },
                      )
                    }
                  />
                </div>
                <Total label="Round Off" value={f2(totals.roundOff)} />
                <span className="flex-1" />
                <span className="flex items-center gap-2">
                  <span className="text-sm font-bold text-destructive">Grand Total Rs.</span>
                  <span className="border-[1.5px] border-foreground bg-background px-3 py-0.5 font-mono text-lg font-bold">
                    {f2(totals.net)}
                  </span>
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="flex flex-none flex-wrap items-center gap-2.5 border-t-[3px] border-double border-foreground pt-2 max-sm:[&>button]:flex-[1_1_40%]">
          <button type="button" onClick={() => toast(sm.printLater)} className={BAR_BTN}>
            Sale Print
          </button>
          <button type="button" onClick={() => void showAll()} className={BAR_BTN}>
            Show All Sale
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
            data-nav={NAV.save}
            onClick={() => void save()}
            disabled={saving}
            className="flex h-11 min-w-[200px] cursor-pointer items-center justify-between gap-4 bg-primary max-lg:min-w-[130px] px-[22px] text-[15px] font-semibold text-primary-foreground disabled:cursor-wait disabled:opacity-70 max-sm:order-last max-sm:w-full max-sm:min-w-0"
          >
            <span>{saving ? 'Saving...' : editing === null ? 'Save' : 'Update'}</span>
            <span aria-hidden="true" className="text-xl">
              →
            </span>
          </button>
        </div>
      </TransactionPage>

      <SaleList
        open={!!list}
        rows={list ?? []}
        onPick={(r) => void loadBill(r.billNo)}
        onClose={() => setList(null)}
      />
      <ConfirmDelete
        open={confirm}
        title={['Cancel', 'Sale']}
        text={sm.cancelConfirm(h.billNo)}
        confirmLabel="Cancel bill"
        cancelLabel="Keep it"
        onCancel={() => setConfirm(false)}
        onConfirm={() => void cancelBill()}
        busy={saving}
      />
    </>
  );
}

/** MDA's grid columns for a sale (`_cols`), HSN Code last; Itm.Name takes the spare width. */
const COLS: GridCol<SaleLine>[] = [
  { label: 'SNo.', w: '42px', cell: (_, i) => String(i + 1) },
  { label: 'Itm.Code', w: '74px', cell: (l) => l.itemCode },
  { label: 'Itm.Name', w: 'minmax(130px,1fr)', cell: (l) => l.itemName },
  { label: 'Qty.', w: '58px', num: true, cell: (l) => f2(l.qty) },
  { label: 'Rate', w: '72px', num: true, cell: (l) => f2(l.rate) },
  { label: 'DisP', w: '48px', num: true, cell: (l) => f2(l.disP) },
  { label: 'DisA', w: '62px', num: true, cell: (l) => f2(l.disA) },
  { label: 'Amount', w: '82px', num: true, cell: (l) => f2(l.amount) },
  { label: 'SGST%', w: '54px', num: true, cell: (l) => f2(l.sgstP) },
  { label: 'SGST', w: '66px', num: true, cell: (l) => f2(l.sgstA) },
  { label: 'CGST%', w: '54px', num: true, cell: (l) => f2(l.cgstP) },
  { label: 'CGST', w: '66px', num: true, cell: (l) => f2(l.cgstA) },
  { label: 'IGST%', w: '54px', num: true, cell: (l) => f2(l.igstP) },
  { label: 'IGST', w: '66px', num: true, cell: (l) => f2(l.igstA) },
  { label: 'HSN Code', w: '78px', cell: (l) => l.hsnNo ?? '' },
];
