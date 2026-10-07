// Stock Journal (MDA shows "Not built yet"; design in docs/design/TRANSACTIONS.md). An STJ
// voucher — no ledger lines — with its Consumption (out) and Production (in) lines, and one
// stock movement per line into or out of its godown. Saved, updated and cancelled the way MDA's
// other documents are: one transaction, an audit entry, the source checked against stock in
// hand (the sale's rule and wording), cancel marks it Cancelled and removes its stock movement.

import {
  ACTIVE,
  CANCELLED,
  stjLine,
  stjTotals,
  stockJournalMessages as jm,
  stockJournalProblem,
  type StjLine,
  type StjSide,
} from '@qi/core';
import { and, asc, desc, eq, schema, sql, type Db } from '@qi/db';
import { UserError } from './errors.ts';
import { assertStockAvailable } from './stock.ts';
import { commitVoucherNo, nextVoucherNo, type PostingContext } from './vouchers.ts';

const { auditLog, stockJournalLines, stockTrn, vouchers } = schema;

const TYPE = 'STJ';
const money = (v: number) => v.toFixed(2);
const qty3 = (v: number) => String(Math.round(v * 1000) / 1000);

export type StockJournalInput = {
  /** The number shown on screen; empty to take the next. Ignored on update. */
  vchrNo?: string;
  /** yyyy-MM-dd */
  date: string;
  narration?: string;
  lines: Omit<StjLine, 'amount'>[];
};

function build(ctx: PostingContext, input: StockJournalInput): StjLine[] {
  const lines = input.lines.map((l) =>
    stjLine({ ...l, unit: l.unit ?? null, godown: l.godown?.trim() || null }),
  );
  const problem = stockJournalProblem(
    { date: input.date, fyFrom: ctx.fyFrom, fyTo: ctx.fyTo, fyLabel: ctx.financialYearLabel },
    lines,
  );
  if (problem) throw new UserError(problem);
  return lines;
}

async function writeBody(
  db: Db,
  ctx: PostingContext,
  voucherId: string,
  vchrNo: string,
  date: string,
  lines: StjLine[],
) {
  await db.insert(stockJournalLines).values(
    lines.map((l, i) => ({
      voucherId,
      lineNo: i + 1,
      side: l.side,
      itemCode: l.itemCode,
      itemName: l.itemName,
      unit: l.unit,
      godown: l.godown,
      qty: qty3(l.qty),
      rate: money(l.rate),
      amount: money(l.amount),
    })),
  );
  await db.insert(stockTrn).values(
    lines.map((l) => ({
      bookId: ctx.bookId,
      voucherId,
      vchrType: TYPE,
      vchrNo,
      trnDate: date,
      partCode: l.itemCode,
      godownCode: l.godown,
      inQty: l.side === 'in' ? qty3(l.qty) : '0',
      outQty: l.side === 'out' ? qty3(l.qty) : '0',
      rate: money(l.rate),
      value: money(l.amount),
    })),
  );
}

const sourceOf = (lines: StjLine[]) => lines.filter((l) => l.side === 'out');

async function log(db: Db, ctx: PostingContext, action: string, no: string, details: string) {
  await db.insert(auditLog).values({
    bookId: ctx.bookId,
    userName: ctx.userName,
    action,
    tableName: 'VchrHdr',
    recordKey: `${TYPE}/${no}`,
    details,
  });
}

export const nextStockJournalNo = (db: Db, bookId: string) => nextVoucherNo(db, bookId, TYPE);

export async function saveStockJournal(
  db: Db,
  ctx: PostingContext,
  input: StockJournalInput,
): Promise<{ vchrNo: string }> {
  const lines = build(ctx, input);
  const t = stjTotals(lines);
  return db.transaction(async (raw) => {
    const tx = raw as unknown as Db;
    const no = input.vchrNo?.trim() || (await nextVoucherNo(tx, ctx.bookId, TYPE));
    const [clash] = await tx
      .select({ id: vouchers.id })
      .from(vouchers)
      .where(
        and(eq(vouchers.bookId, ctx.bookId), eq(vouchers.vchrType, TYPE), eq(vouchers.vchrNo, no)),
      );
    if (clash)
      throw new UserError(
        `Voucher number "${no}" is already used. Save again to take the next free number.`,
      );
    await assertStockAvailable(tx, ctx.bookId, sourceOf(lines));
    const [v] = await tx
      .insert(vouchers)
      .values({
        bookId: ctx.bookId,
        vchrNo: no,
        vchrType: TYPE,
        vchrDate: input.date,
        narration: input.narration?.trim() ?? '',
        netAmount: money(t.inValue),
        status: ACTIVE,
        createdBy: ctx.userName,
      })
      .returning({ id: vouchers.id });
    await commitVoucherNo(tx, ctx.bookId, TYPE, no);
    await writeBody(tx, ctx, v!.id, no, input.date, lines);
    await log(tx, ctx, 'CREATE', no, `${lines.length} line(s)`);
    return { vchrNo: no };
  });
}

