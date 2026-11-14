// Purchase Return (PRT) and Sales Return (SRT), added at the user's request (2026-11-09); MDA
// only seeded their number series. See @qi/core returns.ts for the decisions taken.
//
// A save writes, in ONE transaction: the return and its lines, and a PRT/SRT voucher (same
// number as the return) with the ledger lines, item lines, the stock movement (out of the godown
// on a purchase return, back in on a sales return) and an "Agst" bill reference that reduces the
// party's outstanding, plus an audit entry. Update reposts under the same number; Cancel marks
// return and voucher Cancelled and removes the stock movement, as for bills.

import {
  ACTIVE,
  allocateBillDiscount,
  saleLine,
  CANCELLED,
  PURCHASE_GROUP_SEEDS,
  PURCHASE_LEDGER_SEEDS,
  RETURN_LEDGER_SEEDS,
  SALE_GROUP_SEEDS,
  SALE_LEDGER_SEEDS,
  purchaseReturnPosting,
  returnLine,
  returnMessages as rm,
  returnTotals,
  round2,
  saleBillDiscPct,
  salesReturnPosting,
  type BillLineForReturn,
  type PurcLine,
  type ReturnKind,
  type ReturnTotals,
} from '@qi/core';
import { and, asc, desc, eq, ne, schema, sql, type Db } from '@qi/db';
import { UserError } from './errors.ts';
import { purchaseBill } from './purchases.ts';
import { saleBill } from './sales.ts';
import { assertStockAvailable } from './stock.ts';
import { commitVoucherNo, nextVoucherNo, type PostingContext } from './vouchers.ts';

const {
  accountGroups,
  auditLog,
  billRefs,
  ledgers,
  purchases,
  returnLines,
  returns,
  sales,
  stockTrn,
  voucherItems,
  voucherLines,
  vouchers,
} = schema;

const money = (v: number) => v.toFixed(2);
const qty3 = (v: number) => String(Math.round(v * 1000) / 1000);
const r3 = (v: number) => Math.round(v * 1000) / 1000;

// ── The bills a return can be made against ──────────────────────────────────────

export type ReturnableBill = { billNo: string; billDate: string; partyName: string; net: number };

/** The kind's active bills, newest first, each with its party's name. */
export async function returnableBills(
  db: Db,
  bookId: string,
  kind: ReturnKind,
): Promise<ReturnableBill[]> {
  if (kind === 'PRT') {
    const rows = await db
      .select({
        billNo: purchases.billNo,
        billDate: purchases.billDate,
        partyName: ledgers.accName,
        code: purchases.suppCode,
        net: purchases.netAmount,
      })
      .from(purchases)
      .leftJoin(
        ledgers,
        and(eq(ledgers.bookId, purchases.bookId), eq(ledgers.accCode, purchases.suppCode)),
      )
      .where(and(eq(purchases.bookId, bookId), eq(purchases.status, ACTIVE)))
      .orderBy(desc(purchases.billDate), desc(purchases.billNo));
    return rows.map((r) => ({
      billNo: r.billNo,
      billDate: r.billDate,
      partyName: r.partyName ?? r.code,
      net: Number(r.net),
    }));
  }
  const rows = await db
    .select({
      billNo: sales.billNo,
      billDate: sales.billDate,
      partyName: sales.custName,
      net: sales.netAmount,
    })
    .from(sales)
    .where(and(eq(sales.bookId, bookId), eq(sales.status, ACTIVE)))
    .orderBy(desc(sales.billDate), desc(sales.billNo));
  return rows.map((r) => ({ ...r, partyName: r.partyName ?? '', net: Number(r.net) }));
}

/** The bill as a return sees it. */
export type BillForReturn = {
  billNo: string;
  billDate: string;
  /** The account a return settles against: supplier, credit customer, or the sale's Cash. */
  partyCode: string;
  partyName: string;
  /** Only a supplier or a credit customer has an outstanding to reduce. */
  onAccount: boolean;
  state: string;
  gstin: string;
  interState: boolean;
  /** A sale's bill discount as a percentage, given back in the same share. */
  billDiscPct: number;
  status: string;
  lines: BillLineForReturn[];
};

