// GST Reports (docs/design/GST-REPORTS.md): the period's Active sale and purchase bills turned
// into GSTR-1, GSTR-3B, the HSN summary, the input tax credit register and the audit checks.

import {
  CREDITORS_GROUP,
  DEBTORS_GROUP,
  PURCHASE_LEDGERS,
  SALE_LEDGERS,
  gstMessages as gm,
  gstr1,
  gstr3b,
  hsnSummary,
  isInterState,
  partyStateCode,
  placeOfSupply,
  round2,
  sumTax,
  validators,
  type AuditFinding,
  type GstBill,
  type GstLine,
} from '@qi/core';
import { and, asc, eq, gte, inArray, lte, or, schema, sql, type Db } from '@qi/db';

const {
  accountGroups,
  books,
  companies,
  ledgers,
  purchaseLines,
  purchases,
  saleLines,
  sales,
  stockItems,
  voucherLines,
  vouchers,
} = schema;

export type GstContext = { bookId: string; companyStateCode: string };
export type Period = { from: string; to: string };

const line = (r: {
  hsnNo: string | null;
  itemName: string | null;
  unit: string | null;
  qty: string;
  sgstP: string;
  cgstP: string;
  igstP: string;
  amount: string;
  igstA: string;
  cgstA: string;
  sgstA: string;
}): GstLine => ({
  hsn: (r.hsnNo ?? '').trim(),
  itemName: r.itemName ?? '',
  unit: r.unit ?? '',
  qty: Number(r.qty),
  rate: round2(Number(r.sgstP) + Number(r.cgstP) + Number(r.igstP)),
  taxable: Number(r.amount),
  igst: Number(r.igstA),
  cgst: Number(r.cgstA),
  sgst: Number(r.sgstA),
});

/** The period's Active sale bills with their lines. */
async function saleBills(
  db: Db,
  bookId: string,
  p: Period,
): Promise<(GstBill & { itemCodes: string[] })[]> {
  const heads = await db
    .select()
    .from(sales)
    .where(
      and(
        eq(sales.bookId, bookId),
        eq(sales.status, 'Active'),
        gte(sales.billDate, p.from),
        lte(sales.billDate, p.to),
      ),
    )
    .orderBy(asc(sales.billDate), asc(sales.billNo));
  if (!heads.length) return [];
  const rows = await db
    .select()
    .from(saleLines)
    .where(
      inArray(
        saleLines.saleId,
        heads.map((h) => h.id),
      ),
    )
    .orderBy(asc(saleLines.lineNo));
  return heads.map((h) => {
    const mine = rows.filter((r) => r.saleId === h.id);
    const gstin = (h.gstNo ?? '').trim().toUpperCase();
    return {
      billNo: h.billNo,
      date: h.billDate,
      partyName: h.custName ?? '',
      gstin,
      stateCode: partyStateCode(h.stateCode, gstin),
      interState: h.isInterState,
      value: Number(h.netAmount),
      lines: mine.map(line),
      itemCodes: mine.map((r) => r.itemCode),
    };
  });
}

/** The period's Active purchase bills with their lines and the supplier's GSTIN. */
async function purchaseBills(db: Db, bookId: string, p: Period) {
  const heads = await db
    .select({ p: purchases, name: ledgers.accName, gstin: ledgers.gstin, state: ledgers.stateCode })
    .from(purchases)
    .leftJoin(
      ledgers,
      and(eq(ledgers.bookId, purchases.bookId), eq(ledgers.accCode, purchases.suppCode)),
    )
    .where(
      and(
        eq(purchases.bookId, bookId),
        eq(purchases.status, 'Active'),
        gte(purchases.billDate, p.from),
        lte(purchases.billDate, p.to),
      ),
    )
    .orderBy(asc(purchases.billDate), asc(purchases.billNo));
  if (!heads.length) return [];
  const rows = await db
    .select()
    .from(purchaseLines)
    .where(
      inArray(
        purchaseLines.purchaseId,
        heads.map((h) => h.p.id),
      ),
    )
    .orderBy(asc(purchaseLines.lineNo));
  return heads.map(({ p: h, name, gstin, state }) => {
    const mine = rows.filter((r) => r.purchaseId === h.id);
    const g = (gstin ?? '').trim().toUpperCase();
    return {
      billNo: h.billNo,
      suppInvNo: h.suppInvNo ?? '',
      date: h.billDate,
      partyName: name ?? h.suppCode,
      gstin: g,
      gstinOk: !!g && validators.gstin(g) === null,
      stateCode: partyStateCode(state, g),
      interState: h.isInterState,
      value: Number(h.netAmount),
      lines: mine.map(line),
      itemCodes: mine.map((r) => r.itemCode),
    };
  });
}

