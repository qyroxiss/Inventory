// Reports (docs/design/REPORTS.md). Read-only queries over the posted books; every figure
// counts Active vouchers only, and cancelled documents have no stock movements.

import {
  VCHR_KINDS,
  balanceSheet,
  ledgerStatement,
  openingStockValue,
  registerItem,
  type RegisterItem,
  type RegisterMove,
  type RegisterShow,
  valueItem,
  type StockMove,
  type ValuationMethod,
  outstandingBills,
  profitAndLoss,
  round2,
  stockRate,
  trialBalance,
  type BillRef,
  type LedgerBalance,
  type ReportGroup,
  type StatementLine,
} from '@qi/core';
import { and, asc, desc, eq, gt, gte, inArray, lte, schema, sql, type Db } from '@qi/db';

const {
  accountGroups,
  billRefs,
  ledgers,
  purchaseLines,
  purchases,
  sales,
  stockItems,
  stockTrn,
  voucherLines,
  vouchers,
} = schema;

export type Period = { from: string; to: string };

/** Each item's rate on its latest active purchase bill dated on or before [to]: the stock rate
 *  for an item with neither a purchase nor a sale rate. */
export async function lastPurchaseRates(
  db: Db,
  bookId: string,
  to: string,
): Promise<Map<string, number>> {
  const rows = await db
    .selectDistinctOn([purchaseLines.itemCode], {
      code: purchaseLines.itemCode,
      rate: purchaseLines.rate,
    })
    .from(purchaseLines)
    .innerJoin(purchases, eq(purchases.id, purchaseLines.purchaseId))
    .where(
      and(
        eq(purchases.bookId, bookId),
        eq(purchases.status, 'Active'),
        lte(purchases.billDate, to),
        gt(purchaseLines.rate, '0'),
      ),
    )
    .orderBy(
      purchaseLines.itemCode,
      desc(purchases.billDate),
      desc(purchases.createdAt),
      desc(purchaseLines.lineNo),
    );
  return new Map(rows.map((r) => [r.code, Number(r.rate)]));
}

// ── Stock Summary ──────────────────────────────────────────────────────────────

export type StockSummaryRow = {
  code: string;
  name: string;
  unit: string;
  opening: number;
  /** The opening stock's value by the chosen method. */
  openingValue: number;
  inward: number;
  outward: number;
  closing: number;
  /** Closing value over closing quantity. */
  rate: number;
  value: number;
};

/** Per active item: quantity at the start of the period (opening stock plus every movement
 *  before it), inward and outward within it, closing quantity, and the opening and closing
 *  values by the chosen method (Opening Rate, Average, FIFO or MRP; user's request,
 *  2026-11-10). With a godown, only that godown's movements count, and the item's opening
 *  stock (which carries no godown) is left out. */
export async function stockSummary(
  db: Db,
  bookId: string,
  p: Period & { godown?: string | null; method?: ValuationMethod },
): Promise<StockSummaryRow[]> {
  const method = p.method ?? 'average';
  const items = await db
    .select()
    .from(stockItems)
    .where(and(eq(stockItems.bookId, bookId), eq(stockItems.isActive, true)))
    .orderBy(asc(stockItems.partName));
  const where = [eq(stockTrn.bookId, bookId), lte(stockTrn.trnDate, p.to)];
  if (p.godown) where.push(eq(stockTrn.godownCode, p.godown));
  const rows = await db
    .select({
      code: stockTrn.partCode,
      date: sql<string>`${stockTrn.trnDate}::text`,
      vchrType: stockTrn.vchrType,
      inQty: stockTrn.inQty,
      outQty: stockTrn.outQty,
      rate: stockTrn.rate,
    })
    .from(stockTrn)
    .where(and(...where));
  const byCode = new Map<string, StockMove[]>();
  for (const r of rows) {
    const list = byCode.get(r.code) ?? [];
    list.push({
      date: r.date,
      vchrType: r.vchrType ?? '',
      inQty: Number(r.inQty),
      outQty: Number(r.outQty),
      rate: Number(r.rate),
    });
    byCode.set(r.code, list);
  }
  const last = await lastPurchaseRates(db, bookId, p.to);
  return items.map((i) => {
    const moves = byCode.get(i.partCode) ?? [];
    const opQty = p.godown ? 0 : Number(i.opQty);
    const v = valueItem(
      method,
      {
        opQty,
        opRate: Number(i.opQty) > 0 ? Number(i.opValue) / Number(i.opQty) : 0,
        mrp: Number(i.mrp),
        fallback: stockRate(Number(i.purRate), Number(i.saleRate), last.get(i.partCode)),
      },
      moves,
      p.from,
    );
    const within = moves.filter((m) => m.date >= p.from);
    const inward = round2(within.reduce((a, m) => a + m.inQty, 0));
    const outward = round2(within.reduce((a, m) => a + m.outQty, 0));
    return {
      code: i.partCode,
      name: i.partName,
      unit: i.unit ?? '',
      opening: round2(v.opening.qty),
      openingValue: v.opening.value,
      inward,
      outward,
      closing: round2(v.closing.qty),
      rate: v.closing.qty > 0 ? round2(v.closing.value / v.closing.qty) : 0,
      value: v.closing.value,
    };
  });
}