/** Quantity already returned per bill line, by the kind's active returns against the bill
 *  (leaving one return out, when it's the one being edited). */
async function returnedQty(
  db: Db,
  bookId: string,
  kind: ReturnKind,
  billNo: string,
  except?: string,
): Promise<Map<number, number>> {
  const rows = await db
    .select({
      srcLineNo: returnLines.srcLineNo,
      qty: sql<string>`coalesce(sum(${returnLines.qty}), 0)`,
    })
    .from(returnLines)
    .innerJoin(returns, eq(returns.id, returnLines.returnId))
    .where(
      and(
        eq(returns.bookId, bookId),
        eq(returns.kind, kind),
        eq(returns.againstBillNo, billNo),
        eq(returns.status, ACTIVE),
        ...(except ? [ne(returns.returnNo, except)] : []),
      ),
    )
    .groupBy(returnLines.srcLineNo);
  return new Map(rows.map((r) => [Number(r.srcLineNo), Number(r.qty)]));
}

export async function billForReturn(
  db: Db,
  bookId: string,
  kind: ReturnKind,
  billNo: string,
  except?: string,
): Promise<BillForReturn | null> {
  const no = billNo.trim();
  const done = await returnedQty(db, bookId, kind, no, except);
  const withLeft = (lines: PurcLine[]): BillLineForReturn[] =>
    lines.map((l, i) => {
      const returned = r3(done.get(i + 1) ?? 0);
      return { ...l, lineNo: i + 1, returned, left: Math.max(0, r3(l.qty - returned)) };
    });

  if (kind === 'PRT') {
    const b = await purchaseBill(db, bookId, no);
    if (!b) return null;
    const [l] = await db
      .select({ gstin: ledgers.gstin, state: ledgers.state })
      .from(ledgers)
      .where(and(eq(ledgers.bookId, bookId), eq(ledgers.accCode, b.suppCode)));
    return {
      billNo: b.billNo,
      billDate: b.billDate,
      partyCode: b.suppCode,
      partyName: b.suppName,
      onAccount: true,
      state: b.state || (l?.state ?? ''),
      gstin: (l?.gstin ?? '').trim(),
      interState: b.isInterState,
      billDiscPct: 0,
      status: b.status,
      lines: withLeft(b.lines),
    };
  }
  const b = await saleBill(db, bookId, no);
  if (!b) return null;
  const credit = b.payMode === 'Credit' && !!b.custCode;
  // A cash sale was debited to a Cash ledger; the refund comes out of the same one.
  let partyCode = b.custCode;
  if (!credit) {
    const [s] = await db
      .select({ voucherId: sales.voucherId })
      .from(sales)
      .where(and(eq(sales.bookId, bookId), eq(sales.billNo, no)));
    const [dr] = s?.voucherId
      ? await db
          .select({ code: voucherLines.accCode })
          .from(voucherLines)
          .where(and(eq(voucherLines.voucherId, s.voucherId), sql`${voucherLines.drAmount} > 0`))
          .orderBy(asc(voucherLines.lineNo))
          .limit(1)
      : [];
    partyCode = dr?.code ?? '';
  }
  // The bill discount comes off before tax (2026-11-14), so its % is of the value before tax.
  const gross = b.lines.reduce((a, l) => a + l.amount, 0);
  return {
    billNo: b.billNo,
    billDate: b.billDate,
    partyCode,
    partyName: b.custName,
    onAccount: credit,
    state: b.state,
    gstin: b.gstNo.trim(),
    interState: b.isInterState,
    billDiscPct: saleBillDiscPct(b.billDiscPct, b.billDiscAmt, gross),
    status: b.status,
    lines: withLeft(b.lines),
  };
}

