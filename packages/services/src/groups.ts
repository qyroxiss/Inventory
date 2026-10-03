// Group Master. Port of MDA-Inventory lib/group_master_page.dart (docs/LOGIC-SPEC.md §7, Q-16).
// Group Master only ever lists and edits top-level groups (ParentGrp='Parent'); Sub Group
// Master, built separately, reads and writes the same table for the rest.

import {
  DEFAULT_GROUPS,
  TOP_LEVEL,
  groupCodePrefix,
  groupFieldErrors,
  groupMessages,
  nextCode,
  type GroupType,
} from '@qi/core';
import { and, asc, eq, ne, schema, type Db } from '@qi/db';
import { UserError, assertNoFieldErrors } from './errors.ts';

const { accountGroups } = schema;

export type AccountGroup = typeof accountGroups.$inferSelect;
export type GroupInput = { name: string; type?: GroupType; isLedger?: 'Yes' | 'No' };

/** Top-level groups only, as MDA's View dialog lists them (group_master_page.dart:206-210). */
export const listGroups = (db: Db, bookId: string): Promise<AccountGroup[]> =>
  db
    .select()
    .from(accountGroups)
    .where(and(eq(accountGroups.bookId, bookId), eq(accountGroups.parentGrp, TOP_LEVEL)))
    .orderBy(asc(accountGroups.grpType), asc(accountGroups.grpName));

/** Seeds the 28 default groups into a brand-new book (db_service.dart:936-984). */
export async function seedDefaultGroups(db: Db, bookId: string): Promise<void> {
  await db.insert(accountGroups).values(DEFAULT_GROUPS.map((g) => ({ bookId, ...g })));
}

export async function createGroup(
  db: Db,
  bookId: string,
  input: GroupInput,
): Promise<AccountGroup> {
  assertNoFieldErrors(groupFieldErrors({ name: input.name, type: input.type }));
  const name = input.name.trim();

  // The duplicate check runs across every group and sub group in the book (docs/LOGIC-SPEC.md §7).
  const [clash] = await db
    .select({ id: accountGroups.id })
    .from(accountGroups)
    .where(and(eq(accountGroups.bookId, bookId), eq(accountGroups.grpName, name)));
  if (clash)
    throw new UserError(groupMessages.duplicateOnSave, { name: groupMessages.duplicateOnSave });

  const existing = await db
    .select({ grpCode: accountGroups.grpCode })
    .from(accountGroups)
    .where(eq(accountGroups.bookId, bookId));
  const code = nextCode(
    existing.map((r) => r.grpCode),
    groupCodePrefix(input.type!),
  );

  const [row] = await db
    .insert(accountGroups)
    .values({
      bookId,
      grpCode: code,
      grpName: name,
      grpType: input.type!,
      parentGrp: TOP_LEVEL,
      isLedger: input.isLedger ?? 'No',
      sortOrder: 0,
    })
    .returning();
  return row!;
}

/** Update: GrpName, GrpType and IsLedger only — ParentGrp is forced back to 'Parent'. */
export async function updateGroup(
  db: Db,
  bookId: string,
  grpCode: string,
  input: GroupInput,
): Promise<AccountGroup> {
  assertNoFieldErrors(groupFieldErrors({ name: input.name, type: input.type }));
  const name = input.name.trim();

  const [clash] = await db
    .select({ id: accountGroups.id })
    .from(accountGroups)
    .where(
      and(
        eq(accountGroups.bookId, bookId),
        eq(accountGroups.grpName, name),
        ne(accountGroups.grpCode, grpCode),
      ),
    );
  if (clash) {
    throw new UserError(groupMessages.duplicateOnUpdate, { name: groupMessages.duplicateOnUpdate });
  }

  const [row] = await db
    .update(accountGroups)
    .set({
      grpName: name,
      grpType: input.type!,
      isLedger: input.isLedger ?? 'No',
      parentGrp: TOP_LEVEL,
    })
    .where(and(eq(accountGroups.bookId, bookId), eq(accountGroups.grpCode, grpCode)))
    .returning();
  if (!row) throw new UserError(groupMessages.noneFound);
  return row;
}

/**
 * Remove. Every group Group Master can load has ParentGrp='Parent', and MDA never lets those
 * be removed from here (group_master_page.dart:178-198) — so this always refuses. Kept as a
 * real check, not just a disabled button, in case it is ever called directly (Q-16).
 */
export async function deleteGroup(db: Db, bookId: string, grpCode: string): Promise<void> {
  const [row] = await db
    .select()
    .from(accountGroups)
    .where(and(eq(accountGroups.bookId, bookId), eq(accountGroups.grpCode, grpCode)));
  if (!row) return;
  if (row.parentGrp === TOP_LEVEL) throw new UserError(groupMessages.notDeletable);
  await db
    .delete(accountGroups)
    .where(and(eq(accountGroups.bookId, bookId), eq(accountGroups.grpCode, grpCode)));
}
