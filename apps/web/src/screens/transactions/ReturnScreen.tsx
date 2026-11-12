// Purchase Return and Sales Return (added at the user's request, 2026-11-09; MDA only seeded
// their PRT/SRT series). One screen for both:
//   - Pick the bill the goods came on ("Against Bill No.": type its number or the party's name);
//     the party, its State and the GST split come from that bill and can't be changed here.
//   - The bill's items load; enter how many of each go back. Nothing more than what is left on
//     the bill (billed less earlier returns) can be returned. Rate, discount and GST rate are the
//     bill's own.
//   - Save posts the return (stock out to the supplier / back in from the customer, the Return
//     ledger, the tax, and less owed / less due); Update keeps the number; Cancel reverses it.
//   - Printed as a Debit Note (purchase return) or a Credit Note (sales return).
//   - Item Name or Item Code comes first in the grid, as Company Settings › Item Entry says.

import {
  f2,
  returnLine,
  returnMessages as rm,
  returnTotals,
  type BillLineForReturn,
  type ReturnKind,
} from '@qi/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { api, unwrap, type OkBody } from '../../api.ts';
import { ConfirmDelete, Dialog } from '../../components/Dialog.tsx';
import { toast } from '../../components/Toast.tsx';
import { fa, fq } from '../../format.ts';
import { preferences } from '../../prefs.ts';
import { DateBox, defaultVoucherDate, errorText, numberTaken } from '../vouchers/shared.tsx';
import { PrintInvoice } from './print.tsx';
import {
  BAR_BTN,
  Cell,
  Chip,
  Lookup,
  NumBox,
  ReadOnly,
  Total,
  TransactionPage,
  boxClass,
  dmy,
  enterToNext,
  focusNav,
  useOnce,
} from './shared.tsx';
import { useCanEdit } from '../../access.tsx';

type Bill = NonNullable<OkBody<Awaited<ReturnType<typeof api.api.returns.bill.$get>>>['bill']>;
type ListRow = OkBody<Awaited<ReturnType<typeof api.api.returns.$get>>>[number];

/** Enter order: Date → Against Bill → Narration → each Return Qty → Save. */
const NAV = { date: 1, bill: 2, narration: 3, qty: 10, save: 999 } as const;

const num = (s: string) => Number(s) || 0;