// ── Numbering ───────────────────────────────────────────────────────────────────

/** The next return number from the kind's own series (PRT-001, SRT-001…). */
export const nextReturnNo = (db: Db, bookId: string, kind: ReturnKind) =>
  nextVoucherNo(db, bookId, kind);

// ── Save, update, cancel ────────────────────────────────────────────────────────

export type ReturnInput = {
  returnNo: string;
  /** yyyy-MM-dd */
  returnDate: string;
  againstBillNo: string;
  narration?: string;
  /** The bill lines taken back; lines with no quantity are left out. */
  lines: { srcLineNo: number; qty: number }[];
};

type Built = { bill: BillForReturn; lines: (PurcLine & { srcLineNo: number })[]; t: ReturnTotals };

/** Checks the return against its bill and works out its lines and totals. */
async function build(
  db: Db,
  ctx: PostingContext,
  kind: ReturnKind,
  input: ReturnInput,
  except?: string,
): Promise<Built> {
  if (!input.againstBillNo.trim()) throw new UserError(rm.billRequired);
  const bill = await billForReturn(db, ctx.bookId, kind, input.againstBillNo, except);
  if (!bill) throw new UserError(rm.billNotFound);
  if (bill.status === CANCELLED) throw new UserError(rm.billCancelled);
  if (ctx.fyFrom && ctx.fyTo && (input.returnDate < ctx.fyFrom || input.returnDate > ctx.fyTo))
    throw new UserError(rm.outsideYear(ctx.financialYearLabel));
  if (input.returnDate < bill.billDate) throw new UserError(rm.beforeBill);

  const lines: Built['lines'] = [];
  for (const l of input.lines) {
    const qty = r3(Number(l.qty) || 0);
    if (qty <= 0) continue;
    const src = bill.lines.find((b) => b.lineNo === l.srcLineNo);
    if (!src) throw new UserError(rm.billNotFound);
    if (qty > src.left + 0.0005) throw new UserError(rm.tooMuch(src.itemName, src.left));
    lines.push({ ...returnLine(src, qty, bill.interState), srcLineNo: src.lineNo });
  }
  if (!lines.length) throw new UserError(rm.nothingReturned);
  const t = returnTotals(kind, lines, bill.billDiscPct);

  // The return that takes back the last of the bill gives back what is left of its value, not
  // a fresh rounding: each part rounds to the rupee on its own, so three parts of a ₹101 bill
  // would credit ₹102 (fixed 2026-11-12). The round-off takes the difference.
  const completes = bill.lines.every((src) => {
    const now = lines.filter((l) => l.srcLineNo === src.lineNo).reduce((a, l) => a + l.qty, 0);
    return src.returned + now >= src.qty - 0.0005;
  });
  if (completes) {
    const table = kind === 'PRT' ? purchases : sales;
    const [b] = await db
      .select({ net: table.netAmount })
      .from(table)
      .where(and(eq(table.bookId, ctx.bookId), eq(table.billNo, bill.billNo)));
    const [r] = await db
      .select({ net: sql<string>`coalesce(sum(${returns.netAmount}), 0)` })
      .from(returns)
      .where(
        and(
          eq(returns.bookId, ctx.bookId),
          eq(returns.kind, kind),
          eq(returns.againstBillNo, bill.billNo),
          eq(returns.status, ACTIVE),
          ...(except ? [ne(returns.returnNo, except)] : []),
        ),
      );
    const left = round2(Number(b?.net ?? 0) - Number(r?.net ?? 0));
    if (b && left >= 0 && Math.abs(left - t.net) >= 0.005 && Math.abs(left - t.net) < 1.005) {
      t.roundOff = round2(t.roundOff + (left - t.net));
      t.net = left;
    }
  }
  return { bill, lines, t };
}

