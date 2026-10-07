// Backup Data and the restore half of Import Data (docs/design/TOOLS.md). MDA shows "Not built
// yet" for both.
//
// A backup is one JSON file holding a company, its financial years and every table of each
// year's book, exactly as stored. Restoring it creates the company afresh in the signed-in
// account, every record under a new id (links between them carried over), so it never clashes
// with what's already in the database. As with Import from MDA, a company whose code the account
// already has is left alone.

import { BACKUP_FORMAT, BACKUP_VERSION, backupMessages as bm } from '@qi/core';
import { and, eq, inArray, schema, type Db } from '@qi/db';
import { UserError } from './errors.ts';

const S = schema;

type Row = Record<string, unknown>;

/** The book tables in a backup, in the order they're restored (parents first). */
const BOOK_TABLES = [
  'bookUsers',
  'accountGroups',
  'ledgers',
  'miscList',
  'stockItems',
  'voucherSeries',
  'vouchers',
  'voucherLines',
  'billRefs',
  'voucherItems',
  'stockJournalLines',
  'stockTrn',
  'purchases',
  'purchaseLines',
  'sales',
  'saleLines',
  'auditLog',
] as const;
type BookTable = (typeof BOOK_TABLES)[number];

export type Backup = {
  format: typeof BACKUP_FORMAT;
  version: number;
  createdAt: string;
  company: Row;
  years: { year: Row; tables: Partial<Record<BookTable, Row[]>> }[];
};

export type BackupSummary = {
  companyName: string;
  years: { yearName: string; records: Record<string, number> }[];
};

/** The whole company — every year and every table — as one backup. */
export async function exportBackup(db: Db, accountId: string, companyId: string): Promise<Backup> {
  const [company] = await db
    .select()
    .from(S.companies)
    .where(and(eq(S.companies.accountId, accountId), eq(S.companies.id, companyId)));
  if (!company) throw new UserError('Company not found.');
  const years = await db
    .select()
    .from(S.financialYears)
    .where(eq(S.financialYears.companyId, companyId));
  const out: Backup = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    createdAt: new Date().toISOString(),
    company,
    years: [],
  };

  for (const y of years) {
    const b = y.bookId;
    const vouchers = await db.select().from(S.vouchers).where(eq(S.vouchers.bookId, b));
    const vIds = vouchers.map((v) => v.id);
    const purchases = await db.select().from(S.purchases).where(eq(S.purchases.bookId, b));
    const sales = await db.select().from(S.sales).where(eq(S.sales.bookId, b));
    const ofVouchers = async <T>(q: (ids: string[]) => Promise<T[]>) =>
      vIds.length ? q(vIds) : [];
    const tables: Backup['years'][number]['tables'] = {
      bookUsers: await db.select().from(S.bookUsers).where(eq(S.bookUsers.bookId, b)),
      accountGroups: await db.select().from(S.accountGroups).where(eq(S.accountGroups.bookId, b)),
      ledgers: await db.select().from(S.ledgers).where(eq(S.ledgers.bookId, b)),
      miscList: await db.select().from(S.miscList).where(eq(S.miscList.bookId, b)),
      stockItems: await db.select().from(S.stockItems).where(eq(S.stockItems.bookId, b)),
      voucherSeries: await db.select().from(S.voucherSeries).where(eq(S.voucherSeries.bookId, b)),
      vouchers,
      voucherLines: await ofVouchers((ids) =>
        db.select().from(S.voucherLines).where(inArray(S.voucherLines.voucherId, ids)),
      ),
      billRefs: await ofVouchers((ids) =>
        db.select().from(S.billRefs).where(inArray(S.billRefs.voucherId, ids)),
      ),
      voucherItems: await ofVouchers((ids) =>
        db.select().from(S.voucherItems).where(inArray(S.voucherItems.voucherId, ids)),
      ),
      stockJournalLines: await ofVouchers((ids) =>
        db.select().from(S.stockJournalLines).where(inArray(S.stockJournalLines.voucherId, ids)),
      ),
      stockTrn: await db.select().from(S.stockTrn).where(eq(S.stockTrn.bookId, b)),
      purchases,
      purchaseLines: purchases.length
        ? await db
            .select()
            .from(S.purchaseLines)
            .where(
              inArray(
                S.purchaseLines.purchaseId,
                purchases.map((p) => p.id),
              ),
            )
        : [],
      sales,
      saleLines: sales.length
        ? await db
            .select()
            .from(S.saleLines)
            .where(
              inArray(
                S.saleLines.saleId,
                sales.map((s) => s.id),
              ),
            )
        : [],
      auditLog: await db.select().from(S.auditLog).where(eq(S.auditLog.bookId, b)),
    };
    out.years.push({ year: y, tables });
  }
  return out;
}

/** What a backup holds, for the screen: each year's record counts. */
export function summarizeBackup(b: Backup): BackupSummary {
  return {
    companyName: String(b.company.compName ?? ''),
    years: b.years.map((y) => ({
      yearName: String(y.year.yearName ?? ''),
      records: Object.fromEntries(BOOK_TABLES.map((t) => [t, y.tables[t]?.length ?? 0])),
    })),
  };
}