export async function gstr1Report(db: Db, ctx: GstContext, p: Period) {
  return gstr1(await saleBills(db, ctx.bookId, p), ctx.companyStateCode);
}

export async function hsnReport(db: Db, ctx: GstContext, p: Period & { side: 'out' | 'in' }) {
  const bills =
    p.side === 'out' ? await saleBills(db, ctx.bookId, p) : await purchaseBills(db, ctx.bookId, p);
  return hsnSummary(bills);
}

export type ItcRow = {
  billNo: string;
  suppInvNo: string;
  date: string;
  supplier: string;
  gstin: string;
  pos: string;
  eligible: boolean;
  taxable: number;
  igst: number;
  cgst: number;
  sgst: number;
  itc: number;
};

/** Input tax credit register: one row per purchase bill; credit is eligible only when the
 *  supplier has a valid GSTIN. */
export async function itcReport(db: Db, ctx: GstContext, p: Period): Promise<ItcRow[]> {
  return (await purchaseBills(db, ctx.bookId, p)).map((b) => {
    const t = sumTax(b.lines);
    return {
      billNo: b.billNo,
      suppInvNo: b.suppInvNo,
      date: b.date,
      supplier: b.partyName,
      gstin: b.gstin,
      pos: placeOfSupply(b.stateCode || ctx.companyStateCode),
      eligible: b.gstinOk,
      ...t,
      itc: round2(t.igst + t.cgst + t.sgst),
    };
  });
}

export async function gstr3bReport(db: Db, ctx: GstContext, p: Period) {
  const out = await saleBills(db, ctx.bookId, p);
  const outLines = out.flatMap((b) => b.lines);
  const outward = sumTax(outLines.filter((l) => l.rate > 0));
  const nilExempt = round2(outLines.filter((l) => l.rate <= 0).reduce((a, l) => a + l.taxable, 0));
  const itc = sumTax((await itcReport(db, ctx, p)).filter((r) => r.eligible));
  return gstr3b(outward, nilExempt, { igst: itc.igst, cgst: itc.cgst, sgst: itc.sgst });
}

/** How much a tax ledger moved in the period (Cr − Dr for output, Dr − Cr for input). */
async function ledgerMoves(db: Db, bookId: string, p: Period, codes: string[]) {
  const rows = await db
    .select({
      code: voucherLines.accCode,
      dr: sql<string>`coalesce(sum(${voucherLines.drAmount}), 0)`,
      cr: sql<string>`coalesce(sum(${voucherLines.crAmount}), 0)`,
    })
    .from(voucherLines)
    .innerJoin(vouchers, eq(vouchers.id, voucherLines.voucherId))
    .where(
      and(
        eq(vouchers.bookId, bookId),
        eq(vouchers.status, 'Active'),
        gte(vouchers.vchrDate, p.from),
        lte(vouchers.vchrDate, p.to),
        inArray(voucherLines.accCode, codes),
      ),
    )
    .groupBy(voucherLines.accCode);
  return new Map(rows.map((r) => [r.code, { dr: Number(r.dr), cr: Number(r.cr) }]));
}