/** Creates any ledger the posting needs that the book is missing, its group first. */
async function ensureLedgers(db: Db, bookId: string, codes: string[]) {
  const seeds = { ...PURCHASE_LEDGER_SEEDS, ...SALE_LEDGER_SEEDS, ...RETURN_LEDGER_SEEDS };
  const groups = { ...PURCHASE_GROUP_SEEDS, ...SALE_GROUP_SEEDS };
  for (const code of codes) {
    const seed = seeds[code];
    if (!seed) continue;
    const [has] = await db
      .select({ id: ledgers.id })
      .from(ledgers)
      .where(and(eq(ledgers.bookId, bookId), eq(ledgers.accCode, code)));
    if (has) continue;
    const [name, grpCode, drCr] = seed;
    const [grp] = await db
      .select({ id: accountGroups.id })
      .from(accountGroups)
      .where(and(eq(accountGroups.bookId, bookId), eq(accountGroups.grpCode, grpCode)));
    if (!grp && groups[grpCode]) {
      const [gName, gType, parent] = groups[grpCode]!;
      await db
        .insert(accountGroups)
        .values({
          bookId,
          grpCode,
          grpName: gName,
          grpType: gType,
          parentGrp: parent,
          isLedger: 'No',
          sortOrder: 0,
          clr: '1',
        })
        .onConflictDoNothing();
    }
    await db
      .insert(ledgers)
      .values({ bookId, accCode: code, accName: name, grpCode, opBal: '0', drCr, isActive: true })
      .onConflictDoNothing();
  }
}

/** The PRT/SRT voucher with its ledger lines, item lines, stock movement and bill reference. */
async function post(
  db: Db,
  ctx: PostingContext,
  kind: ReturnKind,
  input: ReturnInput,
  returnNo: string,
  { bill, lines, t }: Built,
): Promise<string> {
  const acct =
    kind === 'PRT'
      ? purchaseReturnPosting(bill.partyCode, t, bill.interState)
      : salesReturnPosting(bill.partyCode, t, bill.interState);
  await ensureLedgers(
    db,
    ctx.bookId,
    acct.map((l) => l.accCode),
  );
  const dr = acct.reduce((a, l) => a + l.dr, 0);
  const cr = acct.reduce((a, l) => a + l.cr, 0);
  if (Math.abs(dr - cr) >= 0.005) throw new UserError(rm.unbalanced(Math.abs(dr - cr)));

  const [v] = await db
    .insert(vouchers)
    .values({
      bookId: ctx.bookId,
      vchrNo: returnNo,
      vchrType: kind,
      vchrDate: input.returnDate,
      partyCode: bill.partyCode || null,
      refNo: bill.billNo,
      refDate: bill.billDate,
      narration: input.narration?.trim() || `${rm.title(kind)} against ${bill.billNo}`,
      taxableAmt: money(t.subTotal),
      cgstAmt: money(t.cgst),
      sgstAmt: money(t.sgst),
      igstAmt: money(t.igst),
      otherChrg: money(-t.billDisc),
      roundOff: money(t.roundOff),
      netAmount: money(t.net),
      status: ACTIVE,
      createdBy: ctx.userName,
    })
    .returning({ id: vouchers.id });
  const voucherId = v!.id;
  await commitVoucherNo(db, ctx.bookId, kind, returnNo);

  await db.insert(voucherLines).values(
    acct.map((l, i) => ({
      voucherId,
      lineNo: i + 1,
      accCode: l.accCode,
      drAmount: money(l.dr),
      crAmount: money(l.cr),
    })),
  );
  await db.insert(voucherItems).values(
    lines.map((l, i) => ({
      voucherId,
      lineNo: i + 1,
      partCode: l.itemCode,
      godownCode: l.location,
      qty: qty3(l.qty),
      unit: l.unit,
      rate: money(l.rate),
      discPct: money(l.disP),
      discAmt: money(l.disA),
      hsnNo: l.hsnNo,
      gstRate: money(l.sgstP + l.cgstP + l.igstP),
      taxableAmt: money(l.amount),
      cgstAmt: money(l.cgstA),
      sgstAmt: money(l.sgstA),
      igstAmt: money(l.igstA),
      lineTotal: money(l.lineTotal),
    })),
  );
  // Goods go back to the supplier, or come back from the customer.
  await db.insert(stockTrn).values(
    lines.map((l) => ({
      bookId: ctx.bookId,
      voucherId,
      vchrType: kind,
      vchrNo: returnNo,
      trnDate: input.returnDate,
      partCode: l.itemCode,
      godownCode: l.location,
      inQty: kind === 'SRT' ? qty3(l.qty) : '0',
      outQty: kind === 'PRT' ? qty3(l.qty) : '0',
      rate: money(l.rate),
      value: money(l.amount),
    })),
  );
  // Less owed to the supplier, or less due from the customer.
  if (bill.onAccount && bill.partyCode)
    await db.insert(billRefs).values({
      voucherId,
      accCode: bill.partyCode,
      billNo: bill.billNo,
      refType: 'Agst',
      billDate: input.returnDate,
      amount: money(t.net),
    });
  return voucherId;
}