const TIMESTAMPS = ['createdAt', 'modifiedAt', 'cancelledAt', 'logAt'];
/** A stored row ready to insert again: no id, timestamps back to dates, links remapped. */
function prepare(
  row: Row,
  remap: Record<string, Map<string, string>>,
  bookId?: string,
): Row | null {
  const { id: _drop, ...rest } = row;
  void _drop;
  const out: Row = { ...rest };
  for (const k of TIMESTAMPS) if (typeof out[k] === 'string') out[k] = new Date(out[k] as string);
  for (const [field, map] of Object.entries(remap)) {
    if (out[field] === null || out[field] === undefined) continue;
    const to = map.get(String(out[field]));
    if (!to) return null; // its parent wasn't in the backup
    out[field] = to;
  }
  if (bookId) out.bookId = bookId;
  return out;
}

async function insertAll(db: Db, table: Parameters<Db['insert']>[0], rows: Row[]) {
  for (let i = 0; i < rows.length; i += 400) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await db.insert(table).values(rows.slice(i, i + 400) as any);
  }
}

/** Restores a backup into the account as a new company. */
export async function restoreBackup(
  db: Db,
  accountId: string,
  data: unknown,
): Promise<{ restored: boolean; message: string }> {
  const b = data as Backup;
  if (
    !b ||
    typeof b !== 'object' ||
    b.format !== BACKUP_FORMAT ||
    !b.company ||
    !Array.isArray(b.years)
  )
    throw new UserError(bm.notBackup);
  if (Number(b.version) > BACKUP_VERSION) throw new UserError(bm.newer);
  const name = String(b.company.compName ?? '');
  const [existing] = await db
    .select({ id: S.companies.id })
    .from(S.companies)
    .where(
      and(
        eq(S.companies.accountId, accountId),
        eq(S.companies.compCode, String(b.company.compCode ?? '')),
      ),
    );
  if (existing) return { restored: false, message: bm.exists(name) };

  await db.transaction(async (raw) => {
    const tx = raw as unknown as Db;
    const c = prepare(b.company, {})!;
    const [company] = await tx
      .insert(S.companies)
      .values({ ...(c as typeof S.companies.$inferInsert), accountId })
      .returning({ id: S.companies.id });
    for (const y of b.years) {
      const [book] = await tx
        .insert(S.books)
        .values({ companyId: company!.id, yearCode: String(y.year.yearCode) })
        .returning({ id: S.books.id });
      const bookId = book!.id;
      const t = y.tables;
      const plain = async (name: BookTable, table: Parameters<Db['insert']>[0]) =>
        insertAll(
          tx,
          table,
          (t[name] ?? []).map((r) => prepare(r, {}, bookId)!),
        );
      await plain('bookUsers', S.bookUsers);
      await plain('accountGroups', S.accountGroups);
      await plain('ledgers', S.ledgers);
      await plain('miscList', S.miscList);
      await plain('stockItems', S.stockItems);
      await plain('voucherSeries', S.voucherSeries);

      // Vouchers one by one, to learn each new id; then everything that points at them.
      const vMap = new Map<string, string>();
      for (const v of t.vouchers ?? []) {
        const [nv] = await tx
          .insert(S.vouchers)
          .values(prepare(v, {}, bookId) as typeof S.vouchers.$inferInsert)
          .returning({ id: S.vouchers.id });
        vMap.set(String(v.id), nv!.id);
      }
      const byVoucher = { voucherId: vMap };
      const linked = (
        name: BookTable,
        remap: Record<string, Map<string, string>>,
        withBook = false,
      ) =>
        (t[name] ?? [])
          .map((r) => prepare(r, remap, withBook ? bookId : undefined))
          .filter((r): r is Row => !!r);
      await insertAll(tx, S.voucherLines, linked('voucherLines', byVoucher));
      await insertAll(tx, S.billRefs, linked('billRefs', byVoucher));
      await insertAll(tx, S.voucherItems, linked('voucherItems', byVoucher));
      await insertAll(tx, S.stockJournalLines, linked('stockJournalLines', byVoucher));
      await insertAll(tx, S.stockTrn, linked('stockTrn', byVoucher, true));

      const pMap = new Map<string, string>();
      for (const p of linked('purchases', byVoucher, true)) {
        const oldId = (t.purchases ?? []).find((x) => x.billNo === p.billNo)?.id;
        const [np] = await tx
          .insert(S.purchases)
          .values(p as typeof S.purchases.$inferInsert)
          .returning({ id: S.purchases.id });
        if (oldId) pMap.set(String(oldId), np!.id);
      }
      await insertAll(tx, S.purchaseLines, linked('purchaseLines', { purchaseId: pMap }));
      const sMap = new Map<string, string>();
      for (const s of linked('sales', byVoucher, true)) {
        const oldId = (t.sales ?? []).find((x) => x.billNo === s.billNo)?.id;
        const [ns] = await tx
          .insert(S.sales)
          .values(s as typeof S.sales.$inferInsert)
          .returning({ id: S.sales.id });
        if (oldId) sMap.set(String(oldId), ns!.id);
      }
      await insertAll(tx, S.saleLines, linked('saleLines', { saleId: sMap }));
      await plain('auditLog', S.auditLog);

      const yr = y.year;
      await tx.insert(S.financialYears).values({
        companyId: company!.id,
        bookId,
        yearCode: String(yr.yearCode),
        yearName: String(yr.yearName),
        fromDate: String(yr.fromDate),
        toDate: String(yr.toDate),
      });
    }
  });
  return { restored: true, message: bm.restored(name, b.years.length) };
}