export function ReturnScreen({ kind }: { kind: ReturnKind }) {
  // Role Permissions: on a View only page nothing can be saved, changed or cancelled.
  const canEdit = useCanEdit();
  const once = useOnce();
  // A cancelled document is shown for reference only: no Save until New.
  const [shownCancelled, setShownCancelled] = useState(false);
  const title = rm.title(kind);
  const words: [string, string] = kind === 'PRT' ? ['Purchase', 'Return'] : ['Sales', 'Return'];
  const party = kind === 'PRT' ? 'Supplier' : 'Customer';
  const queryClient = useQueryClient();
  const me = useQuery({ queryKey: ['book-me'], queryFn: () => unwrap(api.api.book.me.$get()) });
  const setup = useQuery({
    queryKey: ['return-setup', kind],
    queryFn: () => unwrap(api.api.returns.setup.$get({ query: { kind } })),
    staleTime: 0,
    gcTime: 0,
  });

  const [returnNo, setReturnNo] = useState('');
  const [date, setDate] = useState('');
  const [bill, setBill] = useState<Bill | null>(null);
  /** Return Qty typed per bill line (by its line number). */
  const [qtys, setQtys] = useState<Record<number, string>>({});
  const [narration, setNarration] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [billError, setBillError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [list, setList] = useState<ListRow[] | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);
  const [lastSaved, setLastSaved] = useState('');
  const started = useRef(false);

  // First load: a fresh return with the cursor on the bill.
  useEffect(() => {
    if (!setup.data || !me.data || started.current) return;
    started.current = true;
    setReturnNo(setup.data.returnNo);
    setDate(defaultVoucherDate(me.data.fyFrom, me.data.fyTo));
    focusNav(NAV.bill);
  }, [setup.data, me.data]);

  if (!setup.data || !me.data || !returnNo) {
    return <TransactionPage title={words}>{null}</TransactionPage>;
  }
  const bills = setup.data.bills.map((b) => ({
    code: b.billNo,
    name: b.partyName,
    extra: `${dmy(b.billDate)}  ·  ₹${fa(b.net)}`,
  }));

  // ── The return as typed ──
  const lines = (bill?.lines ?? []).flatMap((l) => {
    const q = num(qtys[l.lineNo] ?? '');
    return q > 0 ? [returnLine(l, q, bill!.interState)] : [];
  });
  const t = returnTotals(kind, lines, bill?.billDiscPct ?? 0);
  const over = (l: BillLineForReturn) => num(qtys[l.lineNo] ?? '') > l.left + 0.0005;

  const loadBill = async (billNo: string, except?: string) => {
    const { bill: b } = await unwrap(
      api.api.returns.bill.$get({ query: { kind, no: billNo, ...(except ? { except } : {}) } }),
    );
    return b;
  };

  const pickBill = async (billNo: string) => {
    const b = await loadBill(billNo, editing ?? undefined);
    if (!b) return toast(rm.billNotFound, 'error');
    setBill(b);
    setQtys({});
    setBillError(false);
    focusNav(NAV.narration);
  };

  const fresh = async () => {
    setShownCancelled(false);
    const s = await setup.refetch();
    setReturnNo(s.data?.returnNo ?? returnNo);
    setDate(defaultVoucherDate(me.data.fyFrom, me.data.fyTo));
    setBill(null);
    setQtys({});
    setNarration('');
    setEditing(null);
    setBillError(false);
    focusNav(NAV.bill);
  };

  const save = async () => {
    if (!bill) {
      setBillError(true);
      toast(rm.billRequired, 'error');
      return focusNav(NAV.bill);
    }
    const bad = bill.lines.find(over);
    if (bad) {
      toast(rm.tooMuch(bad.itemName, bad.left), 'error');
      return focusNav(NAV.qty + bill.lines.indexOf(bad));
    }
    if (!lines.length) {
      toast(rm.nothingReturned, 'error');
      return focusNav(NAV.qty);
    }
    if (saving) return;
    setSaving(true);
    const json = {
      kind,
      returnNo,
      returnDate: date,
      againstBillNo: bill.billNo,
      narration,
      lines: bill.lines
        .filter((l) => num(qtys[l.lineNo] ?? '') > 0)
        .map((l) => ({ srcLineNo: l.lineNo, qty: num(qtys[l.lineNo] ?? '') })),
    };
    try {
      const r =
        editing === null
          ? await unwrap(api.api.returns.$post({ json }))
          : await unwrap(api.api.returns.$put({ json }));
      toast(editing === null ? rm.saved(kind, r.returnNo, r.net) : rm.updated(kind, r.returnNo));
      setLastSaved(r.returnNo);
      await queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      await fresh();
    } catch (err) {
      toast(errorText(err), 'error');
      // The number was taken meanwhile (another user or tab): take the next free one, so the
      // message's "Save again" works.
      if (editing === null && numberTaken(err)) {
        const s = await setup.refetch();
        if (s.data?.returnNo) setReturnNo(s.data.returnNo);
      }
    }
    setSaving(false);
  };

  const showAll = async () => {
    try {
      setList(await unwrap(api.api.returns.$get({ query: { kind } })));
    } catch (err) {
      toast(errorText(err), 'error');
    }
  };

  const open = async (no: string) => {
    setList(null);
    const { doc } = await unwrap(api.api.returns.doc.$get({ query: { kind, no } }));
    if (!doc) return;
    const cancelled = doc.status === 'Cancelled';
    // What's left on the bill, counting everything but this return.
    const b = await loadBill(doc.againstBillNo, doc.returnNo);
    setReturnNo(doc.returnNo);
    setDate(doc.returnDate);
    setBill(b);
    setQtys(Object.fromEntries(doc.lines.map((l) => [l.srcLineNo, fq(l.qty)])));
    setNarration(doc.narration);
    setEditing(cancelled ? null : doc.returnNo);
    setShownCancelled(cancelled);
    setBillError(false);
    if (cancelled) toast(rm.shownCancelled(doc.returnNo), 'error');
  };

  const cancel = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      await unwrap(api.api.returns.cancel.$post({ json: { kind, returnNo: editing } }));
      toast(rm.cancelled(kind, editing));
      setConfirm(false);
      await fresh();
    } catch (err) {
      toast(errorText(err), 'error');
    }
    setConfirm(false);
    setSaving(false);
  };

  const returnAll = () => {
    if (!bill) return;
    setQtys(Object.fromEntries(bill.lines.map((l) => [l.lineNo, l.left > 0 ? fq(l.left) : ''])));
  };

  // Item Name or Item Code first, as the Admin set it.
  const codeFirst = preferences().itemEntry === 'code';
  const head = 'px-2 py-1.5 text-left font-mono text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground';
  const cell = 'px-2 py-1 text-sm';
  const numCell = `${cell} text-right font-mono tabular-nums`;

  return (
    <>
      <TransactionPage
        title={words}
        chips={<>{editing && <Chip tone="warn">Editing {editing}</Chip>}</>}
      >
        <div
          className="flex min-h-0 flex-1 flex-col gap-2"
          onKeyDown={(e) => enterToNext(e)}
        >
          {/* ── Header ── */}
          <div className="grid grid-cols-6 gap-x-2.5 gap-y-1.5 border border-border bg-card px-3 py-2 max-lg:grid-cols-3 max-md:grid-cols-2">
            <Cell label="Return No." required>
              <ReadOnly text={returnNo} strong />
            </Cell>
            <Cell id="rt-date" label="Date" required>
              <DateBox
                id="rt-date"
                data-nav={NAV.date}
                value={date}
                min={me.data.fyFrom}
                max={me.data.fyTo}
                format={dmy}
                className={boxClass()}
                onChange={(d, how) => {
                  setDate(d);
                  if (how === 'calendar') focusNav(NAV.bill);
                }}
              />
            </Cell>
            <Cell id="rt-bill" label="Against Bill No." required className="col-span-2 max-md:col-span-2">
              <Lookup
                id="rt-bill"
                nav={NAV.bill}
                value={bill ? { code: bill.billNo, name: bill.partyName, extra: "" } : null}
                items={bills}
                showCode
                hint={bills.length ? `Bill no. or ${party.toLowerCase()} name` : rm.noBills(kind)}
                error={billError}
                onChange={(b) => void pickBill(b.code)}
              />
            </Cell>
            <Cell label="Bill Date">
              <ReadOnly text={bill ? dmy(bill.billDate) : ''} />
            </Cell>
            <Cell label="GST">
              <ReadOnly text={bill ? (bill.interState ? 'IGST' : 'CGST + SGST') : ''} strong />
            </Cell>
            <Cell label={party} className="col-span-2 max-md:col-span-2">
              <ReadOnly text={bill?.partyName ?? ''} strong />
            </Cell>
            <Cell label="State">
              <ReadOnly text={bill?.state ?? ''} />
            </Cell>
            <Cell id="rt-narration" label="Narration" className="col-span-3 max-lg:col-span-3 max-md:col-span-2">
              <input
                id="rt-narration"
                data-nav={NAV.narration}
                value={narration}
                placeholder="Reason for the return (optional)"
                autoComplete="off"
                onChange={(e) => setNarration(e.target.value)}
                className={boxClass()}
              />
            </Cell>
          </div>

          {/* ── Items of the bill ── */}
          <div className="flex min-h-0 flex-1 flex-col gap-1.5 border border-border bg-accent/40 px-3 py-2">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <h2 className="m-0 font-mono text-xs font-medium uppercase tracking-[0.12em] text-primary-text">
                Returned Item Detail
              </h2>
              <span className="flex-1" />
              {bill && (
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={returnAll}
                  className="flex h-8 cursor-pointer items-center border-[1.5px] border-foreground px-3 text-sm font-semibold"
                >
                  Return all
                </button>
              )}
            </div>
            <div className="min-h-0 flex-1 overflow-auto border border-border bg-card">
              <table className="w-full min-w-[1060px] border-collapse">
                <thead className="sticky top-0 bg-card">
                  <tr className="border-b border-border">
                    <th className={`${head} w-[44px]`}>SNo.</th>
                    {codeFirst && <th className={`${head} w-[90px]`}>Code</th>}
                    <th className={head}>Item Name</th>
                    {!codeFirst && <th className={`${head} w-[90px]`}>Code</th>}
                    <th className={`${head} w-[84px] text-right`}>Billed</th>
                    <th className={`${head} w-[84px] text-right`}>Returned</th>
                    <th className={`${head} w-[84px] text-right`}>Left</th>
                    <th className={`${head} w-[120px] text-right`}>Return Qty</th>
                    <th className={`${head} w-[84px] text-right`}>Rate</th>
                    <th className={`${head} w-[60px] text-right`}>Disc %</th>
                    <th className={`${head} w-[96px] text-right`}>Taxable</th>
                    <th className={`${head} w-[60px] text-right`}>GST %</th>
                    <th className={`${head} w-[96px] text-right`}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {!bill && (
                    <tr>
                      <td colSpan={13} className="px-2 py-10 text-center text-sm text-muted-foreground">
                        Select the bill the goods are returned against
                      </td>
                    </tr>
                  )}
                  {bill?.lines.map((l, i) => {
                    const q = num(qtys[l.lineNo] ?? '');
                    const r = q > 0 ? returnLine(l, q, bill.interState) : null;
                    const disc =
                      l.disP > 0 ? l.disP : l.qty * l.rate > 0 ? (l.disA / (l.qty * l.rate)) * 100 : 0;
                    const bad = over(l);
                    return (
                      <tr key={l.lineNo} className={`border-b border-border ${q > 0 ? 'bg-accent/60' : ''}`}>
                        <td className={cell}>{i + 1}</td>
                        {codeFirst && <td className={`${cell} font-mono text-xs`}>{l.itemCode}</td>}
                        <td className={cell}>{l.itemName}</td>
                        {!codeFirst && <td className={`${cell} font-mono text-xs`}>{l.itemCode}</td>}
                        <td className={numCell}>{fq(l.qty)}</td>
                        <td className={`${numCell} text-muted-foreground`}>
                          {l.returned > 0 ? fq(l.returned) : ''}
                        </td>
                        <td className={numCell}>{fq(l.left)}</td>
                        <td className="px-1 py-0.5">
                          <NumBox
                            id={`rt-qty-${l.lineNo}`}
                            nav={NAV.qty + i}
                            format={fq}
                            value={qtys[l.lineNo] ?? ''}
                            error={bad}
                            onChange={(v) => setQtys((x) => ({ ...x, [l.lineNo]: v }))}
                          />
                        </td>
                        <td className={numCell}>{fa(l.rate)}</td>
                        <td className={numCell}>{disc > 0 ? f2(disc) : ''}</td>
                        <td className={numCell}>{r ? fa(r.amount) : ''}</td>
                        <td className={numCell}>{f2(l.sgstP + l.cgstP + l.igstP)}</td>
                        <td className={`${numCell} font-semibold`}>{r ? fa(r.lineTotal) : ''}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Totals */}
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border border-border bg-card px-3 py-1">
              <Total label="Qty" value={fq(t.qty)} />
              <Total label="Sub Total" value={fa(t.subTotal)} />
              <Total label="SGST" value={fa(t.sgst)} />
              <Total label="CGST" value={fa(t.cgst)} />
              <Total label="IGST" value={fa(t.igst)} />
              {t.billDisc > 0 && <Total label="Bill Discount" value={fa(-t.billDisc)} />}
              {t.roundOff !== 0 && <Total label="Round Off" value={fa(t.roundOff)} />}
              <span className="flex-1" />
              <span className="flex items-center gap-2">
                <span className="text-sm font-semibold text-muted-foreground">Net Amount</span>
                <span className="border-[1.5px] border-foreground bg-background px-3 py-0.5 font-mono text-lg font-bold">
                  {fa(t.net)}
                </span>
              </span>
            </div>
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="flex flex-none flex-wrap items-center gap-2.5 border-t-[3px] border-double border-foreground pt-2 max-sm:[&>button]:flex-[1_1_40%]">
          <button type="button" onClick={() => setPrintOpen(true)} className={BAR_BTN}>
            {rm.noteTitle(kind)} Print
          </button>
          <button type="button" onClick={() => void showAll()} className={BAR_BTN}>
            Show All Returns
          </button>
          <button type="button" onClick={() => void fresh()} className={BAR_BTN}>
            New Return
          </button>
          <button
            type="button"
            disabled={!editing || !canEdit}
            onClick={() => setConfirm(true)}
            className={`${BAR_BTN} border-destructive text-destructive`}
          >
            Cancel Return
          </button>
          <span className="flex-1 max-sm:hidden" />
          <button
            type="button"
            data-nav={NAV.save}
            onClick={() => void once(save)}
            disabled={saving || !canEdit || shownCancelled}
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
        kind={kind}
        open={printOpen}
        defaultNo={editing ?? lastSaved}
        onDone={() => setPrintOpen(false)}
      />
      <ReturnList
        title={title}
        party={party}
        open={!!list}
        rows={list ?? []}
        onPick={(r) => void open(r.returnNo).catch((err: unknown) => toast(errorText(err), 'error'))}
        onClose={() => setList(null)}
      />
      <ConfirmDelete
        open={confirm}
        title={['Cancel', 'Return']}
        text={rm.cancelConfirm(kind, editing ?? returnNo)}
        confirmLabel="Cancel return"
        cancelLabel="Keep it"
        onCancel={() => setConfirm(false)}
        onConfirm={() => void cancel()}
        busy={saving}
      />
    </>
  );
}

/** "Show All Returns": every return of the kind, newest first, searchable; cancelled ones stay
 *  listed, struck through. */
function ReturnList({
  title,
  party,
  open,
  rows,
  onPick,
  onClose,
}: {
  title: string;
  party: string;
  open: boolean;
  rows: ListRow[];
  onPick: (r: ListRow) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const needle = q.trim().toLowerCase();
  const shown = needle
    ? rows.filter((r) =>
        [r.returnNo, r.againstBillNo, r.partyName].some((x) => x.toLowerCase().includes(needle)),
      )
    : rows;
  const close = () => {
    setQ('');
    onClose();
  };
  const cols =
    'grid grid-cols-[96px_92px_100px_minmax(0,1fr)_54px_104px_84px] gap-3 max-sm:grid-cols-[minmax(0,1fr)_96px] max-sm:gap-2';
  return (
    <Dialog open={open} onClose={close} title={['All', `${title}s`]} className="w-[860px]">
      <span className="absolute right-[26px] top-[30px] font-mono text-xs text-muted-foreground">
        {shown.length} return{shown.length === 1 ? '' : 's'}
      </span>
      <div className="px-[26px] pt-3 max-sm:px-4">
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={`Search by return no, bill no or ${party.toLowerCase()}`}
          aria-label="Search"
          className="h-11 w-full field-box px-3 text-base outline-none focus-visible:outline-none"
        />
      </div>
      <div
        className={`${cols} mt-3 border-y border-border px-[26px] py-2.5 font-mono text-xs uppercase tracking-[0.06em] text-muted-foreground max-sm:px-4`}
      >
        <span className="max-sm:hidden">Return No</span>
        <span className="max-sm:hidden">Date</span>
        <span className="max-sm:hidden">Against</span>
        <span>{party}</span>
        <span className="max-sm:hidden">Items</span>
        <span className="text-right">Net</span>
        <span className="max-sm:hidden" />
      </div>
      <div className="h-[46vh] overflow-y-auto max-sm:h-auto max-sm:max-h-[50vh]">
        {shown.length === 0 && (
          <p className="m-0 px-[26px] py-8 text-center text-sm text-muted-foreground">
            {rm.noReturns}
          </p>
        )}
        {shown.map((r) => {
          const cancelled = r.status === 'Cancelled';
          const strike = cancelled ? 'text-muted-foreground line-through' : '';
          return (
            <button
              key={r.returnNo}
              type="button"
              onClick={() => {
                setQ('');
                onPick(r);
              }}
              className={`${cols} min-h-11 w-full cursor-pointer items-center border-b border-border px-[26px] text-left text-sm hover:bg-accent max-sm:px-4`}
            >
              <span className={`font-mono text-xs font-semibold max-sm:hidden ${strike}`}>
                {r.returnNo}
              </span>
              <span className="font-mono text-xs text-muted-foreground max-sm:hidden">
                {dmy(r.returnDate)}
              </span>
              <span className="font-mono text-xs max-sm:hidden">{r.againstBillNo}</span>
              <span className="truncate">
                <span className="hidden font-mono text-xs max-sm:inline">{r.returnNo} · </span>
                {r.partyName || '-'}
              </span>
              <span className="text-muted-foreground max-sm:hidden">{r.itemCount}</span>
              <span className={`text-right font-mono font-semibold ${strike}`}>
                {fa(r.netAmount)}
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
          onClick={close}
          className="flex h-11 cursor-pointer items-center border-[1.5px] border-foreground px-[18px] text-sm font-semibold"
        >
          Close
        </button>
      </div>
    </Dialog>
  );
}