const headerValues = (input: ReturnInput, { bill, t }: Built) => ({
  returnDate: input.returnDate,
  againstBillNo: bill.billNo,
  againstBillDate: bill.billDate,
  partyCode: bill.partyCode || null,
  partyName: bill.partyName,
  state: bill.state || null,
  isInterState: bill.interState,
  narration: input.narration?.trim() ?? '',
  totalQty: qty3(t.qty),
  subTotal: money(t.subTotal),
  sgstAmt: money(t.sgst),
  cgstAmt: money(t.cgst),
  igstAmt: money(t.igst),
  billDisc: money(t.billDisc),
  roundOff: money(t.roundOff),
  netAmount: money(t.net),
});

/** A sales return's lines as taxed: its share of the bill discount comes off before tax, as on
 *  the bill (2026-11-14), so the GST returns read the right taxable value. */
const taxedLines = (kind: ReturnKind, { lines, t }: Built): Built['lines'] =>
  kind === 'SRT' ? (allocateBillDiscount(lines, t.billDisc) as Built['lines']) : lines;

async function writeLines(db: Db, returnId: string, lines: Built['lines']) {
  await db.insert(returnLines).values(
    lines.map((l, i) => ({
      returnId,
      lineNo: i + 1,
      srcLineNo: l.srcLineNo,
      itemCode: l.itemCode,
      itemName: l.itemName,
      hsnNo: l.hsnNo,
      unit: l.unit,
      location: l.location,
      qty: qty3(l.qty),
      rate: money(l.rate),
      disP: money(l.disP),
      disA: money(l.disA),
      amount: money(l.amount),
      sgstP: money(l.sgstP),
      sgstA: money(l.sgstA),
      cgstP: money(l.cgstP),
      cgstA: money(l.cgstA),
      igstP: money(l.igstP),
      igstA: money(l.igstA),
      lineTotal: money(l.lineTotal),
    })),
  );
}

async function log(db: Db, ctx: PostingContext, action: string, key: string, details: string) {
  await db.insert(auditLog).values({
    bookId: ctx.bookId,
    userName: ctx.userName,
    action,
    tableName: 'Returns',
    recordKey: key,
    details,
  });
}

async function findReturn(db: Db, bookId: string, kind: ReturnKind, no: string) {
  const [r] = await db
    .select()
    .from(returns)
    .where(and(eq(returns.bookId, bookId), eq(returns.kind, kind), eq(returns.returnNo, no)));
  return r ?? null;
}

/** A purchase return can't send back goods no longer in hand. */
async function checkStock(db: Db, bookId: string, kind: ReturnKind, lines: Built['lines']) {
  if (kind === 'PRT') await assertStockAvailable(db, bookId, lines);
}

