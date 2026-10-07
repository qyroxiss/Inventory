// Vouchers: the single write path for every voucher, as MDA's PostingService
// (posting_service.dart) and its numbering (code_gen.dart:66-106). docs/LOGIC-SPEC.md §4.2, §6.
//
// As in MDA:
//   - Every save goes through the posting gate (postingProblem) and writes the header, its
//     ledger lines, its bill references, the series counter and an audit entry in one
//     transaction — all or nothing.
//   - The number shown on screen is passed in; if another voucher already took it, the save is
//     refused with "… Save again to take the next free number." (the screen keeps showing the
//     same number, so it takes Clear to move on — Q-44).
//   - Update replaces the lines in place, keeping number and identity. It writes no bill
//     reference, so a receipt's, payment's or note's reference is dropped on update (Q-43).
//   - Cancel never deletes: Status 'Cancelled', stamped, lines and references kept. Balances
//     and reports count Active vouchers only.

import {
  ACTIVE,
  CANCELLED,
  SYSTEM_LEDGERS,
  VOUCHER_SERIES,
  postingMessages,
  postingProblem,
  round2,
  sum,
  systemLedgerDrCr,
  type PostingLine,
} from '@qi/core';
import { alias, and, asc, desc, eq, inArray, schema, sql, type Db } from '@qi/db';
import { UserError } from './errors.ts';

const {
  accountGroups,
  auditLog,
  billRefs,
  companies,
  books,
  ledgers,
  voucherLines,
  voucherSeries,
  vouchers,
} = schema;

/** Who is posting and the open year, from the book session. */
export type PostingContext = {
  bookId: string;
  userName: string;
  fyFrom: string | null;
  fyTo: string | null;
  financialYearLabel: string;
};

export type VoucherInput = {
  vchrType: string;
  /** The number shown on screen; empty to take the next one. */
  vchrNo?: string;
  /** yyyy-MM-dd */
  date: string;
  partyCode?: string | null;
  refNo?: string;
  narration?: string;
  lines: PostingLine[];
  bills?: { accCode: string; billNo: string; refType: string; amount: number }[];
};

const money = (v: number) => round2(v).toFixed(2);

// ── Seeds every book carries (db_service.dart:827-850, 988-1019) ──────────────────

/**
 * The voucher series and system ledgers a book needs. New books get them when created; books
 * made before vouchers existed get them on their next login, as MDA adds them when an older
 * year file is opened. Ledgers are only added under groups the book has, and never over an
 * existing code or name.
 */
export async function ensureBookSeeds(db: Db, bookId: string): Promise<void> {
  await db
    .insert(voucherSeries)
    .values(
      VOUCHER_SERIES.map(([vchrType, vchrName, prefix, width]) => ({
        bookId,
        vchrType,
        vchrName,
        prefix,
        width,
        lastNo: 0,
      })),
    )
    .onConflictDoNothing();

  const groups = new Set(
    (
      await db
        .select({ code: accountGroups.grpCode })
        .from(accountGroups)
        .where(eq(accountGroups.bookId, bookId))
    ).map((g) => g.code),
  );
  const wanted = SYSTEM_LEDGERS.filter(([, , group]) => groups.has(group));
  if (wanted.length) {
    await db
      .insert(ledgers)
      .values(
        wanted.map(([accCode, accName, grpCode]) => ({
          bookId,
          accCode,
          accName,
          grpCode,
          opBal: '0',
          drCr: systemLedgerDrCr(grpCode),
          isActive: true,
        })),
      )
      .onConflictDoNothing();
  }
}

// ── Numbering (code_gen.dart:66-106) ─────────────────────────────────────────────

/** Next number for a type: max(series LastNo, highest number used) + 1, in the series' format. */
export async function nextVoucherNo(db: Db, bookId: string, vchrType: string): Promise<string> {
  const [series] = await db
    .select()
    .from(voucherSeries)
    .where(and(eq(voucherSeries.bookId, bookId), eq(voucherSeries.vchrType, vchrType)));
  const prefix = series?.prefix ?? vchrType;
  const width = series?.width ?? 3;
  const lastNo = series?.lastNo ?? 0;

  const used = await db
    .select({ no: vouchers.vchrNo })
    .from(vouchers)
    .where(and(eq(vouchers.bookId, bookId), eq(vouchers.vchrType, vchrType)));
  let scanned = 0;
  for (const { no } of used) {
    if (!no.startsWith(prefix) || no.length <= prefix.length) continue;
    const n = parseInt(no.slice(prefix.length).replace(/\D/g, ''), 10) || 0;
    if (n > scanned) scanned = n;
  }
  return prefix + String(Math.max(lastNo, scanned) + 1).padStart(width, '0');
}

