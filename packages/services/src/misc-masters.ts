// Unit Master, Godown and Sales Executive. Port of MDA-Inventory lib/unit_master_page.dart and
// lib/godown_master_page.dart, which work identically: Misc_Master rows (our misc_list) of type
// 'Unit', 'Godown' or (added 2026-11-14) 'SalesExec'.
// MDA's gaps, fixed 2026-11-14 (user's request: every option must work):
//   - The duplicate check ignores case and also runs on Update (was Q-15, Q-37).
//   - Update keeps a unit's long name ("Numbers" no longer becomes "Nos") (was Q-38).
//   - Remove is refused while a stock item, bill, stock entry or ledger uses it (was Q-39).

import {
  DEFAULT_UNITS,
  MISC_MASTERS,
  MISC_MASTER_WITH_MOBILE,
  miscMasterFieldErrors,
  miscMasterMessages,
  nextCode,
  type MiscMasterKind,
} from '@qi/core';
import { and, asc, eq, ne, or, schema, sql, type Db } from '@qi/db';
import { UserError, assertNoFieldErrors } from './errors.ts';

const { miscList } = schema;

export type MiscMasterRow = { code: string; name: string; mobile: string | null };
export type MiscMasterInput = { name: string; mobile?: string };

/** Another row of the kind with this name, whatever its case. */
async function nameTaken(
  db: Db,
  bookId: string,
  kind: MiscMasterKind,
  name: string,
  exceptCode?: string,
) {
  const [clash] = await db
    .select({ code: miscList.miscCode })
    .from(miscList)
    .where(
      and(
        ofKind(bookId, kind),
        sql`lower(${miscList.miscName}) = ${name.toLowerCase()}`,
        exceptCode ? ne(miscList.miscCode, exceptCode) : undefined,
      ),
    );
  return !!clash;
}

const mobileOf = (kind: MiscMasterKind, input: MiscMasterInput) =>
  MISC_MASTER_WITH_MOBILE.includes(kind) ? input.mobile?.trim() || null : null;

const ofKind = (bookId: string, kind: MiscMasterKind) =>
  and(eq(miscList.bookId, bookId), eq(miscList.miscType, MISC_MASTERS[kind].type));

/** Every row of the kind by name, for View and Print (unit_master_page.dart:168-172). */
export const listMiscMaster = (
  db: Db,
  bookId: string,
  kind: MiscMasterKind,
): Promise<MiscMasterRow[]> =>
  db
    .select({ code: miscList.miscCode, name: miscList.miscName, mobile: miscList.miscGen1 })
    .from(miscList)
    .where(ofKind(bookId, kind))
    .orderBy(asc(miscList.miscName));

export async function createMiscMaster(
  db: Db,
  bookId: string,
  kind: MiscMasterKind,
  input: MiscMasterInput,
): Promise<MiscMasterRow> {
  assertNoFieldErrors(miscMasterFieldErrors(kind, input));
  const name = input.name.trim();
  const { type, prefix, width } = MISC_MASTERS[kind];

  if (await nameTaken(db, bookId, kind, name)) {
    const message = miscMasterMessages(kind).duplicateOnSave;
    throw new UserError(message, { name: message });
  }

  const codes = await db
    .select({ code: miscList.miscCode })
    .from(miscList)
    .where(ofKind(bookId, kind));
  const code = nextCode(
    codes.map((r) => r.code),
    prefix,
    width,
  );
  const mobile = mobileOf(kind, input);
  await db.insert(miscList).values({
    bookId,
    miscCode: code,
    miscName: name,
    miscPname: name,
    miscGen1: mobile,
    miscType: type,
  });
  return { code, name, mobile };
}

export async function updateMiscMaster(
  db: Db,
  bookId: string,
  kind: MiscMasterKind,
  code: string,
  input: MiscMasterInput,
): Promise<MiscMasterRow> {
  assertNoFieldErrors(miscMasterFieldErrors(kind, input));
  const name = input.name.trim();
  if (await nameTaken(db, bookId, kind, name, code)) {
    const message = miscMasterMessages(kind).duplicateOnSave;
    throw new UserError(message, { name: message });
  }
  const mobile = mobileOf(kind, input);
  const [row] = await db
    .update(miscList)
    .set({ miscName: name, miscGen1: mobile })
    .where(and(ofKind(bookId, kind), eq(miscList.miscCode, code)))
    .returning({ code: miscList.miscCode });
  if (!row) throw new UserError(miscMasterMessages(kind).noneFound);
  return { code, name, mobile };
}

/** How many records use the row (by its code or its name, as screens store either). Every bill,
 *  return and stock journal line moves stock, so a godown in use always has stock entries. */
async function usesOf(db: Db, bookId: string, kind: MiscMasterKind, code: string, name: string) {
  const { stockItems, stockTrn, ledgers } = schema;
  const total = async (rows: Promise<{ n: number }[]>) => Number((await rows)[0]?.n ?? 0);
  const n = sql<number>`count(*)::int`;
  const is = (
    col:
      | typeof stockItems.unit
      | typeof stockItems.altUnit
      | typeof stockTrn.godownCode
      | typeof ledgers.salesExec,
  ) => or(eq(col, code), eq(col, name));
  if (kind === 'unit')
    return total(
      db
        .select({ n })
        .from(stockItems)
        .where(and(eq(stockItems.bookId, bookId), or(is(stockItems.unit), is(stockItems.altUnit)))),
    );
  if (kind === 'godown')
    return total(
      db
        .select({ n })
        .from(stockTrn)
        .where(and(eq(stockTrn.bookId, bookId), is(stockTrn.godownCode))),
    );
  return total(
    db
      .select({ n })
      .from(ledgers)
      .where(and(eq(ledgers.bookId, bookId), is(ledgers.salesExec))),
  );
}

export async function removeMiscMaster(
  db: Db,
  bookId: string,
  kind: MiscMasterKind,
  code: string,
): Promise<void> {
  const [row] = await db
    .select({ name: miscList.miscName })
    .from(miscList)
    .where(and(ofKind(bookId, kind), eq(miscList.miscCode, code)));
  if (!row) return;
  const used = await usesOf(db, bookId, kind, code, row.name);
  if (used > 0) throw new UserError(miscMasterMessages(kind).inUse(row.name, used));
  await db.delete(miscList).where(and(ofKind(bookId, kind), eq(miscList.miscCode, code)));
}

/** The 18 units a new book starts with (db_service.dart:903-932). */
export async function seedDefaultUnits(db: Db, bookId: string): Promise<void> {
  await db.insert(miscList).values(
    DEFAULT_UNITS.map(([miscCode, miscName, miscPname]) => ({
      bookId,
      miscCode,
      miscName,
      miscPname,
      miscType: MISC_MASTERS.unit.type,
    })),
  );
}