export async function saveReturn(
  db: Db,
  ctx: PostingContext,
  kind: ReturnKind,
  input: ReturnInput,
): Promise<{ returnNo: string; net: number }> {
  const returnNo = input.returnNo.trim() || (await nextReturnNo(db, ctx.bookId, kind));
  let net = 0;
  await db.transaction(async (raw) => {
    const tx = raw as unknown as Db;
    const built = await build(tx, ctx, kind, input);
    if (await findReturn(tx, ctx.bookId, kind, returnNo)) throw new UserError(rm.noUsed(returnNo));
    const [clash] = await tx
      .select({ id: vouchers.id })
      .from(vouchers)
      .where(
        and(
          eq(vouchers.bookId, ctx.bookId),
          eq(vouchers.vchrType, kind),
          eq(vouchers.vchrNo, returnNo),
        ),
      );
    if (clash) throw new UserError(rm.noUsed(returnNo));
    await checkStock(tx, ctx.bookId, kind, built.lines);
    const voucherId = await post(tx, ctx, kind, input, returnNo, built);
    const [r] = await tx
      .insert(returns)
      .values({
        bookId: ctx.bookId,
        kind,
        returnNo,
        ...headerValues(input, built),
        voucherId,
        status: ACTIVE,
        createdBy: ctx.userName,
      })
      .returning({ id: returns.id });
    await writeLines(tx, r!.id, taxedLines(kind, built));
    net = built.t.net;
    await log(
      tx,
      ctx,
      'CREATE',
      returnNo,
      `${kind} against ${built.bill.billNo}, Net ${net.toFixed(2)}`,
    );
  });
  return { returnNo, net };
}

/** Replaces a return, keeping its number; its voucher is reposted under the same number. */
export async function updateReturn(
  db: Db,
  ctx: PostingContext,
  kind: ReturnKind,
  input: ReturnInput,
): Promise<{ returnNo: string; net: number }> {
  const old = await findReturn(db, ctx.bookId, kind, input.returnNo.trim());
  if (!old) throw new UserError(rm.notFound);
  if (old.status === CANCELLED) throw new UserError(rm.cancelledEdit);
  let net = 0;
  await db.transaction(async (raw) => {
    const tx = raw as unknown as Db;
    const built = await build(tx, ctx, kind, input, old.returnNo);
    await tx.delete(returnLines).where(eq(returnLines.returnId, old.id));
    if (old.voucherId) {
      await tx.update(returns).set({ voucherId: null }).where(eq(returns.id, old.id));
      await tx.delete(vouchers).where(eq(vouchers.id, old.voucherId));
    }
    await checkStock(tx, ctx.bookId, kind, built.lines);
    const voucherId = await post(tx, ctx, kind, input, old.returnNo, built);
    await tx
      .update(returns)
      .set({
        ...headerValues(input, built),
        voucherId,
        modifiedBy: ctx.userName,
        modifiedAt: new Date(),
      })
      .where(eq(returns.id, old.id));
    await writeLines(tx, old.id, taxedLines(kind, built));
    net = built.t.net;
    await log(tx, ctx, 'UPDATE', old.returnNo, `Net ${net.toFixed(2)}`);
  });
  return { returnNo: old.returnNo, net };
}

/** Marks the return and its voucher Cancelled and removes its stock movement, as cancelling a
 *  bill does. Cancelling twice does nothing. */
export async function cancelReturn(
  db: Db,
  ctx: PostingContext,
  kind: ReturnKind,
  returnNo: string,
): Promise<void> {
  const r = await findReturn(db, ctx.bookId, kind, returnNo.trim());
  if (!r) throw new UserError(rm.notFound);
  if (r.status === CANCELLED) return;
  const now = new Date();
  await db.transaction(async (raw) => {
    const tx = raw as unknown as Db;
    await tx
      .update(returns)
      .set({ status: CANCELLED, cancelledBy: ctx.userName, cancelledAt: now })
      .where(eq(returns.id, r.id));
    if (r.voucherId) {
      await tx
        .update(vouchers)
        .set({ status: CANCELLED, cancelledBy: ctx.userName, cancelledAt: now })
        .where(eq(vouchers.id, r.voucherId));
      await tx.delete(stockTrn).where(eq(stockTrn.voucherId, r.voucherId));
    }
    await log(tx, ctx, 'CANCEL', r.returnNo, 'Cancelled by user');
  });
}

