// Sales Invoice (sale_invoice_page.dart). The bill header with the sale type, Cash/Credit and
// the customer's address block, the "Items Detail" entry row with its grid, the totals with the
// bill discount, and the footer buttons. Figures are worked out as you type with MDA's maths
// (@qi/core saleLine / saleTotals); the server works them out again and checks the stock.
//
// Kept as MDA has it:
//   - The page opens on Sale Type, set to the first type; changing it on a new bill renumbers
//     the bill under that type's prefix.
//   - The customer is picked from Sundry Debtors; picking fills the address block, which stays
//     editable for a one-off delivery address. An item jumps to Required Qty; Add returns to the
//     item.
//   - A cancelled bill opens for reference only and its Save collides with its own number.
//
// Changed 2026-11-14 (user's request: every option must work):
//   - Location is picked from Godown (when there are any) and applies to every line on save.
//   - A cash sale picks its Cash or Bank account, and can be to a walk-in customer: a typed
//     name, with the State chosen here and the GST No. in Other Details.
//   - Other Details has a Narration; Sale Type and Name say what's missing, not just turn red.
//
// Changed at the user's request (2026-10-11): the State sits beside the Name and decides CGST +
// SGST or IGST. Since 2026-11-13 it can't be edited here: it comes from the customer's ledger,
// and picking a customer recomputes every line.
// Changed at the user's request (2026-11-09), as on the Purchase Invoice: Mobile, Address, Area,
// City and GST No. moved into the "Other Details" popup beside GST. Picking a customer still
// fills them. Enter: Name → Other Details (Enter opens it and walks its boxes; the last
// one closes it and goes to the item).

import {
  CUSTOMER_GROUP,
  GST_STATES,
  f2,
  isInterState,
  round2,
  saleLine,
  saleMessages as sm,
  saleTotals,
  stateCodeOfName,
  type SaleLine,
} from '@qi/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { api, unwrap, type OkBody } from '../../api.ts';
import { fa, fq } from '../../format.ts';
import { preferences } from '../../prefs.ts';
import { ConfirmDelete, Dialog } from '../../components/Dialog.tsx';
import { NewItemButton, NewLedgerButton } from '../../components/NewLedger.tsx';
import { toast } from '../../components/Toast.tsx';
import { DateBox, defaultVoucherDate, errorText, numberTaken } from '../vouchers/shared.tsx';
import { PrintInvoice } from './print.tsx';
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
  dmy,
  enterToNext,
  focusNav,
  type GridCol,
  useOnce,
} from './shared.tsx';
import { useCanEdit } from '../../access.tsx';

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
  other: 6,
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

/** The Other Details popup's boxes, in Enter order. */
const OTHER = [
  ['mobile', 'Mobile'],
  ['address', 'Address'],
  ['area', 'Area'],
  ['city', 'City'],
  ['gstNo', 'GST No'],
  ['narration', 'Narration'],
] as const;

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
  /** A cash sale's Cash or Bank ledger. */
  cashAccount: string;
  narration: string;
};

type Entry = {
  item: Item | null;
  qty: string;
  rate: string;
  discPct: string;
  discAmt: string;
  /** Which discount box was typed in; the other one is worked out from it. */
  discBy: 'pct' | 'amt';
  line: number | null;
};
const blankEntry = (): Entry => ({
  item: null,
  qty: fq(0),
  rate: fa(0),
  discPct: '0.00',
  discAmt: fa(0),
  discBy: 'pct',
  line: null,
});
const num = (s: string) => Number(s) || 0;
/** Every state by name, for a walk-in customer's State. */
const STATE_NAMES = [...new Set(Object.values(GST_STATES))].sort();
const nextNo = async (prefix?: string) =>
  (await unwrap(api.api.sales.next.$get({ query: prefix ? { prefix } : {} }))).billNo;