async function find(db: Db, bookId: string, id: string) {
  const [v] = await db
    .select()
    .from(vouchers)
    .where(and(eq(vouchers.bookId, bookId), eq(vouchers.id, id), eq(vouchers.vchrType, TYPE)));
  return v ?? null;
}

/** Replaces the lines in place, keeping the number. */
export async function updateStockJournal(
  db: Db,
  ctx: PostingContext,
  id: string,
  input: StockJournalInput,
): Promise<{ vchrNo: string }> {
  const lines = build(ctx, input);
  const hdr = await find(db, ctx.bookId, id);
  if (!hdr) throw new UserError(jm.notFound);
  if (hdr.status === CANCELLED) throw new UserError(jm.cancelledEdit);
  const t = stjTotals(lines);
  await db.transaction(async (raw) => {
    const tx = raw as unknown as Db;
    await tx.delete(stockJournalLines).where(eq(stockJournalLines.voucherId, id));
    await tx.delete(stockTrn).where(eq(stockTrn.voucherId, id));
    await assertStockAvailable(tx, ctx.bookId, sourceOf(lines));
    await tx
      .update(vouchers)
      .set({
        vchrDate: input.date,
        narration: input.narration?.trim() ?? '',
        netAmount: money(t.inValue),
        modifiedBy: ctx.userName,
        modifiedAt: new Date(),
      })
      .where(eq(vouchers.id, id));
    await writeBody(tx, ctx, id, hdr.vchrNo, input.date, lines);
    await log(tx, ctx, 'UPDATE', hdr.vchrNo, `${lines.length} line(s)`);
  });
  return { vchrNo: hdr.vchrNo };
}

export async function cancelStockJournal(db: Db, ctx: PostingContext, id: string): Promise<void> {
  const hdr = await find(db, ctx.bookId, id);
  if (!hdr) throw new UserError(jm.notFound);
  if (hdr.status === CANCELLED) return;
  await db.transaction(async (raw) => {
    const tx = raw as unknown as Db;
    await tx
      .update(vouchers)
      .set({ status: CANCELLED, cancelledBy: ctx.userName, cancelledAt: new Date() })
      .where(eq(vouchers.id, id));
    await tx.delete(stockTrn).where(eq(stockTrn.voucherId, id));
    await log(tx, ctx, 'CANCEL', hdr.vchrNo, 'Cancelled by user');
  });
}

export type StockJournalRow = {
  id: string;
  vchrNo: string;
  vchrDate: string;
  narration: string;
  lineCount: number;
  value: number;
  status: string;
};

export async function listStockJournals(db: Db, bookId: string): Promise<StockJournalRow[]> {
  const rows = await db
    .select({
      id: vouchers.id,
      vchrNo: vouchers.vchrNo,
      vchrDate: vouchers.vchrDate,
      narration: vouchers.narration,
      lineCount: sql<number>`(select count(*)::int from ${stockJournalLines} l where l.voucher_id = "vouchers"."id")`,
      value: vouchers.netAmount,
      status: vouchers.status,
    })
    .from(vouchers)
    .where(and(eq(vouchers.bookId, bookId), eq(vouchers.vchrType, TYPE)))
    .orderBy(desc(vouchers.vchrDate), desc(vouchers.id));
  return rows.map((r) => ({
    ...r,
    narration: r.narration ?? '',
    lineCount: Number(r.lineCount),
    value: Number(r.value),
  }));
}

export async function stockJournalLinesOf(db: Db, bookId: string, id: string): Promise<StjLine[]> {
  if (!(await find(db, bookId, id))) return [];
  const rows = await db
    .select()
    .from(stockJournalLines)
    .where(eq(stockJournalLines.voucherId, id))
    .orderBy(asc(stockJournalLines.lineNo));
  return rows.map((r) => ({
    side: r.side as StjSide,
    itemCode: r.itemCode,
    itemName: r.itemName ?? '',
    unit: r.unit,
    godown: r.godown,
    qty: Number(r.qty),
    rate: Number(r.rate),
    amount: Number(r.amount),
  }));
}