// ── Stock Register ─────────────────────────────────────────────────────────────

/** Each chosen item's movements in the period, run like a ledger (core/stock-register.ts).
 *  No codes means every active item; then items with no stock and no rows are left out. The
 *  party is the voucher's ledger, else the sale's customer name, else the narration. */
export async function stockRegister(
  db: Db,
  bookId: string,
  p: Period & { show: RegisterShow; codes?: string[] },
): Promise<RegisterItem[]> {
  const itemWhere = [eq(stockItems.bookId, bookId)];
  if (p.codes?.length) itemWhere.push(inArray(stockItems.partCode, p.codes));
  else itemWhere.push(eq(stockItems.isActive, true));
  const items = await db
    .select()
    .from(stockItems)
    .where(and(...itemWhere))
    .orderBy(asc(stockItems.partName));
  if (!items.length) return [];
  const rows = await db
    .select({
      code: stockTrn.partCode,
      date: sql<string>`${stockTrn.trnDate}::text`,
      vchrType: stockTrn.vchrType,
      billNo: stockTrn.vchrNo,
      party: ledgers.accName,
      custName: sales.custName,
      narration: vouchers.narration,
      inQty: stockTrn.inQty,
      outQty: stockTrn.outQty,
      rate: stockTrn.rate,
      value: stockTrn.value,
    })
    .from(stockTrn)
    .leftJoin(vouchers, eq(vouchers.id, stockTrn.voucherId))
    .leftJoin(ledgers, and(eq(ledgers.bookId, bookId), eq(ledgers.accCode, vouchers.partyCode)))
    .leftJoin(sales, eq(sales.voucherId, stockTrn.voucherId))
    .where(
      and(
        eq(stockTrn.bookId, bookId),
        lte(stockTrn.trnDate, p.to),
        inArray(
          stockTrn.partCode,
          items.map((i) => i.partCode),
        ),
      ),
    )
    .orderBy(asc(stockTrn.trnDate), asc(vouchers.createdAt), asc(stockTrn.vchrNo));
  const byCode = new Map<string, RegisterMove[]>();
  for (const r of rows) {
    const list = byCode.get(r.code) ?? [];
    list.push({
      date: r.date,
      vchrType: r.vchrType ?? '',
      billNo: r.billNo ?? '',
      particulars: r.party || r.custName || r.narration || '',
      inQty: Number(r.inQty),
      outQty: Number(r.outQty),
      rate: Number(r.rate),
      amount: Number(r.value),
    });
    byCode.set(r.code, list);
  }
  const out = items.map((i) =>
    registerItem(
      { code: i.partCode, name: i.partName, unit: i.unit ?? '', opQty: Number(i.opQty) },
      byCode.get(i.partCode) ?? [],
      p.from,
      p.show,
    ),
  );
  return p.codes?.length === 1
    ? out
    : out.filter((r) => r.lines.length || r.opening || r.closing);
}

/** Opening stock (the items' opening values) and closing stock as on a date, at the stock rate. */
export async function stockValues(db: Db, bookId: string, to: string) {
  const items = await db
    .select()
    .from(stockItems)
    .where(and(eq(stockItems.bookId, bookId), eq(stockItems.isActive, true)));
  const moved = await db
    .select({
      code: stockTrn.partCode,
      qty: sql<string>`coalesce(sum(${stockTrn.inQty} - ${stockTrn.outQty}), 0)`,
    })
    .from(stockTrn)
    .where(and(eq(stockTrn.bookId, bookId), lte(stockTrn.trnDate, to)))
    .groupBy(stockTrn.partCode);
  const byCode = new Map(moved.map((m) => [m.code, Number(m.qty)]));
  const last = await lastPurchaseRates(db, bookId, to);
  let opening = 0;
  let closing = 0;
  for (const i of items) {
    const rate = stockRate(Number(i.purRate), Number(i.saleRate), last.get(i.partCode));
    opening += openingStockValue(Number(i.opQty), Number(i.opValue), rate);
    closing += (Number(i.opQty) + (byCode.get(i.partCode) ?? 0)) * rate;
  }
  return { opening: round2(opening), closing: round2(closing) };
}

