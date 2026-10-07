// Purchase Invoice. Port of MDA-Inventory lib/purchase_service.dart (docs/LOGIC-SPEC.md §4.3,
// §6.2, §6.8).
//
// A save writes, in ONE transaction: the bill (purchases) and its lines (purchase_lines), and a
// PUR voucher carrying the accounting and stock effect — ledger lines, item lines, stock inward
// and the supplier's bill reference — plus an audit entry.
//
// As in MDA:
//   - The bill number shown on screen is passed in; if it's taken meanwhile the save is refused
//     with "… Save again to take the next free number."
//   - Update deletes the old PUR voucher and posts a new one, so the bill keeps its number but
//     gets a new PUR-nnn voucher number (Q-07).
//   - Cancel never deletes: bill and voucher are marked Cancelled, the stock rows are deleted so
//     the quantities stop counting, and the ledger lines and bill reference stay.
//   - The narration is passed as typed, so an empty one stays empty and MDA's fallback
//     "Purchase <bill no>" never applies (Q-49).

import {
  ACTIVE,
  CANCELLED,
  PURCHASE_BILL_SERIES,
  PURCHASE_GROUP_SEEDS,
  PURCHASE_LEDGERS,
  PURCHASE_LEDGER_SEEDS,
  SUPPLIER_GROUP,
  gstRateNumber,
  partyStateCode,
  purcLine,
  purcTotals,
  purchaseMessages as pm,
  purchasePosting,
  purchaseProblem,
  type PurcLine,
  type PurcTotals,
} from '@qi/core';
import { and, asc, desc, eq, inArray, or, schema, sql, type Db } from '@qi/db';
import { UserError } from './errors.ts';
import { commitVoucherNo, nextVoucherNo, type PostingContext } from './vouchers.ts';

