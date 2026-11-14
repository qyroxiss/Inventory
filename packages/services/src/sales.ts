// Sales Invoice. Port of MDA-Inventory lib/sale_service.dart (docs/LOGIC-SPEC.md §4.3, §6.1,
// §6.8).
//
// A save writes, in ONE transaction: the bill (sales) and its lines (sale_lines), and a SAL
// voucher with the ledger lines, item lines, stock outward and — for a credit sale — the
// customer's bill reference, plus an audit entry.
//
// As in MDA:
//   - Nothing is sold beyond the stock in hand: in all, as on the bill date, and in the bill's
//     godown (MDA looked at all godowns and every date: Q-27, fixed 2026-11-14).
//   - A cash sale is debited to the Cash or Bank account chosen on the bill (2026-11-14), else
//     the first Cash-in-Hand ledger by code; a book with none gets a "Cash" ledger (CASH001) so
//     a cash sale is never blocked (was Q-30).
//   - A cash sale may be to a walk-in customer: a typed name, no ledger (was Q-51).
//   - Bill numbers run per sale-type prefix; the SALEBILL counter is a floor only for the
//     standard prefix and is never moved (Q-08).
//   - Update reposts the voucher under its same SAL number (MDA took a new one: Q-07, fixed
//     2026-11-14).
//   - Cancel never deletes: bill and voucher marked Cancelled, the goods go back into stock.
//   - The voucher's narration is the bill's Narration, or "Sale <bill no>" when blank.

import {
  ACTIVE,
  BANK_GROUP,
  CANCELLED,
  CASH_SALE_LEDGER,
  CUSTOMER_GROUP,
  SALE_BILL_SERIES,
  SALE_GROUP_SEEDS,
  SALE_LEDGER_SEEDS,
  gstRateNumber,
  partyStateCode,
  saleBillPrefix,
  saleLine,
  saleMessages as sm,
  salePosting,
  saleProblem,
  saleTotals,
  type SaleLine,
  type SaleTotals,
} from '@qi/core';
import { and, asc, desc, eq, inArray, schema, sql, type Db } from '@qi/db';
import { assertNoReturns, assertReturnsFit } from './bill-returns.ts';
import { groupFamilyCodes } from './groups.ts';
import { UserError } from './errors.ts';
import { listSaleTypes } from './sale-types.ts';
import { assertStockAvailable } from './stock.ts';
import {
  assertLedgersExist,
  commitVoucherNo,
  nextVoucherNo,
  type PostingContext,
} from './vouchers.ts';

const {
  accountGroups,
  auditLog,
  billRefs,
  ledgers,
  saleLines,
  sales,
  stockItems,
  stockTrn,
  voucherItems,
  voucherLines,
  voucherSeries,
  vouchers,
} = schema;

const money = (v: number) => v.toFixed(2);
const qty3 = (v: number) => String(Math.round(v * 1000) / 1000);

// ── What the screen loads (_load) ───────────────────────────────────────────────

export type Customer = {
  code: string;
  name: string;
  address: string;
  city: string;
  state: string;
  stateCode: string;
  mobile: string;
  gstNo: string;
};

/** Customers (active ledgers in Sundry Debtors or any sub group under it), items with their
 *  sale rate, and the sale types by name. */
export async function saleLookups(db: Db, bookId: string) {
  const codes = await groupFamilyCodes(db, bookId, [CUSTOMER_GROUP]);
  const cust = codes.length
    ? await db
        .select()
        .from(ledgers)
        .where(
          and(
            eq(ledgers.bookId, bookId),
            inArray(ledgers.grpCode, codes),
            eq(ledgers.isActive, true),
          ),
        )
        .orderBy(asc(ledgers.accName))
    : [];
  const items = await db
    .select()
    .from(stockItems)
    .where(eq(stockItems.bookId, bookId))
    .orderBy(asc(stockItems.partName));
  return {
    customers: cust.map((r): Customer => ({
      code: r.accCode,
      name: r.accName,
      address: r.add1 ?? '',
      city: r.city ?? '',
      state: r.state ?? '',
      stateCode: partyStateCode(r.stateCode, r.gstin, r.state),
      mobile: r.mobile ?? '',
      gstNo: (r.gstin ?? '').trim(),
    })),
    items: items.map((r) => ({
      code: r.partCode,
      isActive: r.isActive,
      name: r.partName,
      unit: r.unit,
      hsnNo: r.hsnNo,
      gstRate: gstRateNumber(r.gstRate),
      saleRate: Number(r.saleRate),
    })),
    saleTypes: await listSaleTypes(db, bookId),
    // A cash sale's account (Cash-in-Hand or Bank, with their sub groups), and the godowns.
    cashAccounts: await cashAccountsOf(db, bookId),
    godowns: await db
      .select({ code: schema.miscList.miscCode, name: schema.miscList.miscName })
      .from(schema.miscList)
      .where(and(eq(schema.miscList.bookId, bookId), eq(schema.miscList.miscType, 'Godown')))
      .orderBy(asc(schema.miscList.miscName)),
  };
}