// ── Day Book ───────────────────────────────────────────────────────────────────

export type DayBookRow = {
  id: string;
  date: string;
  vchrNo: string;
  type: string;
  typeName: string;
  particulars: string;
  refNo: string;
  debit: number;
  credit: number;
  status: string;
};

/** Every voucher in the period, oldest first; Debit and Credit are the totals of its lines. */
export async function dayBook(
  db: Db,
  bookId: string,
  p: Period & { cancelled?: boolean },
): Promise<DayBookRow[]> {
  const where = [
    eq(vouchers.bookId, bookId),
    gte(vouchers.vchrDate, p.from),
    lte(vouchers.vchrDate, p.to),
  ];
  if (!p.cancelled) where.push(eq(vouchers.status, 'Active'));
  const rows = await db
    .select({
      id: vouchers.id,
      date: vouchers.vchrDate,
      vchrNo: vouchers.vchrNo,
      type: vouchers.vchrType,
      party: ledgers.accName,
      narration: vouchers.narration,
      refNo: vouchers.refNo,
      status: vouchers.status,
      firstDr: sql<
        string | null
      >`(select l.acc_name from ${voucherLines} vl join ${ledgers} l on l.book_id = "vouchers"."book_id" and l.acc_code = vl.acc_code where vl.voucher_id = "vouchers"."id" and vl.dr_amount > 0 order by vl.line_no limit 1)`,
      debit: sql<string>`(select coalesce(sum(vl.dr_amount), 0) from ${voucherLines} vl where vl.voucher_id = "vouchers"."id")`,
      credit: sql<string>`(select coalesce(sum(vl.cr_amount), 0) from ${voucherLines} vl where vl.voucher_id = "vouchers"."id")`,
    })
    .from(vouchers)
    .leftJoin(
      ledgers,
      and(eq(ledgers.bookId, vouchers.bookId), eq(ledgers.accCode, vouchers.partyCode)),
    )
    .where(and(...where))
    .orderBy(asc(vouchers.vchrDate), asc(vouchers.id));
  return rows.map((r) => ({
    id: r.id,
    date: r.date,
    vchrNo: r.vchrNo,
    type: r.type,
    typeName: VCHR_KINDS[r.type]?.[0] ?? r.type,
    particulars: r.party || r.firstDr || r.narration || '',
    refNo: r.refNo ?? '',
    debit: Number(r.debit),
    credit: Number(r.credit),
    status: r.status,
  }));
}

// ── Sales Register ─────────────────────────────────────────────────────────────

export type SalesRegisterRow = {
  billNo: string;
  billDate: string;
  custName: string;
  gstNo: string;
  payMode: string;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  discount: number;
  roundOff: number;
  net: number;
  status: string;
};

export async function salesRegister(
  db: Db,
  bookId: string,
  p: Period & { cancelled?: boolean },
): Promise<SalesRegisterRow[]> {
  const where = [eq(sales.bookId, bookId), gte(sales.billDate, p.from), lte(sales.billDate, p.to)];
  if (!p.cancelled) where.push(eq(sales.status, 'Active'));
  const rows = await db
    .select()
    .from(sales)
    .where(and(...where))
    .orderBy(asc(sales.billDate), asc(sales.billNo));
  return rows.map((s) => ({
    billNo: s.billNo,
    billDate: s.billDate,
    custName: s.custName ?? '',
    gstNo: s.gstNo ?? '',
    payMode: s.payMode,
    taxable: Number(s.subTotal),
    cgst: Number(s.cgstAmt),
    sgst: Number(s.sgstAmt),
    igst: Number(s.igstAmt),
    discount: Number(s.billDiscAmt),
    roundOff: Number(s.roundOff),
    net: Number(s.netAmount),
    status: s.status,
  }));
}

// ── Profit & Loss, Balance Sheet ───────────────────────────────────────────────

async function groupsOf(db: Db, bookId: string) {
  const rows = await db.select().from(accountGroups).where(eq(accountGroups.bookId, bookId));
  return new Map<string, ReportGroup>(
    rows.map((g) => [
      g.grpCode,
      { grpCode: g.grpCode, grpName: g.grpName, grpType: g.grpType, parentGrp: g.parentGrp },
    ]),
  );
}

