// Reports (docs/design/REPORTS.md). Read-only queries over the posted books; every figure
// counts Active vouchers only, and cancelled documents have no stock movements.

import {
  VCHR_KINDS,
  balanceSheet,
  openingStockValue,
  profitAndLoss,
  round2,
  stockRate,
  type LedgerBalance,
  type ReportGroup,
} from '@qi/core';
import { and, asc, eq, gte, lte, schema, sql, type Db } from '@qi/db';

const { accountGroups, ledgers, sales, stockItems, stockTrn, voucherLines, vouchers } = schema;

export type Period = { from: string; to: string };

// ── Stock Summary ──────────────────────────────────────────────────────────────

export type StockSummaryRow = {
  code: string;
  name: string;
  unit: string;
  opening: number;
  inward: number;
  outward: number;
  closing: number;
  rate: number;
  value: number;
};

/** Per active item: quantity at the start of the period (opening stock plus every movement
 *  before it), inward and outward within it, closing quantity, and its value at MDA's rate. With
 *  a godown, only that godown's movements count, and the item's opening stock (which carries no
 *  godown) is left out. */
export async function stockSummary(
  db: Db,
  bookId: string,
  p: Period & { godown?: string | null },
): Promise<StockSummaryRow[]> {
  const items = await db
    .select()
    .from(stockItems)
    .where(and(eq(stockItems.bookId, bookId), eq(stockItems.isActive, true)))
    .orderBy(asc(stockItems.partName));
  const where = [eq(stockTrn.bookId, bookId), lte(stockTrn.trnDate, p.to)];
  if (p.godown) where.push(eq(stockTrn.godownCode, p.godown));
  const moved = await db
    .select({
      code: stockTrn.partCode,
      before: sql<string>`coalesce(sum(case when ${stockTrn.trnDate} < ${p.from} then ${stockTrn.inQty} - ${stockTrn.outQty} else 0 end), 0)`,
      inward: sql<string>`coalesce(sum(case when ${stockTrn.trnDate} >= ${p.from} then ${stockTrn.inQty} else 0 end), 0)`,
      outward: sql<string>`coalesce(sum(case when ${stockTrn.trnDate} >= ${p.from} then ${stockTrn.outQty} else 0 end), 0)`,
    })
    .from(stockTrn)
    .where(and(...where))
    .groupBy(stockTrn.partCode);
  const byCode = new Map(moved.map((m) => [m.code, m]));
  return items.map((i) => {
    const m = byCode.get(i.partCode);
    const opening = round2((p.godown ? 0 : Number(i.opQty)) + Number(m?.before ?? 0));
    const inward = round2(Number(m?.inward ?? 0));
    const outward = round2(Number(m?.outward ?? 0));
    const closing = round2(opening + inward - outward);
    const rate = stockRate(Number(i.purRate), Number(i.saleRate));
    return {
      code: i.partCode,
      name: i.partName,
      unit: i.unit ?? '',
      opening,
      inward,
      outward,
      closing,
      rate,
      value: round2(closing * rate),
    };
  });
}

/** Opening stock (the items' opening values) and closing stock as on a date, at MDA's rate. */
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
  let opening = 0;
  let closing = 0;
  for (const i of items) {
    const rate = stockRate(Number(i.purRate), Number(i.saleRate));
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