/** Cash-in-Hand ledgers first (the first is the default), then the banks. */
async function cashAccountsOf(db: Db, bookId: string) {
  const cash = await groupFamilyCodes(db, bookId, [CASH_SALE_LEDGER.group]);
  const groups = [...cash, ...(await groupFamilyCodes(db, bookId, [BANK_GROUP]))];
  if (!groups.length) return [];
  const rows = await db
    .select({ code: ledgers.accCode, name: ledgers.accName, grpCode: ledgers.grpCode })
    .from(ledgers)
    .where(
      and(eq(ledgers.bookId, bookId), inArray(ledgers.grpCode, groups), eq(ledgers.isActive, true)),
    )
    .orderBy(asc(ledgers.accCode));
  const isCash = (g: string) => cash.includes(g);
  return rows
    .sort((x, y) => Number(isCash(y.grpCode)) - Number(isCash(x.grpCode)))
    .map((r) => ({ code: r.code, name: r.name }));
}

// ── Numbering (nextBillNo) ──────────────────────────────────────────────────────

/** Next bill number for a sale type's prefix (or the SALEBILL series when it has none). Each
 *  prefix counts separately; the width always comes from SALEBILL. */
export async function nextSaleBillNo(
  db: Db,
  bookId: string,
  typePrefix?: string | null,
): Promise<string> {
  const [series] = await db
    .select()
    .from(voucherSeries)
    .where(
      and(eq(voucherSeries.bookId, bookId), eq(voucherSeries.vchrType, SALE_BILL_SERIES.type)),
    );
  const seriesPrefix = series
    ? (series.prefix ?? SALE_BILL_SERIES.prefix)
    : SALE_BILL_SERIES.prefix;
  const width = series ? series.width : SALE_BILL_SERIES.width;
  const lastNo = series?.lastNo ?? 0;
  const use = saleBillPrefix(typePrefix) ?? seriesPrefix;

  const used = await db
    .select({ no: sales.billNo })
    .from(sales)
    .where(and(eq(sales.bookId, bookId), sql`${sales.billNo} like ${`${use}%`}`));
  let max = 0;
  for (const { no } of used) {
    const v = parseInt(no.substring(use.length).replace(/\D/g, ''), 10) || 0;
    if (v > max) max = v;
  }
  // The stored counter only applies to the standard series.
  const floor = use === seriesPrefix ? lastNo : 0;
  return use + String(Math.max(floor, max) + 1).padStart(width, '0');
}

// ── Save, update, cancel ────────────────────────────────────────────────────────

export type SaleLineInput = {
  itemCode: string;
  itemName: string;
  hsnNo?: string | null;
  unit?: string | null;
  location?: string | null;
  qty: number;
  rate: number;
  disP: number;
  disA: number;
  gstRate: number;
};

export type SaleInput = {
  billNo: string;
  /** yyyy-MM-dd */
  billDate: string;
  saleType?: string | null;
  isCash: boolean;
  custCode?: string | null;
  custName: string;
  address?: string;
  area?: string;
  city?: string;
  state?: string;
  stateCode?: string | null;
  mobile?: string;
  gstNo?: string;
  location?: string;
  billDiscPct: number;
  billDiscAmt: number;
  interState: boolean;
  lines: SaleLineInput[];
  /** A cash sale's Cash-in-Hand or Bank ledger; blank takes the first cash ledger. */
  cashAccount?: string | null;
  narration?: string;
};