/** Each ledger's balance as on a date: ± opening (Cr negative) + Σ(Dr − Cr) over Active
 *  vouchers up to it (MDA's ledgerBalance). */
export async function ledgerBalancesAsOn(
  db: Db,
  bookId: string,
  to: string,
): Promise<LedgerBalance[]> {
  const all = await db.select().from(ledgers).where(eq(ledgers.bookId, bookId));
  const moved = await db
    .select({
      code: voucherLines.accCode,
      bal: sql<string>`coalesce(sum(${voucherLines.drAmount} - ${voucherLines.crAmount}), 0)`,
    })
    .from(voucherLines)
    .innerJoin(vouchers, eq(vouchers.id, voucherLines.voucherId))
    .where(
      and(eq(vouchers.bookId, bookId), eq(vouchers.status, 'Active'), lte(vouchers.vchrDate, to)),
    )
    .groupBy(voucherLines.accCode);
  const byCode = new Map(moved.map((m) => [m.code, Number(m.bal)]));
  return all.map((l) => {
    const op = Number(l.opBal);
    return {
      accCode: l.accCode,
      accName: l.accName,
      grpCode: l.grpCode,
      balance: round2((l.drCr === 'Cr' ? -op : op) + (byCode.get(l.accCode) ?? 0)),
    };
  });
}

/** Trading and Profit & Loss account for the open year up to `to`. */
export async function profitLossReport(db: Db, bookId: string, to: string) {
  const [balances, groups, stock] = await Promise.all([
    ledgerBalancesAsOn(db, bookId, to),
    groupsOf(db, bookId),
    stockValues(db, bookId, to),
  ]);
  return profitAndLoss(balances, groups, stock.opening, stock.closing);
}

/** Balance Sheet as on `to`, with the year's profit up to then. */
export async function balanceSheetReport(db: Db, bookId: string, to: string) {
  const [balances, groups, stock] = await Promise.all([
    ledgerBalancesAsOn(db, bookId, to),
    groupsOf(db, bookId),
    stockValues(db, bookId, to),
  ]);
  const pl = profitAndLoss(balances, groups, stock.opening, stock.closing);
  return balanceSheet(balances, groups, pl.pl.net, stock.closing);
}

// ── Ledger Statement, Trial Balance, Purchase Register, Outstanding ─────────────
// Added 2026-10-25 (WORKFLOW Phase 6; MDA has none of them). Active vouchers only.

/** One ledger's entries in the period with a running balance, starting from its balance on
 *  the day before (opening balance ± every earlier entry). The particulars are the account on
 *  the other side of each voucher. */
export async function ledgerStatementReport(db: Db, bookId: string, accCode: string, p: Period) {
  const [ledger] = await db
    .select()
    .from(ledgers)
    .where(and(eq(ledgers.bookId, bookId), eq(ledgers.accCode, accCode)));
  if (!ledger) return null;
  const active = and(eq(vouchers.bookId, bookId), eq(vouchers.status, 'Active'));
  const [before] = await db
    .select({
      bal: sql<string>`coalesce(sum(${voucherLines.drAmount} - ${voucherLines.crAmount}), 0)`,
    })
    .from(voucherLines)
    .innerJoin(vouchers, eq(vouchers.id, voucherLines.voucherId))
    .where(and(active, eq(voucherLines.accCode, accCode), sql`${vouchers.vchrDate} < ${p.from}`));
  const op = Number(ledger.opBal);
  const opening = round2((ledger.drCr === 'Cr' ? -op : op) + Number(before?.bal ?? 0));
  const rows = await db
    .select({
      date: sql<string>`${vouchers.vchrDate}::text`,
      vchrNo: vouchers.vchrNo,
      type: vouchers.vchrType,
      narration: vouchers.narration,
      debit: voucherLines.drAmount,
      credit: voucherLines.crAmount,
      // The first account on the other side of the same voucher.
      other: sql<string | null>`(select l.acc_name from ${voucherLines} o
        join ${ledgers} l on l.book_id = ${vouchers.bookId} and l.acc_code = o.acc_code
        where o.voucher_id = ${vouchers.id} and o.acc_code <> ${accCode}
          and ((${voucherLines.drAmount} > 0 and o.cr_amount > 0)
            or (${voucherLines.crAmount} > 0 and o.dr_amount > 0))
        order by o.line_no limit 1)`,
    })
    .from(voucherLines)
    .innerJoin(vouchers, eq(vouchers.id, voucherLines.voucherId))
    .where(
      and(
        active,
        eq(voucherLines.accCode, accCode),
        gte(vouchers.vchrDate, p.from),
        lte(vouchers.vchrDate, p.to),
      ),
    )
    .orderBy(asc(vouchers.vchrDate), asc(vouchers.createdAt), asc(voucherLines.lineNo));
  const lines: StatementLine[] = rows.map((r) => ({
    date: r.date,
    vchrNo: r.vchrNo,
    type: VCHR_KINDS[r.type]?.[0] ?? r.type,
    particulars: r.other ?? '',
    narration: r.narration ?? '',
    debit: Number(r.debit),
    credit: Number(r.credit),
  }));
  return {
    ledger: { accCode: ledger.accCode, accName: ledger.accName },
    ...ledgerStatement(opening, lines),
  };
}