/** Records the number as used; runs in the voucher's own transaction. */
async function commitVoucherNo(db: Db, bookId: string, vchrType: string, vchrNo: string) {
  const used = parseInt(vchrNo.replace(/\D/g, ''), 10) || 0;
  await db
    .update(voucherSeries)
    .set({ lastNo: used })
    .where(
      and(
        eq(voucherSeries.bookId, bookId),
        eq(voucherSeries.vchrType, vchrType),
        sql`${voucherSeries.lastNo} < ${used}`,
      ),
    );
}

async function log(db: Db, ctx: PostingContext, action: string, key: string, details: string) {
  await db.insert(auditLog).values({
    bookId: ctx.bookId,
    userName: ctx.userName,
    action,
    tableName: 'VchrHdr',
    recordKey: key,
    details,
  });
}

function gate(ctx: PostingContext, vchrType: string, input: VoucherInput) {
  const problem = postingProblem({
    vchrType,
    date: input.date,
    fyFrom: ctx.fyFrom,
    fyTo: ctx.fyTo,
    fyLabel: ctx.financialYearLabel,
    lines: input.lines,
  });
  if (problem) throw new UserError(problem);
}

async function writeLines(db: Db, voucherId: string, input: VoucherInput, withBills: boolean) {
  await db.insert(voucherLines).values(
    input.lines.map((l, i) => ({
      voucherId,
      lineNo: i + 1,
      accCode: l.accCode,
      drAmount: money(l.dr),
      crAmount: money(l.cr),
      narration: l.narration ?? null,
    })),
  );
  if (withBills && input.bills?.length) {
    await db.insert(billRefs).values(
      input.bills.map((b) => ({
        voucherId,
        accCode: b.accCode,
        billNo: b.billNo,
        refType: b.refType,
        billDate: input.date,
        amount: money(b.amount),
      })),
    );
  }
}

// ── Save, update, cancel (posting_service.dart:153-432) ──────────────────────────

export async function saveVoucher(
  db: Db,
  ctx: PostingContext,
  input: VoucherInput,
): Promise<{ id: string; vchrNo: string }> {
  gate(ctx, input.vchrType, input);
  const net = sum(input.lines.map((l) => l.dr));

  return db.transaction(async (raw) => {
    const tx = raw as unknown as Db;
    const number = input.vchrNo?.trim()
      ? input.vchrNo.trim()
      : await nextVoucherNo(tx, ctx.bookId, input.vchrType);

    const [clash] = await tx
      .select({ id: vouchers.id })
      .from(vouchers)
      .where(
        and(
          eq(vouchers.bookId, ctx.bookId),
          eq(vouchers.vchrType, input.vchrType),
          eq(vouchers.vchrNo, number),
        ),
      );
    if (clash) throw new UserError(postingMessages.numberUsed(number));

    const [v] = await tx
      .insert(vouchers)
      .values({
        bookId: ctx.bookId,
        vchrNo: number,
        vchrType: input.vchrType,
        vchrDate: input.date,
        partyCode: input.partyCode ?? null,
        refNo: input.refNo ?? '',
        narration: input.narration ?? '',
        netAmount: money(net),
        status: ACTIVE,
        createdBy: ctx.userName,
      })
      .returning({ id: vouchers.id });
    await writeLines(tx, v!.id, input, true);
    await commitVoucherNo(tx, ctx.bookId, input.vchrType, number);
    await log(tx, ctx, 'CREATE', `${input.vchrType}/${number}`, `Net ${net.toFixed(2)}`);
    return { id: v!.id, vchrNo: number };
  });
}