const buildLines = (input: SaleInput): SaleLine[] =>
  input.lines.map((l) =>
    saleLine({ ...l, disA: l.disP > 0 ? 0 : l.disA, interState: input.interState }),
  );

function check(ctx: PostingContext, input: SaleInput, lines: SaleLine[]) {
  const problem = saleProblem(
    {
      billNo: input.billNo,
      custName: input.custName,
      custCode: input.custCode ?? null,
      isCash: input.isCash,
      billDate: input.billDate,
      fyFrom: ctx.fyFrom,
      fyTo: ctx.fyTo,
      fyLabel: ctx.financialYearLabel,
      billDiscPct: input.billDiscPct,
      billDiscAmt: input.billDiscAmt,
    },
    lines,
  );
  if (problem) throw new UserError(problem);
}

const t = (s?: string | null) => (s ?? '').trim();

const masterValues = (input: SaleInput, tot: SaleTotals) => ({
  billDate: input.billDate,
  saleType: input.saleType ?? null,
  payMode: input.isCash ? 'Cash' : 'Credit',
  custCode: input.custCode || null,
  custName: t(input.custName),
  address: t(input.address),
  area: t(input.area),
  city: t(input.city),
  state: t(input.state),
  stateCode: input.stateCode ?? null,
  mobile: t(input.mobile),
  gstNo: t(input.gstNo),
  location: t(input.location),
  narration: t(input.narration) || null,
  isInterState: input.interState,
  totalQty: qty3(tot.qty),
  subTotal: money(tot.subTotal),
  itemDiscAmt: money(tot.itemDisc),
  billDiscPct: money(input.billDiscPct),
  billDiscAmt: money(tot.billDisc),
  sgstAmt: money(tot.sgst),
  cgstAmt: money(tot.cgst),
  igstAmt: money(tot.igst),
  roundOff: money(tot.roundOff),
  netAmount: money(tot.net),
});