/** Every ledger's balance as on `to`, Debit or Credit, grouped. */
export async function trialBalanceReport(db: Db, bookId: string, to: string) {
  const [balances, groups] = await Promise.all([
    ledgerBalancesAsOn(db, bookId, to),
    groupsOf(db, bookId),
  ]);
  return trialBalance(balances, groups);
}

export type PurchaseRegisterRow = {
  billNo: string;
  billDate: string;
  suppName: string;
  gstin: string;
  suppInvNo: string;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  freight: number;
  roundOff: number;
  net: number;
  status: string;
};

export async function purchaseRegister(
  db: Db,
  bookId: string,
  p: Period & { cancelled?: boolean },
): Promise<PurchaseRegisterRow[]> {
  const where = [
    eq(purchases.bookId, bookId),
    gte(purchases.billDate, p.from),
    lte(purchases.billDate, p.to),
  ];
  if (!p.cancelled) where.push(eq(purchases.status, 'Active'));
  const rows = await db
    .select({ p: purchases, name: ledgers.accName, gstin: ledgers.gstin })
    .from(purchases)
    .leftJoin(
      ledgers,
      and(eq(ledgers.bookId, purchases.bookId), eq(ledgers.accCode, purchases.suppCode)),
    )
    .where(and(...where))
    .orderBy(asc(purchases.billDate), asc(purchases.billNo));
  return rows.map(({ p: b, name, gstin }) => ({
    billNo: b.billNo,
    billDate: b.billDate,
    suppName: name ?? b.suppCode,
    gstin: (gstin ?? '').trim(),
    suppInvNo: b.suppInvNo ?? '',
    taxable: Number(b.subTotal),
    cgst: Number(b.cgstAmt),
    sgst: Number(b.sgstAmt),
    igst: Number(b.igstAmt),
    freight: Number(b.freight),
    roundOff: Number(b.roundOff),
    net: Number(b.netAmount),
    status: b.status,
  }));
}

/** Bills not yet fully paid as on `today`: sales still to be received, purchases still to be
 *  paid, by the dashboard's pending-bill rule. A bill raised by a purchase is payable. */
export async function outstandingReport(db: Db, bookId: string, today: string) {
  const rows = await db
    .select({
      accCode: billRefs.accCode,
      accName: ledgers.accName,
      billNo: billRefs.billNo,
      refType: billRefs.refType,
      billDate: billRefs.billDate,
      amount: billRefs.amount,
      creditDays: sql<number>`coalesce(${ledgers.creditDays}, 0)`,
      vchrType: vouchers.vchrType,
      vchrDate: sql<string>`${vouchers.vchrDate}::text`,
    })
    .from(billRefs)
    .innerJoin(vouchers, eq(vouchers.id, billRefs.voucherId))
    .leftJoin(
      ledgers,
      and(eq(ledgers.bookId, vouchers.bookId), eq(ledgers.accCode, billRefs.accCode)),
    )
    // Only what had happened by the As on date: later bills and payments don't count yet
    // (2026-11-11 audit).
    .where(
      and(
        eq(vouchers.bookId, bookId),
        eq(vouchers.status, 'Active'),
        lte(vouchers.vchrDate, today),
      ),
    );
  const refs: BillRef[] = rows.map((r) => ({
    accCode: r.accCode,
    accName: r.accName ?? r.accCode,
    billNo: r.billNo,
    refType: r.refType ?? 'New',
    // Bill dates are ISO when this app wrote them; an MDA import may hold another form.
    billDate: /^\d{4}-\d{2}-\d{2}$/.test(r.billDate ?? '') ? r.billDate! : r.vchrDate,
    amount: Number(r.amount),
    creditDays: Number(r.creditDays),
    side: r.vchrType === 'PUR' ? 'payable' : 'receivable',
  }));
  return outstandingBills(refs, today);
}