async function findVoucher(db: Db, bookId: string, id: string) {
  const [v] = await db
    .select()
    .from(vouchers)
    .where(and(eq(vouchers.bookId, bookId), eq(vouchers.id, id)));
  return v ?? null;
}

/** Replaces a voucher's lines in place, keeping its number, type and identity. */
export async function updateVoucher(
  db: Db,
  ctx: PostingContext,
  id: string,
  input: Omit<VoucherInput, 'vchrType' | 'vchrNo' | 'bills'>,
): Promise<{ id: string; vchrNo: string }> {
  const hdr = await findVoucher(db, ctx.bookId, id);
  if (!hdr) throw new UserError(postingMessages.notFound);
  if (hdr.status === CANCELLED) throw new UserError(postingMessages.cancelledEdit);
  gate(ctx, hdr.vchrType, { ...input, vchrType: hdr.vchrType });
  const net = sum(input.lines.map((l) => l.dr));

  await db.transaction(async (raw) => {
    const tx = raw as unknown as Db;
    await tx.delete(voucherLines).where(eq(voucherLines.voucherId, id));
    await tx.delete(billRefs).where(eq(billRefs.voucherId, id));
    await tx
      .update(vouchers)
      .set({
        vchrDate: input.date,
        partyCode: input.partyCode ?? null,
        refNo: input.refNo ?? '',
        narration: input.narration ?? '',
        netAmount: money(net),
        modifiedBy: ctx.userName,
        modifiedAt: new Date(),
      })
      .where(eq(vouchers.id, id));
    // No bill references on update, as in MDA (Q-43).
    await writeLines(tx, id, { ...input, vchrType: hdr.vchrType }, false);
    await log(tx, ctx, 'UPDATE', `${hdr.vchrType}/${hdr.vchrNo}`, `Net ${net.toFixed(2)}`);
  });
  return { id, vchrNo: hdr.vchrNo };
}

/** Marks the voucher Cancelled; it stays in the books for audit. Cancelling twice does nothing. */
export async function cancelVoucher(db: Db, ctx: PostingContext, id: string): Promise<void> {
  const hdr = await findVoucher(db, ctx.bookId, id);
  if (!hdr) throw new UserError(postingMessages.notFound);
  if (hdr.status === CANCELLED) return;
  await db.transaction(async (raw) => {
    const tx = raw as unknown as Db;
    await tx
      .update(vouchers)
      .set({ status: CANCELLED, cancelledBy: ctx.userName, cancelledAt: new Date() })
      .where(eq(vouchers.id, id));
    await log(tx, ctx, 'CANCEL', `${hdr.vchrType}/${hdr.vchrNo}`, 'Cancelled by user');
  });
}

// ── Reading (posting_service.dart:500-555) ───────────────────────────────────────

export type VoucherRow = {
  id: string;
  vchrNo: string;
  vchrType: string;
  vchrDate: string;
  partyCode: string | null;
  partyName: string | null;
  refNo: string;
  narration: string;
  netAmount: number;
  status: string;
  /** The first debit and first credit line's ledger names (two-line vouchers list by these). */
  drName: string | null;
  crName: string | null;
};

/** Vouchers of the given types, newest first; cancelled ones too when asked. */
export async function listVouchers(
  db: Db,
  bookId: string,
  types: string[],
  includeCancelled = false,
): Promise<VoucherRow[]> {
  if (!types.length) return [];
  const party = alias(ledgers, 'party');
  const where = [eq(vouchers.bookId, bookId), inArray(vouchers.vchrType, types)];
  if (!includeCancelled) where.push(eq(vouchers.status, ACTIVE));
  const firstName = (side: 'dr' | 'cr') =>
    sql<
      string | null
    >`(select l.acc_name from ${voucherLines} vl join ${ledgers} l on l.book_id = ${vouchers.bookId} and l.acc_code = vl.acc_code where vl.voucher_id = ${vouchers.id} and vl.${sql.raw(side === 'dr' ? 'dr_amount' : 'cr_amount')} > 0 order by vl.line_no limit 1)`;
  const rows = await db
    .select({
      id: vouchers.id,
      vchrNo: vouchers.vchrNo,
      vchrType: vouchers.vchrType,
      vchrDate: vouchers.vchrDate,
      partyCode: vouchers.partyCode,
      partyName: party.accName,
      refNo: vouchers.refNo,
      narration: vouchers.narration,
      netAmount: vouchers.netAmount,
      status: vouchers.status,
      drName: firstName('dr'),
      crName: firstName('cr'),
    })
    .from(vouchers)
    .leftJoin(party, and(eq(party.bookId, vouchers.bookId), eq(party.accCode, vouchers.partyCode)))
    .where(and(...where))
    .orderBy(desc(vouchers.vchrDate), desc(vouchers.id));
  return rows.map((r) => ({
    ...r,
    refNo: r.refNo ?? '',
    narration: r.narration ?? '',
    netAmount: Number(r.netAmount),
  }));
}