export function SalesInvoiceScreen() {
  // Role Permissions: on a View only page nothing can be saved, changed or cancelled.
  const canEdit = useCanEdit();
  const once = useOnce();
  // A cancelled document is shown for reference only: no Save until New.
  const [shownCancelled, setShownCancelled] = useState(false);
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
  // Item Code or Item Name first, as the Admin set it in Company Settings.
  const codeFirst = () => preferences().itemEntry === 'code';
  const [byCode, setByCode] = useState(codeFirst);
  const [otherOpen, setOtherOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [errors, setErrors] = useState<{ saleType?: boolean; customer?: boolean }>({});
  const [saving, setSaving] = useState(false);
  const [list, setList] = useState<ListRow[] | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);
  /** The bill last saved here, offered first by Sale Print. */
  const [lastSaved, setLastSaved] = useState('');
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
    billDiscAmt: fa(0),
    cashAccount: data?.cashAccounts[0]?.code ?? '',
    narration: '',
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
  // The lookups show each item's Unit, GST % and Rate beside it.
  // Inactive items can't go on a new line (2026-11-14); old lines keep their stored name.
  const itemRefs = data.items
    .filter((i) => i.isActive)
    .map((i) => ({
      ...i,
      extra: [i.unit, `GST ${i.gstRate}%`, i.saleRate > 0 ? `₹${fa(i.saleRate)}` : '']
        .filter(Boolean)
        .join('  ·  '),
    }));
  const gstRateOf = (code: string) => data.items.find((i) => i.code === code)?.gstRate ?? 0;
  const totals = saleTotals(lines, num(h.billDiscPct), num(h.billDiscAmt));
  // The entry row's discount: the box typed in wins, the other shows what it comes to.
  const disP = entry.discBy === 'pct' ? num(entry.discPct) : 0;
  const disA = entry.discBy === 'amt' ? num(entry.discAmt) : 0;
  const gross = num(entry.qty) * num(entry.rate);
  const shownPct =
    entry.discBy === 'pct' ? entry.discPct : gross > 0 ? f2((disA / gross) * 100) : '0.00';
  const shownAmt = entry.discBy === 'amt' ? entry.discAmt : fa(Math.round(gross * disP) / 100);
  const entryLine = entry.item
    ? saleLine({
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

  /** A new State can change the supply type, so every line is recomputed. Blank counts as the
   *  company's own state. */
  const applyState = (state: string) => {
    const inter = isInterState(data.companyStateCode, stateCodeOfName(state));
    set({ state, interState: inter });
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
  };

  /** The address block comes from the ledger, the State too (else the state of its code). */
  const onCustomer = (c: Customer) => {
    set({
      customer: c,
      custName: c.name,
      address: c.address,
      city: c.city,
      mobile: c.mobile,
      gstNo: c.gstNo,
    });
    applyState(c.state.trim() || GST_STATES[c.stateCode] || '');
    setErrors((e) => ({ ...e, customer: false }));
    focusNav(NAV.other);
  };

  const onItem = (it: Item) => {
    setEntry((x) => ({
      ...x,
      item: it,
      rate: it.saleRate > 0 && num(x.rate) === 0 ? fa(it.saleRate) : x.rate,
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
      disP,
      disA,
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
      isActive: false,
    };
    setEntry({
      item: it,
      qty: fq(l.qty),
      rate: fa(l.rate),
      discPct: f2(l.disP),
      discAmt: fa(l.disA),
      discBy: l.disP > 0 ? 'pct' : 'amt',
      line: i,
    });
    focusNav(NAV.qty);
  };

  const removeLine = (i: number) => {
    setLines((ls) => ls.filter((_, k) => k !== i));
    if (entry.line === i) setE({ line: null });
  };

  const newBill = async () => {
    setShownCancelled(false);
    const billNo = await nextNo(firstType()?.prefix);
    // Masters added meanwhile (another tab) show up on the fresh bill.
    void setup.refetch();
    setH(blankHeader(billNo));
    setLines([]);
    setEditing(null);
    setErrors({});
    setByCode(codeFirst());
    setEntry(blankEntry());
    focusNav(NAV.saleType);
  };

  const save = async () => {
    // The form's validators: Sale Type and the customer turn red.
    const e = { saleType: !h.saleType, customer: !h.custName.trim() };
    setErrors(e);
    // The message too, not just the red box (MDA's text was hidden: Q-22).
    if (e.saleType) toast(sm.saleTypeRequired, 'error');
    else if (e.customer) toast(sm.customerRequired, 'error');
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
      stateCode: stateCodeOfName(h.state) || null,
      mobile: h.mobile,
      gstNo: h.gstNo,
      location: h.location,
      billDiscPct: num(h.billDiscPct),
      billDiscAmt: num(h.billDiscAmt),
      interState: h.interState,
      cashAccount: h.isCash ? h.cashAccount || null : null,
      narration: h.narration,
      lines: lines.map((l) => ({
        itemCode: l.itemCode,
        itemName: l.itemName,
        hsnNo: l.hsnNo,
        unit: l.unit,
        // The bill's Location applies to every line (MDA stamped it as each line was added).
        location: h.location.trim() || null,
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
      setLastSaved(h.billNo);
      await queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      await newBill();
    } catch (err) {
      toast(errorText(err), 'error');
      // The number was taken meanwhile (another user or tab): take the next free one, so the
      // message's "Save again" works.
      if (editing === null && numberTaken(err)) {
        const billNo = await nextNo(h.billNo.replace(/\d+$/, '') || undefined).catch(() => '');
        if (billNo) setH((x) => (x ? { ...x, billNo } : x));
      }
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
      // A customer no longer listed (inactive, or moved) keeps its link (MDA dropped it: Q-53).
      customer:
        data.customers.find((c) => c.code === bill.custCode) ??
        (bill.custCode
          ? {
              code: bill.custCode,
              name: bill.custName,
              address: bill.address,
              city: bill.city,
              state: bill.state,
              stateCode: stateCodeOfName(bill.state),
              mobile: bill.mobile,
              gstNo: bill.gstNo,
            }
          : null),
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
      billDiscAmt: fa(bill.billDiscAmt),
      cashAccount: bill.cashAccount,
      narration: bill.narration,
    });
    setLines(bill.lines);
    setEditing(cancelled ? null : bill.billNo);
    setShownCancelled(cancelled);
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

  const text = (
    id: 'area' | 'city' | 'address' | 'mobile' | 'gstNo' | 'location' | 'narration',
  ) => (
    <input
      id={`si-${id}`}
      data-nav={id === 'location' ? NAV.location : undefined}
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
          items={itemRefs}
          hint={kind === 'code' ? 'Type to search by code' : 'Type to search by name'}
          showCode={kind === 'code'}
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

  const chips = <>{editing && <Chip tone="warn">Editing {editing}</Chip>}</>;

  // Filled boxes in the popup, shown on its button so nothing there goes unseen.
  const otherCount = OTHER.filter(([k]) => h[k].trim()).length;
  const openOther = () => {
    setOtherOpen(true);
    // The cursor starts on the popup's first box.
    setTimeout(() => document.getElementById(`si-${OTHER[0][0]}`)?.focus(), 50);
  };
  const closeOther = () => {
    setOtherOpen(false);
    focusNav(NAV.item);
  };

  return (
    <>
      <TransactionPage title={['Sales', 'Invoice']} chips={chips}>
        <div
          className="flex min-h-0 flex-1 flex-col gap-2"
          onKeyDown={(e) =>
            enterToNext(e, {
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
                format={dmy}
                className={boxClass()}
                onChange={(billDate, how) => {
                  set({ billDate });
                  // Typed + Enter moves on by itself; a calendar pick moves on here.
                  if (how === 'calendar') focusNav(NAV.location);
                }}
              />
            </Cell>
            <Cell id="si-location" label="Location">
              {data.godowns.length ? (
                <Lookup<{ code: string; name: string }>
                  id="si-location"
                  nav={NAV.location}
                  value={data.godowns.find((g) => g.name === h.location) ?? null}
                  items={data.godowns}
                  hint="Select godown"
                  onChange={(g) => {
                    set({ location: g.name });
                    focusNav(NAV.customer);
                  }}
                />
              ) : (
                text('location')
              )}
            </Cell>
            <div className="col-span-5 grid grid-cols-[4fr_3fr_2fr_3fr_auto] gap-x-2.5 gap-y-1.5 max-lg:col-span-3 max-md:col-span-2 max-md:grid-cols-2">
              <Cell id="si-customer" label="Name" required className="max-md:col-span-2">
                <div className="flex gap-1.5">
                  <div className="min-w-0 flex-1">
                    <Lookup<Customer>
                      id="si-customer"
                      nav={NAV.customer}
                      value={
                        h.customer ??
                        (h.custName ? ({ code: '', name: h.custName } as Customer) : null)
                      }
                      items={data.customers.map((c) => ({ ...c, extra: c.gstNo }))}
                      hint={data.customers.length ? 'Type to search customer' : sm.noCustomersHint}
                      error={errors.customer}
                      onChange={onCustomer}
                      onFreeText={
                        h.isCash
                          ? (name) => {
                              // A walk-in customer: no ledger, just the name on the bill.
                              set({ customer: null, custName: name });
                              setErrors((x) => ({ ...x, customer: false }));
                            }
                          : undefined
                      }
                    />
                  </div>
                  {/* A new customer (under Sundry Debtors), picked here once saved. */}
                  <NewLedgerButton
                    under={CUSTOMER_GROUP}
                    onCreated={(code) =>
                      void setup.refetch().then((r) => {
                        const c = r.data?.customers.find((x) => x.code === code);
                        if (c) onCustomer(c);
                      })
                    }
                  />
                </div>
              </Cell>
              {/* Read-only (user's request, 2026-11-13): the State is the customer's, from its
                  ledger; change it in Ledger Creation. */}
              <Cell id="si-state" label="State">
                {h.customer ? (
                  <ReadOnly text={h.state || '—'} />
                ) : (
                  <select
                    id="si-state"
                    value={h.state}
                    onChange={(e) => applyState(e.target.value)}
                    className={boxClass()}
                  >
                    <option value="">Own state</option>
                    {STATE_NAMES.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                )}
              </Cell>
              {h.isCash && (
                <Cell id="si-cashAccount" label="Cash / Bank A/c">
                  <select
                    id="si-cashAccount"
                    value={h.cashAccount}
                    onChange={(e) => set({ cashAccount: e.target.value })}
                    className={boxClass()}
                  >
                    {!data.cashAccounts.length && <option value="">Cash</option>}
                    {data.cashAccounts.map((a) => (
                      <option key={a.code} value={a.code}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </Cell>
              )}
              <Cell label="GST">
                <ReadOnly text={h.interState ? 'IGST' : 'CGST + SGST'} strong />
              </Cell>
              <button
                type="button"
                data-nav={NAV.other}
                onClick={openOther}
                className="flex h-[34px] cursor-pointer items-center justify-center gap-1.5 self-end whitespace-nowrap border-[1.5px] border-foreground px-3 text-[15px] font-semibold max-md:col-span-2"
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
              <div className="col-span-6 grid grid-cols-[1fr_1fr_auto] items-end gap-2.5 max-lg:col-span-3 max-sm:col-span-2 max-sm:grid-cols-[1fr_auto]">
                {/* The box typed in comes first and the grid follows the same order (Name |
                    Code or Code | Name); the switch starts on Company Settings › Item Entry
                    (user's request, 2026-11-09). */}
                {byCode ? itemBox('code', true) : itemBox('name', true)}
                {byCode ? itemBox('name', false) : itemBox('code', false)}
                {/* A new stock item (Masters › Stock Item), picked here once saved. */}
                <NewItemButton
                  onCreated={(code) =>
                    void setup.refetch().then((r) => {
                      const it = r.data?.items.find((x) => x.code === code);
                      if (it) onItem(it);
                    })
                  }
                />
              </div>
              <Cell id="si-qty" label="Required Qty" required>
                <NumBox
                  id="si-qty"
                  format={fq}
                  nav={NAV.qty}
                  value={entry.qty}
                  onChange={(qty) => setE({ qty })}
                />
              </Cell>
              <Cell id="si-rate" label="Rate">
                <NumBox
                  id="si-rate"
                  format={fa}
                  nav={NAV.rate}
                  value={entry.rate}
                  onChange={(rate) => setE({ rate })}
                />
              </Cell>
              <Cell id="si-discPct" label="Discount %">
                <NumBox
                  id="si-discPct"
                  nav={NAV.discPct}
                  value={shownPct}
                  // Percent and amount are alternatives; the other box follows the one typed.
                  onChange={(discPct) => setE({ discPct, discBy: 'pct' })}
                />
              </Cell>
              <Cell id="si-discAmt" label="Discount Amount">
                <NumBox
                  id="si-discAmt"
                  format={fa}
                  nav={NAV.discAmt}
                  value={shownAmt}
                  onChange={(discAmt) => setE({ discAmt, discBy: 'amt' })}
                />
              </Cell>
              <Cell label="Amount">
                <ReadOnly text={fa(entryLine?.lineTotal ?? 0)} right />
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
              cols={gstCols(byCode ? COLS_CODE_FIRST : COLS_NAME_FIRST, h.interState)}
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
                <Total label="Qty" value={fq(totals.qty)} />
                <Total label="Sub Total" value={fa(totals.subTotal)} />
                {/* The bill discount comes off before tax (2026-11-14). */}
                {totals.billDisc > 0 && <Total label="Less Discount" value={fa(totals.billDisc)} />}
                {h.interState ? (
                  <Total label="IGST" value={fa(totals.igst)} />
                ) : (
                  <>
                    <Total label="CGST" value={fa(totals.cgst)} />
                    <Total label="SGST" value={fa(totals.sgst)} />
                  </>
                )}
                {totals.itemDisc > 0 && (
                  <Total label="Discount On Items" value={fa(totals.itemDisc)} />
                )}
                <span className="flex-1" />
                <Total
                  label="Total"
                  value={fa(
                    round2(
                      totals.subTotal - totals.billDisc + totals.cgst + totals.sgst + totals.igst,
                    ),
                  )}
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
                          ? { billDiscPct, billDiscAmt: fa(0) }
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
                    format={fa}
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
                <Total label="Round Off" value={fa(totals.roundOff)} />
                <span className="flex-1" />
                <span className="flex items-center gap-2">
                  <span className="text-sm font-bold text-destructive">Grand Total Rs.</span>
                  <span className="border-[1.5px] border-foreground bg-background px-3 py-0.5 font-mono text-lg font-bold">
                    {fa(totals.net)}
                  </span>
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="flex flex-none flex-wrap items-center gap-2.5 border-t-[3px] border-double border-foreground pt-2 max-sm:[&>button]:flex-[1_1_40%]">
          <button type="button" onClick={() => setPrintOpen(true)} className={BAR_BTN}>
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
            disabled={!editing || !canEdit}
            onClick={() => setConfirm(true)}
            className={`${BAR_BTN} border-destructive text-destructive`}
          >
            Cancel Bill
          </button>
          <span className="flex-1 max-sm:hidden" />
          <button
            type="button"
            data-nav={NAV.save}
            onClick={() => void once(save)}
            disabled={saving || !canEdit || shownCancelled}
            className="flex h-11 min-w-[200px] cursor-pointer items-center justify-between gap-4 bg-primary max-lg:min-w-[130px] px-[22px] text-[15px] font-semibold text-primary-foreground disabled:cursor-wait disabled:opacity-70 max-sm:order-last max-sm:w-full max-sm:min-w-0"
          >
            <span>{saving ? 'Saving...' : editing === null ? 'Save' : 'Update'}</span>
            <span aria-hidden="true" className="text-xl">
              →
            </span>
          </button>
        </div>
      </TransactionPage>

      <PrintInvoice
        kind="sale"
        open={printOpen}
        defaultNo={editing ?? lastSaved}
        onDone={() => setPrintOpen(false)}
      />
      <Dialog
        open={otherOpen}
        onClose={() => setOtherOpen(false)}
        title={['Other', 'Details']}
        className="w-[560px]"
      >
        <div className="flex flex-col gap-3 px-[26px] pb-[22px] pt-[14px]">
          <div
            className="grid grid-cols-2 gap-x-2.5 gap-y-1.5 max-sm:grid-cols-1"
            // Enter walks the boxes; on the last one it closes and goes to the item.
            onKeyDown={(e) => {
              if (e.key !== 'Enter' || e.defaultPrevented || e.shiftKey) return;
              const i = OTHER.findIndex(([k]) => `si-${k}` === (e.target as HTMLElement).id);
              if (i < 0) return;
              e.preventDefault();
              if (i < OTHER.length - 1) document.getElementById(`si-${OTHER[i + 1]![0]}`)?.focus();
              else closeOther();
            }}
          >
            {OTHER.map(([k, label]) => (
              <Cell
                key={k}
                id={`si-${k}`}
                label={label}
                className={k === 'address' ? 'col-span-2 max-sm:col-span-1' : undefined}
              >
                {text(k)}
              </Cell>
            ))}
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={closeOther}
              className="flex h-11 cursor-pointer items-center bg-primary px-5 text-[15px] font-semibold text-primary-foreground"
            >
              Done
            </button>
          </div>
        </div>
      </Dialog>
      <SaleList
        open={!!list}
        rows={list ?? []}
        onPick={(r) =>
          void loadBill(r.billNo).catch((err: unknown) => toast(errorText(err), 'error'))
        }
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

/** MDA's grid columns for a sale (`_cols`), HSN Code last; Itm.Name takes the spare width.
 *  Name and Code swap places to match the entry boxes. */
const SNO: GridCol<SaleLine> = { label: 'SNo.', w: '42px', cell: (_, i) => String(i + 1) };
const CODE: GridCol<SaleLine> = { label: 'Itm.Code', w: '74px', cell: (l) => l.itemCode };
const NAME: GridCol<SaleLine> = {
  label: 'Itm.Name',
  w: 'minmax(130px,1fr)',
  cell: (l) => l.itemName,
};
const AMOUNTS: GridCol<SaleLine>[] = [
  { label: 'Qty.', w: '80px', num: true, cell: (l) => fq(l.qty) },
  { label: 'Rate', w: '72px', num: true, cell: (l) => fa(l.rate) },
  { label: 'DisP', w: '48px', num: true, cell: (l) => f2(l.disP) },
  { label: 'DisA', w: '62px', num: true, cell: (l) => fa(l.disA) },
  { label: 'Amount', w: '82px', num: true, cell: (l) => fa(l.amount) },
  { label: 'SGST%', w: '54px', num: true, cell: (l) => f2(l.sgstP) },
  { label: 'SGST', w: '66px', num: true, cell: (l) => fa(l.sgstA) },
  { label: 'CGST%', w: '54px', num: true, cell: (l) => f2(l.cgstP) },
  { label: 'CGST', w: '66px', num: true, cell: (l) => fa(l.cgstA) },
  { label: 'IGST%', w: '54px', num: true, cell: (l) => f2(l.igstP) },
  { label: 'IGST', w: '66px', num: true, cell: (l) => fa(l.igstA) },
  { label: 'HSN Code', w: '78px', cell: (l) => l.hsnNo ?? '' },
];
const COLS_NAME_FIRST = [SNO, NAME, CODE, ...AMOUNTS];
/** Only the tax that applies (user's request, 2026-11-13): IGST on an inter-state bill, else
 *  SGST and CGST. */
const gstCols = (cols: GridCol<SaleLine>[], inter: boolean) =>
  cols.filter((c) => (inter ? !/^[SC]GST/.test(c.label) : !/^IGST/.test(c.label)));
const COLS_CODE_FIRST = [SNO, CODE, NAME, ...AMOUNTS];