/** GST Audit: what would make the returns wrong, errors first. */
export async function gstAudit(db: Db, ctx: GstContext, p: Period): Promise<AuditFinding[]> {
  const out: AuditFinding[] = [];
  const [company] = await db
    .select({ gstin: companies.gstin, name: companies.compName })
    .from(books)
    .innerJoin(companies, eq(companies.id, books.companyId))
    .where(eq(books.id, ctx.bookId));
  const companyGstin = (company?.gstin ?? '').trim();
  if (!companyGstin)
    out.push({
      level: 'error',
      area: 'Company',
      text: gm.noCompanyGstin,
      ref: company?.name ?? '',
    });
  if (!ctx.companyStateCode)
    out.push({
      level: 'warning',
      area: 'Company',
      text: gm.noCompanyState,
      ref: company?.name ?? '',
    });

  // Party GSTINs (customers and suppliers, and groups directly under them).
  const groups = await db
    .select({ code: accountGroups.grpCode })
    .from(accountGroups)
    .where(
      and(
        eq(accountGroups.bookId, ctx.bookId),
        or(
          inArray(accountGroups.grpCode, [DEBTORS_GROUP, CREDITORS_GROUP]),
          inArray(accountGroups.parentGrp, [DEBTORS_GROUP, CREDITORS_GROUP]),
        ),
      ),
    );
  if (groups.length) {
    const parties = await db
      .select({ name: ledgers.accName, code: ledgers.accCode, gstin: ledgers.gstin })
      .from(ledgers)
      .where(
        and(
          eq(ledgers.bookId, ctx.bookId),
          inArray(
            ledgers.grpCode,
            groups.map((g) => g.code),
          ),
        ),
      )
      .orderBy(asc(ledgers.accName));
    for (const party of parties) {
      const problem = validators.gstin(party.gstin);
      if ((party.gstin ?? '').trim() && problem)
        out.push({
          level: 'error',
          area: 'Party GSTIN',
          text: gm.badGstin(party.name, problem),
          ref: party.code,
        });
    }
  }

  const sold = await saleBills(db, ctx.bookId, p);
  const bought = await purchaseBills(db, ctx.bookId, p);

  // Bills' own GST numbers, and the CGST + SGST / IGST split against the states.
  for (const b of sold) {
    const problem = b.gstin ? validators.gstin(b.gstin) : null;
    if (problem)
      out.push({
        level: 'error',
        area: 'Sale bill',
        text: gm.badGstin(`${b.billNo} (${b.partyName})`, problem),
        ref: b.billNo,
      });
  }
  if (ctx.companyStateCode)
    for (const b of [...sold, ...bought]) {
      if (!b.stateCode) continue;
      const expected = isInterState(ctx.companyStateCode, b.stateCode);
      if (expected !== b.interState)
        out.push({
          level: 'error',
          area: 'Tax split',
          text: gm.wrongSplit(b.billNo, expected ? 'IGST' : 'CGST + SGST'),
          ref: b.billNo,
        });
    }

  // Input tax from suppliers without a valid GSTIN.
  for (const b of bought) {
    const tax = sumTax(b.lines);
    if (!b.gstinOk && tax.igst + tax.cgst + tax.sgst > 0)
      out.push({
        level: 'warning',
        area: 'Input tax credit',
        text: gm.unregisteredItc(b.billNo, b.partyName),
        ref: b.billNo,
      });
  }

  // Items on the period's bills: HSN code, and 0% on a Taxable item.
  const codes = [...new Set([...sold, ...bought].flatMap((b) => b.itemCodes))];
  if (codes.length) {
    const items = await db
      .select()
      .from(stockItems)
      .where(and(eq(stockItems.bookId, ctx.bookId), inArray(stockItems.partCode, codes)))
      .orderBy(asc(stockItems.partName));
    for (const i of items) {
      if (!(i.hsnNo ?? '').trim())
        out.push({
          level: 'warning',
          area: 'HSN code',
          text: gm.noHsn(i.partName),
          ref: i.partCode,
        });
      const rate = Number(String(i.gstRate ?? '').replace('%', '')) || 0;
      if (i.regType === 'Taxable' && rate <= 0)
        out.push({
          level: 'warning',
          area: 'GST rate',
          text: gm.noRate(i.partName),
          ref: i.partCode,
        });
    }
  }

  // Tax ledgers against the bills (a manual journal to a tax ledger shows here).
  const S = SALE_LEDGERS;
  const P = PURCHASE_LEDGERS;
  const moves = await ledgerMoves(db, ctx.bookId, p, [
    S.outputCgst,
    S.outputSgst,
    S.outputIgst,
    P.inputCgst,
    P.inputSgst,
    P.inputIgst,
  ]);
  const names = new Map(
    (
      await db
        .select({ c: ledgers.accCode, n: ledgers.accName })
        .from(ledgers)
        .where(eq(ledgers.bookId, ctx.bookId))
    ).map((l) => [l.c, l.n]),
  );
  const soldTax = sumTax(sold.flatMap((b) => b.lines));
  const boughtTax = sumTax(bought.flatMap((b) => b.lines));
  const checks: [string, number, 'out' | 'in'][] = [
    [S.outputCgst, soldTax.cgst, 'out'],
    [S.outputSgst, soldTax.sgst, 'out'],
    [S.outputIgst, soldTax.igst, 'out'],
    [P.inputCgst, boughtTax.cgst, 'in'],
    [P.inputSgst, boughtTax.sgst, 'in'],
    [P.inputIgst, boughtTax.igst, 'in'],
  ];
  for (const [code, bills, side] of checks) {
    const m = moves.get(code) ?? { dr: 0, cr: 0 };
    const books = round2(side === 'out' ? m.cr - m.dr : m.dr - m.cr);
    if (Math.abs(books - bills) >= 0.01)
      out.push({
        level: 'warning',
        area: 'Tax ledger',
        text: gm.ledgerMismatch(names.get(code) ?? code, books, bills),
        ref: code,
      });
  }

  return out.sort((a, b) => (a.level === b.level ? 0 : a.level === 'error' ? -1 : 1));
}