export type VoucherLineRow = {
  lineNo: number;
  accCode: string;
  accName: string | null;
  dr: number;
  cr: number;
  narration: string | null;
};

/** A voucher's ledger lines in entry order, with ledger names. */
export async function voucherLinesOf(
  db: Db,
  bookId: string,
  id: string,
): Promise<VoucherLineRow[]> {
  if (!(await findVoucher(db, bookId, id))) return [];
  const rows = await db
    .select({
      lineNo: voucherLines.lineNo,
      accCode: voucherLines.accCode,
      accName: ledgers.accName,
      dr: voucherLines.drAmount,
      cr: voucherLines.crAmount,
      narration: voucherLines.narration,
    })
    .from(voucherLines)
    .leftJoin(ledgers, and(eq(ledgers.bookId, bookId), eq(ledgers.accCode, voucherLines.accCode)))
    .where(eq(voucherLines.voucherId, id))
    .orderBy(asc(voucherLines.lineNo));
  return rows.map((r) => ({ ...r, dr: Number(r.dr), cr: Number(r.cr) }));
}

/** How many voucher lines use a ledger, cancelled vouchers included (ledger_creation_page.dart:323). */
export async function ledgerVoucherLineCount(
  db: Db,
  bookId: string,
  accCode: string,
): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(voucherLines)
    .innerJoin(vouchers, eq(vouchers.id, voucherLines.voucherId))
    .where(and(eq(vouchers.bookId, bookId), eq(voucherLines.accCode, accCode)));
  return row?.n ?? 0;
}

// ── Print (voucher_print.dart:27-180) ────────────────────────────────────────────

export type VoucherPrint = {
  vchrNo: string;
  vchrType: string;
  vchrDate: string;
  status: string;
  amount: number;
  refNo: string;
  narration: string;
  /** Bank receipts print the debited bank account. */
  drName: string | null;
  party: typeof ledgers.$inferSelect | null;
  company: typeof companies.$inferSelect | null;
};

/** One receipt or payment by number, with its party and the company, for printing. */
export async function voucherForPrint(
  db: Db,
  bookId: string,
  vchrNo: string,
  types: string[],
  partySide: 'dr' | 'cr',
): Promise<VoucherPrint | null> {
  const [v] = await db
    .select()
    .from(vouchers)
    .where(
      and(
        eq(vouchers.bookId, bookId),
        eq(vouchers.vchrNo, vchrNo),
        inArray(vouchers.vchrType, types),
      ),
    )
    .limit(1);
  if (!v) return null;
  const lines = await voucherLinesOf(db, bookId, v.id);
  const dr = lines.find((l) => l.dr > 0);
  const cr = lines.find((l) => l.cr > 0);
  const partyCode = (partySide === 'dr' ? dr : cr)?.accCode;
  const [party] = partyCode
    ? await db
        .select()
        .from(ledgers)
        .where(and(eq(ledgers.bookId, bookId), eq(ledgers.accCode, partyCode)))
    : [];
  const [company] = await db
    .select({ company: companies })
    .from(books)
    .innerJoin(companies, eq(companies.id, books.companyId))
    .where(eq(books.id, bookId));
  return {
    vchrNo: v.vchrNo,
    vchrType: v.vchrType,
    vchrDate: v.vchrDate,
    status: v.status,
    amount: Number(v.netAmount),
    refNo: v.refNo ?? '',
    narration: v.narration ?? '',
    drName: dr?.accName ?? null,
    party: party ?? null,
    company: company?.company ?? null,
  };
}