async function writeLines(db: Db, saleId: string, lines: SaleLine[]) {
  await db.insert(saleLines).values(
    lines.map((l, i) => ({
      saleId,
      lineNo: i + 1,
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

async function ensureGroup(db: Db, bookId: string, grpCode: string, sortOrder = 0) {
  const [has] = await db
    .select({ id: accountGroups.id })
    .from(accountGroups)
    .where(and(eq(accountGroups.bookId, bookId), eq(accountGroups.grpCode, grpCode)));
  if (has) return;
  const [name, type, parent] = SALE_GROUP_SEEDS[grpCode]!;
  await db
    .insert(accountGroups)
    .values({
      bookId,
      grpCode,
      grpName: name,
      grpType: type,
      parentGrp: parent,
      isLedger: 'No',
      sortOrder,
      clr: '1',
    })
    .onConflictDoNothing();
}

/** `_resolveDebtor` with `_ensureLedgers`: creates any missing system ledger, then returns the
 *  account debited — the customer on credit, the first Cash-in-Hand ledger on cash. */
async function resolveDebtor(db: Db, bookId: string, input: SaleInput): Promise<string> {
  for (const [code, [name, grpCode, drCr]] of Object.entries(SALE_LEDGER_SEEDS)) {
    const [has] = await db
      .select({ id: ledgers.id })
      .from(ledgers)
      .where(and(eq(ledgers.bookId, bookId), eq(ledgers.accCode, code)));
    if (has) continue;
    await ensureGroup(db, bookId, grpCode);
    await db
      .insert(ledgers)
      .values({ bookId, accCode: code, accName: name, grpCode, opBal: '0', drCr, isActive: true })
      .onConflictDoNothing();
  }
  if (input.isCash) await ensureGroup(db, bookId, CASH_SALE_LEDGER.group, 2);

  if (!input.isCash) {
    if (!input.custCode) throw new UserError(sm.creditNoCustomer);
    await assertLedgersExist(db, bookId, [input.custCode]);
    return input.custCode;
  }
  const cashGroups = await groupFamilyCodes(db, bookId, [CASH_SALE_LEDGER.group, BANK_GROUP]);
  if (input.cashAccount) {
    const [chosen] = await db
      .select({ code: ledgers.accCode })
      .from(ledgers)
      .where(
        and(
          eq(ledgers.bookId, bookId),
          eq(ledgers.accCode, input.cashAccount),
          inArray(ledgers.grpCode, cashGroups),
        ),
      );
    if (!chosen) throw new UserError(sm.badCashAccount);
    return chosen.code;
  }
  const [cash] = await db
    .select({ code: ledgers.accCode })
    .from(ledgers)
    .where(and(eq(ledgers.bookId, bookId), eq(ledgers.grpCode, CASH_SALE_LEDGER.group)))
    .orderBy(asc(ledgers.accCode))
    .limit(1);
  if (cash) return cash.code;
  await db
    .insert(ledgers)
    .values({
      bookId,
      accCode: CASH_SALE_LEDGER.code,
      accName: CASH_SALE_LEDGER.name,
      grpCode: CASH_SALE_LEDGER.group,
      opBal: '0',
      drCr: 'Dr',
      isActive: true,
    })
    .onConflictDoNothing();
  return CASH_SALE_LEDGER.code;
}

/** `_postLedger`: the SAL voucher with its ledger lines, item lines, stock outward and (credit
 *  only) bill reference. Returns the new voucher's id. */
async function postSale(
  db: Db,
  ctx: PostingContext,
  input: SaleInput,
  lines: SaleLine[],
  tot: SaleTotals,
  /** On update, the bill's existing voucher number (kept since 2026-11-14; MDA took a new one:
   *  Q-07). */
  keepNo?: string,
): Promise<string> {
  const debtor = await resolveDebtor(db, ctx.bookId, input);
  const acct = salePosting(debtor, tot, input.interState);
  const totalDr = acct.reduce((a, l) => a + l.dr, 0);
  const totalCr = acct.reduce((a, l) => a + l.cr, 0);
  if (Math.abs(totalDr - totalCr) >= 0.005)
    throw new UserError(sm.unbalanced(Math.abs(totalDr - totalCr)));

  const vchrNo = keepNo ?? (await nextVoucherNo(db, ctx.bookId, 'SAL'));
  const [v] = await db
    .insert(vouchers)
    .values({
      bookId: ctx.bookId,
      vchrNo,
      vchrType: 'SAL',
      vchrDate: input.billDate,
      partyCode: input.custCode || null,
      refNo: input.billNo,
      narration: t(input.narration) || `Sale ${input.billNo}`,
      placeOfSupply: input.stateCode ?? null,
      taxableAmt: money(tot.subTotal),
      cgstAmt: money(tot.cgst),
      sgstAmt: money(tot.sgst),
      igstAmt: money(tot.igst),
      otherChrg: money(-tot.billDisc),
      roundOff: money(tot.roundOff),
      netAmount: money(tot.net),
      status: ACTIVE,
      createdBy: ctx.userName,
    })
    .returning({ id: vouchers.id });
  const voucherId = v!.id;
  if (!keepNo) await commitVoucherNo(db, ctx.bookId, 'SAL', vchrNo);

  await db.insert(voucherLines).values(
    acct.map((l, i) => ({
      voucherId,
      lineNo: i + 1,
      accCode: l.accCode,
      drAmount: money(l.dr),
      crAmount: money(l.cr),
    })),
  );
  // Goods going out.
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
  const moving = lines.filter((l) => l.qty !== 0);
  if (moving.length)
    await db.insert(stockTrn).values(
      moving.map((l) => ({
        bookId: ctx.bookId,
        voucherId,
        vchrType: 'SAL',
        vchrNo: input.billNo,
        trnDate: input.billDate,
        partCode: l.itemCode,
        godownCode: l.location,
        inQty: '0',
        outQty: qty3(l.qty),
        rate: money(l.rate),
        value: money(l.amount),
      })),
    );
  // Only a credit sale leaves money outstanding.
  if (!input.isCash && input.custCode)
    await db.insert(billRefs).values({
      voucherId,
      accCode: input.custCode,
      billNo: input.billNo,
      refType: 'New',
      billDate: input.billDate,
      amount: money(tot.net),
    });
  return voucherId;
}

async function log(db: Db, ctx: PostingContext, action: string, billNo: string, details: string) {
  await db.insert(auditLog).values({
    bookId: ctx.bookId,
    userName: ctx.userName,
    action,
    tableName: 'SaleMaster',
    recordKey: billNo,
    details,
  });
}

async function findSale(db: Db, bookId: string, billNo: string) {
  const [s] = await db
    .select()
    .from(sales)
    .where(and(eq(sales.bookId, bookId), eq(sales.billNo, billNo)));
  return s ?? null;
}

export async function saveSale(
  db: Db,
  ctx: PostingContext,
  input: SaleInput,
): Promise<{ billNo: string; net: number }> {
  const lines = buildLines(input);
  check(ctx, input, lines);
  const tot = saleTotals(lines, input.billDiscPct, input.billDiscAmt);
  const billNo = input.billNo.trim();

  await db.transaction(async (raw) => {
    const tx = raw as unknown as Db;
    if (await findSale(tx, ctx.bookId, billNo)) throw new UserError(sm.billUsed(billNo));
    await assertStockAvailable(tx, ctx.bookId, lines, input.billDate);
    const voucherId = await postSale(tx, ctx, { ...input, billNo }, tot.taxed, tot);
    const [s] = await tx
      .insert(sales)
      .values({
        bookId: ctx.bookId,
        billNo,
        ...masterValues(input, tot),
        voucherId,
        status: ACTIVE,
        createdBy: ctx.userName,
      })
      .returning({ id: sales.id });
    await writeLines(tx, s!.id, tot.taxed);
    await log(tx, ctx, 'CREATE', billNo, `Net ${tot.net.toFixed(2)}, ${lines.length} item(s)`);
  });
  return { billNo, net: tot.net };
}

export async function updateSale(
  db: Db,
  ctx: PostingContext,
  input: SaleInput,
): Promise<{ billNo: string; net: number }> {
  const lines = buildLines(input);
  check(ctx, input, lines);
  const old = await findSale(db, ctx.bookId, input.billNo.trim());
  if (!old) throw new UserError(sm.notFound);
  if (old.status === CANCELLED) throw new UserError(sm.cancelledEdit);
  await assertReturnsFit(
    db,
    ctx.bookId,
    'SRT',
    old.billNo,
    lines,
    (old.custCode ?? '') !== (input.custCode ?? '') || old.isInterState !== input.interState,
  );
  const tot = saleTotals(lines, input.billDiscPct, input.billDiscAmt);

  await db.transaction(async (raw) => {
    const tx = raw as unknown as Db;
    await tx.delete(saleLines).where(eq(saleLines.saleId, old.id));
    let keepNo: string | undefined;
    if (old.voucherId) {
      const [ov] = await tx
        .select({ no: vouchers.vchrNo })
        .from(vouchers)
        .where(eq(vouchers.id, old.voucherId));
      keepNo = ov?.no;
      await tx.update(sales).set({ voucherId: null }).where(eq(sales.id, old.id));
      await tx.delete(vouchers).where(eq(vouchers.id, old.voucherId));
    }
    // The old stock movement is gone, so the check sees the position without this bill.
    await assertStockAvailable(tx, ctx.bookId, lines, input.billDate);
    const voucherId = await postSale(
      tx,
      ctx,
      { ...input, billNo: old.billNo },
      tot.taxed,
      tot,
      keepNo,
    );
    await tx
      .update(sales)
      .set({
        ...masterValues(input, tot),
        voucherId,
        modifiedBy: ctx.userName,
        modifiedAt: new Date(),
      })
      .where(eq(sales.id, old.id));
    await writeLines(tx, old.id, tot.taxed);
    await log(tx, ctx, 'UPDATE', old.billNo, `Net ${tot.net.toFixed(2)}`);
  });
  return { billNo: old.billNo, net: tot.net };
}

/** Marks the bill and its voucher Cancelled; the goods go back into stock. */
export async function cancelSale(db: Db, ctx: PostingContext, billNo: string): Promise<void> {
  const s = await findSale(db, ctx.bookId, billNo);
  if (!s) throw new UserError(sm.notFound);
  if (s.status === CANCELLED) return;
  await assertNoReturns(db, ctx.bookId, 'SRT', s.billNo);
  const now = new Date();
  await db.transaction(async (raw) => {
    const tx = raw as unknown as Db;
    await tx
      .update(sales)
      .set({ status: CANCELLED, cancelledBy: ctx.userName, cancelledAt: now })
      .where(eq(sales.id, s.id));
    if (s.voucherId) {
      await tx
        .update(vouchers)
        .set({ status: CANCELLED, cancelledBy: ctx.userName, cancelledAt: now })
        .where(eq(vouchers.id, s.voucherId));
      await tx.delete(stockTrn).where(eq(stockTrn.voucherId, s.voucherId));
    }
    await log(tx, ctx, 'CANCEL', billNo, 'Cancelled by user');
  });
}

// ── Reading ─────────────────────────────────────────────────────────────────────

export type SaleRow = {
  billNo: string;
  billDate: string;
  custName: string;
  mobile: string;
  payMode: string;
  itemCount: number;
  netAmount: number;
  status: string;
};

/** Every sale, newest first, with its number of items. */
export async function listSales(db: Db, bookId: string): Promise<SaleRow[]> {
  const rows = await db
    .select({
      billNo: sales.billNo,
      billDate: sales.billDate,
      custName: sales.custName,
      mobile: sales.mobile,
      payMode: sales.payMode,
      itemCount: sql<number>`(select count(*)::int from ${saleLines} d where d.sale_id = "sales"."id")`,
      netAmount: sales.netAmount,
      status: sales.status,
    })
    .from(sales)
    .where(eq(sales.bookId, bookId))
    .orderBy(desc(sales.billDate), desc(sales.billNo));
  return rows.map((r) => ({
    ...r,
    custName: r.custName ?? '',
    mobile: r.mobile ?? '',
    itemCount: Number(r.itemCount),
    netAmount: Number(r.netAmount),
  }));
}

/** The account a sale's voucher debited (a cash sale's Cash or Bank ledger). */
async function debitedAccount(db: Db, voucherId: string | null): Promise<string> {
  if (!voucherId) return '';
  const [dr] = await db
    .select({ code: voucherLines.accCode })
    .from(voucherLines)
    .where(and(eq(voucherLines.voucherId, voucherId), sql`${voucherLines.drAmount} > 0`))
    .orderBy(asc(voucherLines.lineNo))
    .limit(1);
  return dr?.code ?? '';
}

/** One bill with its lines, for reopening. */
export async function saleBill(db: Db, bookId: string, billNo: string) {
  const s = await findSale(db, bookId, billNo);
  if (!s) return null;
  const rows = await db
    .select()
    .from(saleLines)
    .where(eq(saleLines.saleId, s.id))
    .orderBy(asc(saleLines.lineNo));
  // The lines as entered: the stored values carry the bill discount's share (taken before tax,
  // 2026-11-14), so they're worked out again from quantity, rate, discount and GST rate.
  const lines: SaleLine[] = rows.map((r) =>
    saleLine({
      itemCode: r.itemCode,
      itemName: r.itemName ?? '',
      hsnNo: r.hsnNo,
      unit: r.unit,
      location: r.location,
      qty: Number(r.qty),
      rate: Number(r.rate),
      disP: Number(r.disP),
      disA: Number(r.disA),
      gstRate: Number(r.sgstP) + Number(r.cgstP) + Number(r.igstP),
      interState: s.isInterState,
    }),
  );
  return {
    billNo: s.billNo,
    billDate: s.billDate,
    saleType: s.saleType ?? '',
    payMode: s.payMode,
    custCode: s.custCode ?? '',
    custName: s.custName ?? '',
    address: s.address ?? '',
    area: s.area ?? '',
    city: s.city ?? '',
    state: s.state ?? '',
    mobile: s.mobile ?? '',
    gstNo: s.gstNo ?? '',
    location: s.location ?? '',
    narration: s.narration ?? '',
    cashAccount: s.payMode === 'Cash' ? await debitedAccount(db, s.voucherId) : '',
    billDiscPct: Number(s.billDiscPct),
    billDiscAmt: Number(s.billDiscAmt),
    isInterState: s.isInterState,
    status: s.status,
    lines,
  };
}