// ── Reading ─────────────────────────────────────────────────────────────────────

export type ReturnRow = {
  returnNo: string;
  returnDate: string;
  againstBillNo: string;
  partyName: string;
  itemCount: number;
  netAmount: number;
  status: string;
};

/** Every return of the kind, newest first. */
export async function listReturns(db: Db, bookId: string, kind: ReturnKind): Promise<ReturnRow[]> {
  const rows = await db
    .select({
      returnNo: returns.returnNo,
      returnDate: returns.returnDate,
      againstBillNo: returns.againstBillNo,
      partyName: returns.partyName,
      itemCount: sql<number>`(select count(*)::int from ${returnLines} d where d.return_id = "returns"."id")`,
      netAmount: returns.netAmount,
      status: returns.status,
    })
    .from(returns)
    .where(and(eq(returns.bookId, bookId), eq(returns.kind, kind)))
    .orderBy(desc(returns.returnDate), desc(returns.returnNo));
  return rows.map((r) => ({
    ...r,
    partyName: r.partyName ?? '',
    itemCount: Number(r.itemCount),
    netAmount: Number(r.netAmount),
  }));
}

/** One return with its lines, for reopening and printing. */
export async function returnDoc(db: Db, bookId: string, kind: ReturnKind, returnNo: string) {
  const r = await findReturn(db, bookId, kind, returnNo.trim());
  if (!r) return null;
  const rows = await db
    .select()
    .from(returnLines)
    .where(eq(returnLines.returnId, r.id))
    .orderBy(asc(returnLines.lineNo));
  return {
    kind,
    returnNo: r.returnNo,
    returnDate: r.returnDate,
    againstBillNo: r.againstBillNo,
    againstBillDate: r.againstBillDate ?? '',
    partyCode: r.partyCode ?? '',
    partyName: r.partyName ?? '',
    state: r.state ?? '',
    isInterState: r.isInterState,
    narration: r.narration ?? '',
    billDisc: Number(r.billDisc),
    roundOff: Number(r.roundOff),
    netAmount: Number(r.netAmount),
    status: r.status,
    // A sales return's stored lines carry their share of the bill discount (taken before tax,
    // 2026-11-14); they're given back as entered, the discount travelling as billDisc.
    lines: rows.map((l) => {
      const stored = {
        srcLineNo: Number(l.srcLineNo),
        itemCode: l.itemCode,
        itemName: l.itemName ?? '',
        hsnNo: l.hsnNo,
        unit: l.unit,
        location: l.location,
        qty: Number(l.qty),
        rate: Number(l.rate),
        disP: Number(l.disP),
        disA: Number(l.disA),
        amount: Number(l.amount),
        sgstP: Number(l.sgstP),
        sgstA: Number(l.sgstA),
        cgstP: Number(l.cgstP),
        cgstA: Number(l.cgstA),
        igstP: Number(l.igstP),
        igstA: Number(l.igstA),
        lineTotal: Number(l.lineTotal),
      };
      if (kind !== 'SRT' || Number(r.billDisc) <= 0) return stored;
      return {
        ...saleLine({
          ...stored,
          disA: stored.disP > 0 ? 0 : stored.disA,
          gstRate: stored.sgstP + stored.cgstP + stored.igstP,
          interState: r.isInterState,
        }),
        srcLineNo: stored.srcLineNo,
      };
    }),
  };
}
export type ReturnDoc = NonNullable<Awaited<ReturnType<typeof returnDoc>>>;
