// Unit Master and Godown. Port of MDA-Inventory lib/unit_master_page.dart and
// lib/godown_master_page.dart, which work identically: Misc_Master rows (our misc_list) of type
// 'Unit' or 'Godown'. Kept exactly as MDA does it, quirks included:
//   - Save rejects a name only on an exact, case-sensitive match.
//   - Update has no duplicate check (Misc_Master has no unique name), so two can share a name;
//     MDA's "This Name Already Exists" can never appear (docs/LOGIC-SPEC.md Q-37).
//   - Save and Update both write the name into Misc_Pname too, so updating a seeded unit
//     replaces its long name ("Numbers" becomes "Nos") (Q-38).
//   - Remove doesn't check whether a stock item or a purchase uses it (Q-39).

import {
  DEFAULT_UNITS,
  MISC_MASTERS,
  miscMasterFieldErrors,
  miscMasterMessages,
  nextCode,
  type MiscMasterKind,
} from '@qi/core';
import { and, asc, eq, schema, type Db } from '@qi/db';
import { UserError, assertNoFieldErrors } from './errors.ts';

const { miscList } = schema;

export type MiscMasterRow = { code: string; name: string };
export type MiscMasterInput = { name: string };

const ofKind = (bookId: string, kind: MiscMasterKind) =>
  and(eq(miscList.bookId, bookId), eq(miscList.miscType, MISC_MASTERS[kind].type));

/** Every row of the kind by name, for View and Print (unit_master_page.dart:168-172). */
export const listMiscMaster = (
  db: Db,
  bookId: string,
  kind: MiscMasterKind,
): Promise<MiscMasterRow[]> =>
  db
    .select({ code: miscList.miscCode, name: miscList.miscName })
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

  const [clash] = await db
    .select({ code: miscList.miscCode })
    .from(miscList)
    .where(and(ofKind(bookId, kind), eq(miscList.miscName, name)));
  if (clash) {
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
  await db
    .insert(miscList)
    .values({ bookId, miscCode: code, miscName: name, miscPname: name, miscType: type });
  return { code, name };
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
  await db
    .update(miscList)
    .set({ miscName: name, miscPname: name })
    .where(and(ofKind(bookId, kind), eq(miscList.miscCode, code)));
  return { code, name };
}

export async function removeMiscMaster(
  db: Db,
  bookId: string,
  kind: MiscMasterKind,
  code: string,
): Promise<void> {
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
