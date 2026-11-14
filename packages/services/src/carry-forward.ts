// Year-end carry-forward (beyond MDA, added 2026-11-12; docs/LOGIC-SPEC.md §11).
//
// "Create next year from this one": a new year can start as a copy of the year before it.
//   - Masters are copied: groups, ledgers, the misc lists (units, godowns, stock groups and sub
//     groups, sale types, cities), stock items, voucher numbering (numbers restart at 1), users
//     and Role Permissions.
//   - Openings come from the year before as on its last day, by the same rules as its Balance
//     Sheet: Assets and Liabilities ledgers open with their closing balance; Income and Expenses
//     ledgers open at nil, and the year's net profit (or loss) is added to the "Profit & Loss
//     A/c" ledger under Reserves & Surplus (made if missing); stock items open with their
//     closing quantity and value (MDA's stock rate, as the Balance Sheet values closing stock).
//   - Unpaid bills are not carried one by one: each party opens with one total.
//
// Refresh Opening Balances re-runs the openings part for a year already made (entries made late
// in the year before). Only ledgers and items present in both years change.

import {
  LEDGER_CODE_PREFIX,
  LEDGER_CODE_WIDTH,
  isAdminRole,
  nextCode,
  openingStockValue,
  profitAndLoss,
  round2,
  stockRate,
  type ReportGroup,
} from '@qi/core';
import { and, desc, eq, lt, lte, schema, sql, type Db } from '@qi/db';
import { UserError } from './errors.ts';
import { lastPurchaseRates, ledgerBalancesAsOn } from './reports.ts';
import type { Actor } from './tools.ts';

const S = schema;

/** The ledger that holds the profit carried from earlier years. */
export const PL_LEDGER_NAME = 'Profit & Loss A/c';
/** Reserves & Surplus, its group (core groups.ts). */
const PL_GROUP = 'L003';

export const carryMessages = {
  adminOnly: 'Only an Admin can refresh opening balances.',
  noPrevious: 'There is no earlier year to bring opening balances from.',
  refreshed: (from: string) => `Opening balances brought forward from ${from}.`,
};

/** The masters copied into a new year, parents first. */
const MASTER_TABLES = [
  'bookUsers',
  'bookRoles',
  'accountGroups',
  'ledgers',
  'miscList',
  'stockItems',
  'voucherSeries',
] as const;

/** Copies a book's users and roles into a new, just-seeded book (its admin/admin is replaced). */
export async function copyUsers(db: Db, fromBookId: string, toBookId: string): Promise<void> {
  const users = await db.select().from(S.bookUsers).where(eq(S.bookUsers.bookId, fromBookId));
  if (!users.length) return;
  await db.delete(S.bookUsers).where(eq(S.bookUsers.bookId, toBookId));
  await db.delete(S.bookRoles).where(eq(S.bookRoles.bookId, toBookId));
  await db
    .insert(S.bookUsers)
    .values(users.map(({ id: _id, ...u }) => (void _id, { ...u, bookId: toBookId })));
  const roles = await db.select().from(S.bookRoles).where(eq(S.bookRoles.bookId, fromBookId));
  if (roles.length)
    await db
      .insert(S.bookRoles)
      .values(roles.map(({ id: _id, ...r }) => (void _id, { ...r, bookId: toBookId })));
}

/** Copies every master of one book into another (a new, just-seeded one: its seeds are replaced). */
export async function copyMasters(db: Db, fromBookId: string, toBookId: string): Promise<void> {
  for (const name of [...MASTER_TABLES].reverse()) {
    const table = S[name];
    await db.delete(table).where(eq(table.bookId, toBookId));
  }
  for (const name of MASTER_TABLES) {
    const table = S[name];
    const rows = (await db.select().from(table).where(eq(table.bookId, fromBookId))) as Record<
      string,
      unknown
    >[];
    if (!rows.length) continue;
    const copies = rows.map(({ id: _id, createdAt: _c, ...rest }) => {
      void _id;
      void _c;
      const row: Record<string, unknown> = { ...rest, bookId: toBookId };
      if (name === 'voucherSeries') row.lastNo = 0; // numbers restart each year
      return row;
    });
    for (let i = 0; i < copies.length; i += 500) {
      await db.insert(table).values(copies.slice(i, i + 500) as never);
    }
  }
}

/** The year just before `yearId` in its company (the latest one ending before it starts). */
export async function previousYear(db: Db, yearId: string) {
  const [y] = await db.select().from(S.financialYears).where(eq(S.financialYears.id, yearId));
  if (!y) return null;
  const [prev] = await db
    .select()
    .from(S.financialYears)
    .where(
      and(eq(S.financialYears.companyId, y.companyId), lt(S.financialYears.toDate, y.fromDate)),
    )
    .orderBy(desc(S.financialYears.toDate))
    .limit(1);
  return prev ?? null;
}

export type CarryResult = {
  ledgers: number;
  items: number;
  /** Net profit carried to the Profit & Loss A/c (a loss is negative). */
  profit: number;
};

/**
 * Sets the openings of `toBookId` from `fromBookId` as on `asOn` (the earlier year's last day).
 * Ledgers and items are matched by code; anything only in the new year is left alone.
 */