const {
  accountGroups,
  auditLog,
  billRefs,
  ledgers,
  miscList,
  purchaseLines,
  purchases,
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

export type Supplier = { code: string; name: string; stateCode: string; gstin: string };
export type PurchaseItem = {
  code: string;
  name: string;
  unit: string | null;
  hsnNo: string | null;
  gstRate: number;
  purRate: number;
};

/** Suppliers (active ledgers in Sundry Creditors or a group directly under it), every stock item
 *  and every godown, each by name. */
export async function purchaseLookups(db: Db, bookId: string) {
  const groups = await db
    .select({ code: accountGroups.grpCode })
    .from(accountGroups)
    .where(
      and(
        eq(accountGroups.bookId, bookId),
        or(eq(accountGroups.grpCode, SUPPLIER_GROUP), eq(accountGroups.parentGrp, SUPPLIER_GROUP)),
      ),
    );
  const codes = groups.map((g) => g.code);
  const supp = codes.length
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
  const godowns = await db
    .select({ code: miscList.miscCode, name: miscList.miscName })
    .from(miscList)
    .where(and(eq(miscList.bookId, bookId), eq(miscList.miscType, 'Godown')))
    .orderBy(asc(miscList.miscName));
  return {
    suppliers: supp.map((r): Supplier => ({
      code: r.accCode,
      name: r.accName,
      stateCode: partyStateCode(r.stateCode, r.gstin),
      gstin: (r.gstin ?? '').trim(),
    })),
    items: items.map((r): PurchaseItem => ({
      code: r.partCode,
      name: r.partName,
      unit: r.unit,
      hsnNo: r.hsnNo,
      gstRate: gstRateNumber(r.gstRate),
      purRate: Number(r.purRate),
    })),
    godowns,
  };
}

// ── Numbering (nextBillNo) ──────────────────────────────────────────────────────

/** Next bill number: max(series LastNo, highest bill with the prefix) + 1. LastNo is never moved
 *  on save (Q-08), so in practice it runs on the highest bill. */
export async function nextPurchaseBillNo(db: Db, bookId: string): Promise<string> {
  const [series] = await db
    .select()
    .from(voucherSeries)
    .where(
      and(eq(voucherSeries.bookId, bookId), eq(voucherSeries.vchrType, PURCHASE_BILL_SERIES.type)),
    );
  const prefix = series
    ? (series.prefix ?? PURCHASE_BILL_SERIES.prefix)
    : PURCHASE_BILL_SERIES.prefix;
  const width = series ? series.width : PURCHASE_BILL_SERIES.width;
  const lastNo = series?.lastNo ?? 0;

  const used = await db
    .select({ no: purchases.billNo })
    .from(purchases)
    .where(and(eq(purchases.bookId, bookId), sql`${purchases.billNo} like ${`${prefix}%`}`));
  let max = 0;
  for (const { no } of used) {
    const v = parseInt(no.substring(prefix.length).replace(/\D/g, ''), 10) || 0;
    if (v > max) max = v;
  }
  return prefix + String(Math.max(lastNo, max) + 1).padStart(width, '0');
}

// ── Save, update, cancel ────────────────────────────────────────────────────────

/** One entry line as the screen sends it; the server works out its tax again. */
export type PurchaseLineInput = {
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

export type PurchaseInput = {
  billNo: string;
  /** yyyy-MM-dd */
  billDate: string;
  suppCode: string;
  suppInvNo?: string;
  suppInvDate?: string;
  supplyWith?: string;
  orderNo?: string;
  orderDate?: string | null;
  orderType?: string;
  goodsRecNo?: string;
  recDate?: string;
  transporter?: string;
  narration?: string;
  /** Decided by the screen from the supplier, and kept from the bill when it's reopened. */
  interState: boolean;
  lines: PurchaseLineInput[];
};

const buildLines = (input: PurchaseInput): PurcLine[] =>
  input.lines.map((l) =>
    purcLine({
      ...l,
      // The stored discount amount is recomputed from the percentage when one is given.
      disA: l.disP > 0 ? 0 : l.disA,
      interState: input.interState,
    }),
  );

function check(ctx: PostingContext, input: PurchaseInput, lines: PurcLine[]) {
  const problem = purchaseProblem(
    {
      billNo: input.billNo,
      suppCode: input.suppCode,
      billDate: input.billDate,
      fyFrom: ctx.fyFrom,
      fyTo: ctx.fyTo,
      fyLabel: ctx.financialYearLabel,
    },
    lines,
  );
  if (problem) throw new UserError(problem);
}

const headerValues = (input: PurchaseInput, t: PurcTotals) => ({
  billDate: input.billDate,
  suppCode: input.suppCode,
  suppInvNo: input.suppInvNo?.trim() ?? '',
  suppInvDate: input.suppInvDate?.trim() ?? '',
  supplyWith: input.supplyWith?.trim() ?? '',
  orderNo: input.orderNo?.trim() ?? '',
  orderDate: input.orderDate ?? null,
  orderType: input.orderType?.trim() ?? '',
  goodsRecNo: input.goodsRecNo?.trim() ?? '',
  recDate: input.recDate?.trim() ?? '',
  transporter: input.transporter?.trim() ?? '',
  narration: input.narration?.trim() ?? '',
  isInterState: input.interState,
  totalQty: qty3(t.qty),
  subTotal: money(t.subTotal),
  discAmt: money(t.discount),
  sgstAmt: money(t.sgst),
  cgstAmt: money(t.cgst),
  igstAmt: money(t.igst),
  roundOff: money(t.roundOff),
  netAmount: money(t.net),
});

async function writeLines(db: Db, purchaseId: string, lines: PurcLine[]) {
  await db.insert(purchaseLines).values(
    lines.map((l, i) => ({
      purchaseId,
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

/** `_ensureLedgers`: a book whose group or ledger master was edited may be missing a system
 *  ledger the posting needs. Create it, and its group first if that's missing too. */
async function ensurePurchaseLedgers(db: Db, bookId: string, interState: boolean) {
  const L = PURCHASE_LEDGERS;
  const needed = [
    L.purchase,
    L.roundOff,
    ...(interState ? [L.inputIgst] : [L.inputCgst, L.inputSgst]),
  ];
  for (const code of needed) {
    const [has] = await db
      .select({ id: ledgers.id })
      .from(ledgers)
      .where(and(eq(ledgers.bookId, bookId), eq(ledgers.accCode, code)));
    if (has) continue;
    const [name, grpCode, drCr] = PURCHASE_LEDGER_SEEDS[code]!;
    const [grp] = await db
      .select({ id: accountGroups.id })
      .from(accountGroups)
      .where(and(eq(accountGroups.bookId, bookId), eq(accountGroups.grpCode, grpCode)));
    if (!grp) {
      const [gName, gType, parent] = PURCHASE_GROUP_SEEDS[grpCode]!;
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

/** `_postLedger`: the PUR voucher with its ledger lines, item lines, stock inward and bill
 *  reference. Returns the new voucher's id. */
async function postPurchase(
  db: Db,
  ctx: PostingContext,
  input: PurchaseInput,
  lines: PurcLine[],
  t: PurcTotals,
): Promise<string> {
  await ensurePurchaseLedgers(db, ctx.bookId, input.interState);

  const acct = purchasePosting(input.suppCode, t, input.interState);
  const totalDr = acct.reduce((a, l) => a + l.dr, 0);
  const totalCr = acct.reduce((a, l) => a + l.cr, 0);
  if (Math.abs(totalDr - totalCr) >= 0.005)
    throw new UserError(pm.unbalanced(Math.abs(totalDr - totalCr)));

  const vchrNo = await nextVoucherNo(db, ctx.bookId, 'PUR');
  const [v] = await db
    .insert(vouchers)
    .values({
      bookId: ctx.bookId,
      vchrNo,
      vchrType: 'PUR',
      vchrDate: input.billDate,
      partyCode: input.suppCode,
      refNo: input.billNo,
      refDate: input.suppInvDate?.trim() ?? '',
      narration: input.narration?.trim() ?? '',
      taxableAmt: money(t.subTotal),
      cgstAmt: money(t.cgst),
      sgstAmt: money(t.sgst),
      igstAmt: money(t.igst),
      roundOff: money(t.roundOff),
      netAmount: money(t.net),
      status: ACTIVE,
      createdBy: ctx.userName,
    })
    .returning({ id: vouchers.id });
  const voucherId = v!.id;
  await commitVoucherNo(db, ctx.bookId, 'PUR', vchrNo);

  await db.insert(voucherLines).values(
    acct.map((l, i) => ({
      voucherId,
      lineNo: i + 1,
      accCode: l.accCode,
      drAmount: money(l.dr),
      crAmount: money(l.cr),
    })),
  );

  // Goods coming in.
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
        vchrType: 'PUR',
        vchrNo: input.billNo,
        trnDate: input.billDate,
        partCode: l.itemCode,
        godownCode: l.location,
        inQty: qty3(l.qty),
        outQty: '0',
        rate: money(l.rate),
        value: money(l.amount),
      })),
    );

  // Bill-wise reference, so the supplier's outstanding can be aged.
  await db.insert(billRefs).values({
    voucherId,
    accCode: input.suppCode,
    billNo: input.billNo,
    refType: 'New',
    billDate: input.billDate,
    amount: money(t.net),
  });
  return voucherId;
}

async function log(db: Db, ctx: PostingContext, action: string, billNo: string, details: string) {
  await db.insert(auditLog).values({
    bookId: ctx.bookId,
    userName: ctx.userName,
    action,
    tableName: 'PurcMaster',
    recordKey: billNo,
    details,
  });
}

async function findPurchase(db: Db, bookId: string, billNo: string) {
  const [p] = await db
    .select()
    .from(purchases)
    .where(and(eq(purchases.bookId, bookId), eq(purchases.billNo, billNo)));
  return p ?? null;
}

export async function savePurchase(
  db: Db,
  ctx: PostingContext,
  input: PurchaseInput,
): Promise<{ billNo: string; net: number }> {
  const lines = buildLines(input);
  check(ctx, input, lines);
  const t = purcTotals(lines);
  const billNo = input.billNo.trim();

  await db.transaction(async (raw) => {
    const tx = raw as unknown as Db;
    if (await findPurchase(tx, ctx.bookId, billNo)) throw new UserError(pm.billUsed(billNo));
    const voucherId = await postPurchase(tx, ctx, { ...input, billNo }, lines, t);
    const [p] = await tx
      .insert(purchases)
      .values({
        bookId: ctx.bookId,
        billNo,
        ...headerValues(input, t),
        voucherId,
        status: ACTIVE,
        createdBy: ctx.userName,
      })
      .returning({ id: purchases.id });
    await writeLines(tx, p!.id, lines);
    await log(tx, ctx, 'CREATE', billNo, `Net ${t.net.toFixed(2)}, ${lines.length} item(s)`);
  });
  return { billNo, net: t.net };
}

/** Replaces a purchase, keeping its bill number; its voucher is reposted under a new number. */
export async function updatePurchase(
  db: Db,
  ctx: PostingContext,
  input: PurchaseInput,
): Promise<{ billNo: string; net: number }> {
  const lines = buildLines(input);
  check(ctx, input, lines);
  const old = await findPurchase(db, ctx.bookId, input.billNo.trim());
  if (!old) throw new UserError(pm.notFound);
  if (old.status === CANCELLED) throw new UserError(pm.cancelledEdit);
  const t = purcTotals(lines);

  await db.transaction(async (raw) => {
    const tx = raw as unknown as Db;
    await tx.delete(purchaseLines).where(eq(purchaseLines.purchaseId, old.id));
    if (old.voucherId) {
      // The bill points at its voucher, so the link is released before the voucher goes; its
      // ledger, item, stock and bill-reference rows go with it.
      await tx.update(purchases).set({ voucherId: null }).where(eq(purchases.id, old.id));
      await tx.delete(vouchers).where(eq(vouchers.id, old.voucherId));
    }
    const voucherId = await postPurchase(tx, ctx, { ...input, billNo: old.billNo }, lines, t);
    await tx
      .update(purchases)
      .set({
        ...headerValues(input, t),
        voucherId,
        modifiedBy: ctx.userName,
        modifiedAt: new Date(),
      })
      .where(eq(purchases.id, old.id));
    await writeLines(tx, old.id, lines);
    await log(tx, ctx, 'UPDATE', old.billNo, `Net ${t.net.toFixed(2)}`);
  });
  return { billNo: old.billNo, net: t.net };
}

/** Marks the purchase and its voucher Cancelled and removes its stock movement. The bill stays
 *  so numbering and the audit trail are intact. Cancelling twice does nothing. */
export async function cancelPurchase(db: Db, ctx: PostingContext, billNo: string): Promise<void> {
  const p = await findPurchase(db, ctx.bookId, billNo);
  if (!p) throw new UserError(pm.notFound);
  if (p.status === CANCELLED) return;
  const now = new Date();
  await db.transaction(async (raw) => {
    const tx = raw as unknown as Db;
    await tx
      .update(purchases)
      .set({ status: CANCELLED, cancelledBy: ctx.userName, cancelledAt: now })
      .where(eq(purchases.id, p.id));
    if (p.voucherId) {
      await tx
        .update(vouchers)
        .set({ status: CANCELLED, cancelledBy: ctx.userName, cancelledAt: now })
        .where(eq(vouchers.id, p.voucherId));
      // Quantities must stop counting towards stock in hand immediately.
      await tx.delete(stockTrn).where(eq(stockTrn.voucherId, p.voucherId));
    }
    await log(tx, ctx, 'CANCEL', billNo, 'Cancelled by user');
  });
}

// ── Reading ─────────────────────────────────────────────────────────────────────

export type PurchaseRow = {
  billNo: string;
  billDate: string;
  suppCode: string;
  suppName: string | null;
  suppInvNo: string;
  itemCount: number;
  netAmount: number;
  status: string;
};

/** Every purchase, newest first, with the supplier's name and its number of items. */
export async function listPurchases(db: Db, bookId: string): Promise<PurchaseRow[]> {
  const rows = await db
    .select({
      billNo: purchases.billNo,
      billDate: purchases.billDate,
      suppCode: purchases.suppCode,
      suppName: ledgers.accName,
      suppInvNo: purchases.suppInvNo,
      itemCount: sql<number>`(select count(*)::int from ${purchaseLines} d where d.purchase_id = ${purchases.id})`,
      netAmount: purchases.netAmount,
      status: purchases.status,
    })
    .from(purchases)
    .leftJoin(
      ledgers,
      and(eq(ledgers.bookId, purchases.bookId), eq(ledgers.accCode, purchases.suppCode)),
    )
    .where(eq(purchases.bookId, bookId))
    .orderBy(desc(purchases.billDate), desc(purchases.billNo));
  return rows.map((r) => ({
    ...r,
    suppInvNo: r.suppInvNo ?? '',
    itemCount: Number(r.itemCount),
    netAmount: Number(r.netAmount),
  }));
}

/** One bill with its supplier name and lines, for reopening (`header` + `lines`). */
export async function purchaseBill(db: Db, bookId: string, billNo: string) {
  const p = await findPurchase(db, bookId, billNo);
  if (!p) return null;
  const [supp] = await db
    .select({ name: ledgers.accName })
    .from(ledgers)
    .where(and(eq(ledgers.bookId, bookId), eq(ledgers.accCode, p.suppCode)));
  const rows = await db
    .select()
    .from(purchaseLines)
    .where(eq(purchaseLines.purchaseId, p.id))
    .orderBy(asc(purchaseLines.lineNo));
  const lines: PurcLine[] = rows.map((r) => ({
    itemCode: r.itemCode,
    itemName: r.itemName ?? '',
    hsnNo: r.hsnNo,
    unit: r.unit,
    location: r.location,
    qty: Number(r.qty),
    rate: Number(r.rate),
    disP: Number(r.disP),
    disA: Number(r.disA),
    amount: Number(r.amount),
    sgstP: Number(r.sgstP),
    sgstA: Number(r.sgstA),
    cgstP: Number(r.cgstP),
    cgstA: Number(r.cgstA),
    igstP: Number(r.igstP),
    igstA: Number(r.igstA),
    lineTotal: Number(r.lineTotal),
  }));
  return {
    billNo: p.billNo,
    billDate: p.billDate,
    suppCode: p.suppCode,
    suppName: supp?.name ?? '',
    suppInvNo: p.suppInvNo ?? '',
    suppInvDate: p.suppInvDate ?? '',
    supplyWith: p.supplyWith ?? '',
    orderNo: p.orderNo ?? '',
    orderDate: p.orderDate,
    orderType: p.orderType ?? '',
    goodsRecNo: p.goodsRecNo ?? '',
    recDate: p.recDate ?? '',
    transporter: p.transporter ?? '',
    narration: p.narration ?? '',
    isInterState: p.isInterState,
    status: p.status,
    lines,
  };
}