export async function carryOpenings(
  db: Db,
  fromBookId: string,
  toBookId: string,
  asOn: string,
): Promise<CarryResult> {
  // ── Closing figures of the year before, as its Balance Sheet works them out ──
  const balances = await ledgerBalancesAsOn(db, fromBookId, asOn);
  const groupRows = await db
    .select()
    .from(S.accountGroups)
    .where(eq(S.accountGroups.bookId, fromBookId));
  const groups = new Map<string, ReportGroup>(
    groupRows.map((g) => [
      g.grpCode,
      { grpCode: g.grpCode, grpName: g.grpName, grpType: g.grpType, parentGrp: g.parentGrp },
    ]),
  );
  const stock = await closingStock(db, fromBookId, asOn);
  const pl = profitAndLoss(balances, groups, stock.opening, stock.closing);
  const profit = pl.pl.net;

  // ── The new year's ledgers ──
  const toLedgers = await db.select().from(S.ledgers).where(eq(S.ledgers.bookId, toBookId));
  const toGroups = new Map(
    (await db.select().from(S.accountGroups).where(eq(S.accountGroups.bookId, toBookId))).map(
      (g) => [g.grpCode, g.grpType],
    ),
  );
  let plLedger = toLedgers.find(
    (l) => l.accName.trim().toLowerCase() === PL_LEDGER_NAME.toLowerCase(),
  );
  if (!plLedger) {
    const code = nextCode(
      toLedgers.map((l) => l.accCode),
      LEDGER_CODE_PREFIX,
      LEDGER_CODE_WIDTH,
    );
    const grpCode = toGroups.has(PL_GROUP) ? PL_GROUP : [...toGroups.keys()][0]!;
    [plLedger] = await db
      .insert(S.ledgers)
      .values({
        bookId: toBookId,
        accCode: code,
        accName: PL_LEDGER_NAME,
        grpCode,
        opBal: '0',
        drCr: 'Cr',
      })
      .returning();
    toLedgers.push(plLedger!);
  }

  const closing = new Map(balances.map((b) => [b.accCode, b.balance]));
  let ledgerCount = 0;
  for (const l of toLedgers) {
    if (!closing.has(l.accCode) && l.accCode !== plLedger!.accCode) continue;
    const type = toGroups.get(l.grpCode) ?? '';
    // Dr positive, Cr negative.
    let bal = type === 'Assets' || type === 'Liabilities' ? (closing.get(l.accCode) ?? 0) : 0;
    if (l.accCode === plLedger!.accCode) bal = round2(bal - profit); // profit is a credit
    await db
      .update(S.ledgers)
      .set({ opBal: String(Math.abs(round2(bal))), drCr: bal < 0 ? 'Cr' : 'Dr' })
      .where(eq(S.ledgers.id, l.id));
    ledgerCount++;
  }

  // ── The new year's stock ──
  const toItems = await db.select().from(S.stockItems).where(eq(S.stockItems.bookId, toBookId));
  let itemCount = 0;
  for (const it of toItems) {
    const c = stock.items.get(it.partCode);
    if (!c) continue;
    await db
      .update(S.stockItems)
      .set({
        opQty: String(round3(c.qty)),
        opValue: String(c.qty > 0 ? round2(c.qty * c.rate) : 0),
      })
      .where(eq(S.stockItems.id, it.id));
    itemCount++;
  }
  return { ledgers: ledgerCount, items: itemCount, profit };
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** Each item's closing quantity and rate as on a date, and the stock totals, by the Balance
 *  Sheet's rule (reports.ts stockValues). */
async function closingStock(db: Db, bookId: string, to: string) {
  // Every item carries its closing figures (an inactive one may be used again); only active
  // items count in the totals, as in the Balance Sheet.
  const items = await db.select().from(S.stockItems).where(eq(S.stockItems.bookId, bookId));
  const moved = await db
    .select({
      code: S.stockTrn.partCode,
      qty: sql<string>`coalesce(sum(${S.stockTrn.inQty} - ${S.stockTrn.outQty}), 0)`,
    })
    .from(S.stockTrn)
    .where(and(eq(S.stockTrn.bookId, bookId), lte(S.stockTrn.trnDate, to)))
    .groupBy(S.stockTrn.partCode);
  const byCode = new Map(moved.map((m) => [m.code, Number(m.qty)]));
  const last = await lastPurchaseRates(db, bookId, to);
  const out = new Map<string, { qty: number; rate: number }>();
  let opening = 0;
  let closing = 0;
  for (const i of items) {
    const rate = stockRate(Number(i.purRate), Number(i.saleRate), last.get(i.partCode));
    const qty = Number(i.opQty) + (byCode.get(i.partCode) ?? 0);
    if (i.isActive) {
      opening += openingStockValue(Number(i.opQty), Number(i.opValue), rate);
      closing += qty * rate;
    }
    out.set(i.partCode, { qty, rate });
  }
  return { items: out, opening: round2(opening), closing: round2(closing) };
}

/** Refresh Opening Balances (Admin): bring this year's openings forward again from the year
 *  before it. Written to the log. */
export async function refreshOpenings(
  db: Db,
  a: Actor & { yearId: string },
): Promise<CarryResult & { fromYear: string }> {
  if (!isAdminRole(a.role)) throw new UserError(carryMessages.adminOnly);
  const prev = await previousYear(db, a.yearId);
  if (!prev) throw new UserError(carryMessages.noPrevious);
  const result = await db.transaction((tx) =>
    carryOpenings(tx as unknown as Db, prev.bookId, a.bookId, prev.toDate),
  );
  await db.insert(S.auditLog).values({
    bookId: a.bookId,
    userName: a.userName,
    action: 'UPDATE',
    tableName: 'Opening Balances',
    recordKey: prev.yearName,
    details: `Brought forward: ${result.ledgers} ledgers, ${result.items} items`,
  });
  return { ...result, fromYear: prev.yearName };
}

/** Is there a year before this one to bring openings from? */
export async function hasPreviousYear(db: Db, yearId: string) {
  return !!(await previousYear(db, yearId));
}
