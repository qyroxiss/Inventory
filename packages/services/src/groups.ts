// Group Master and Sub Group Master. Ports of MDA-Inventory lib/group_master_page.dart
// (docs/LOGIC-SPEC.md §7, Q-16) and lib/sub_group_master_page.dart (Q-18). They share one table
// (Maacct2 / account_groups): Group Master only ever sees ParentGrp='Parent' rows, Sub Group
// Master only the rest.

import {
  DEFAULT_GROUPS,
  SUB_GROUP_CODE_PREFIX,
  SUB_GROUP_CODE_WIDTH,
  TOP_LEVEL,
  groupCodePrefix,
  groupFieldErrors,
  groupMessages,
  nextCode,
  subGroupFieldErrors,
  subGroupMessages,
  type GroupType,
} from '@qi/core';
import { and, asc, eq, ne, schema, type Db } from '@qi/db';
import { UserError, assertNoFieldErrors } from './errors.ts';

const { accountGroups } = schema;

export type AccountGroup = typeof accountGroups.$inferSelect;
export type GroupInput = { name: string; type?: GroupType; isLedger?: 'Yes' | 'No' };
export type SubGroupInput = { name: string; under?: string };
export type SubGroup = AccountGroup & { parentGrpName: string | null };

/** Whether another row in this book already has this name (docs/LOGIC-SPEC.md §7, case-sensitive). */
async function nameClash(
  db: Db,
  bookId: string,
  name: string,
  excludeCode?: string,
): Promise<boolean> {
  const clauses = [eq(accountGroups.bookId, bookId), eq(accountGroups.grpName, name)];
  if (excludeCode) clauses.push(ne(accountGroups.grpCode, excludeCode));
  const [clash] = await db
    .select({ id: accountGroups.id })
    .from(accountGroups)
    .where(and(...clauses));
  return !!clash;
}

/**
 * Every group AND sub group by name, unfiltered — what Ledger Creation's own Under Group list
 * actually queries (`SELECT GrpName FROM Maacct2 ORDER BY GrpName`, ledger_creation_page.dart:
 * 129-140), unlike Sub Group Master's own Under Group list, which is top-level groups only.
 */
export const listAllGroups = (
  db: Db,
  bookId: string,
): Promise<{ grpCode: string; grpName: string }[]> =>
  db
    .select({ grpCode: accountGroups.grpCode, grpName: accountGroups.grpName })
    .from(accountGroups)
    .where(eq(accountGroups.bookId, bookId))
    .orderBy(asc(accountGroups.grpName));

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
  if (await nameClash(db, bookId, name)) {
    throw new UserError(groupMessages.duplicateOnSave, { name: groupMessages.duplicateOnSave });
  }

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

  if (await nameClash(db, bookId, name, grpCode)) {
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

// ── Sub Group Master ────────────────────────────────────────────────────────────

/**
 * Sub groups only, with the parent's name joined in, as MDA's View does with a self-join
 * (sub_group_master_page.dart:193-199). Ordered by name, same as MDA.
 */
export async function listSubGroups(db: Db, bookId: string): Promise<SubGroup[]> {
  const rows = await db
    .select()
    .from(accountGroups)
    .where(and(eq(accountGroups.bookId, bookId), ne(accountGroups.parentGrp, TOP_LEVEL)))
    .orderBy(asc(accountGroups.grpName));
  if (rows.length === 0) return [];

  const parents = await db
    .select({ grpCode: accountGroups.grpCode, grpName: accountGroups.grpName })
    .from(accountGroups)
    .where(eq(accountGroups.bookId, bookId));
  const nameOf = new Map(parents.map((p) => [p.grpCode, p.grpName]));
  return rows.map((r) => ({ ...r, parentGrpName: nameOf.get(r.parentGrp) ?? null }));
}

export async function createSubGroup(
  db: Db,
  bookId: string,
  input: SubGroupInput,
): Promise<AccountGroup> {
  assertNoFieldErrors(subGroupFieldErrors({ name: input.name, under: input.under }));
  const name = input.name.trim();

  if (await nameClash(db, bookId, name)) {
    throw new UserError(subGroupMessages.duplicateOnSave(name), {
      name: subGroupMessages.duplicateOnSave(name),
    });
  }

  // GrpType is derived from the chosen parent at creation time only (Q-18); a missing parent
  // falls back to 'Assets', exactly as MDA's own fallback does (sub_group_master_page.dart:125-130).
  const [parent] = await db
    .select({ grpType: accountGroups.grpType })
    .from(accountGroups)
    .where(and(eq(accountGroups.bookId, bookId), eq(accountGroups.grpCode, input.under!)));
  const grpType = parent?.grpType ?? 'Assets';

  const existing = await db
    .select({ grpCode: accountGroups.grpCode })
    .from(accountGroups)
    .where(eq(accountGroups.bookId, bookId));
  const code = nextCode(
    existing.map((r) => r.grpCode),
    SUB_GROUP_CODE_PREFIX,
    SUB_GROUP_CODE_WIDTH,
  );

  const [row] = await db
    .insert(accountGroups)
    .values({
      bookId,
      grpCode: code,
      grpName: name,
      grpType,
      parentGrp: input.under!,
      isLedger: 'No',
      sortOrder: 0,
    })
    .returning();
  return row!;
}

/**
 * Update: GrpName and ParentGrp only. Re-parenting never touches GrpType — it keeps whatever
 * type the sub group already had, even under a parent of a different type (Q-18, kept as is).
 */
export async function updateSubGroup(
  db: Db,
  bookId: string,
  grpCode: string,
  input: SubGroupInput,
): Promise<AccountGroup> {
  assertNoFieldErrors(subGroupFieldErrors({ name: input.name, under: input.under }));
  const name = input.name.trim();

  if (await nameClash(db, bookId, name, grpCode)) {
    throw new UserError(subGroupMessages.duplicateOnUpdate(name), {
      name: subGroupMessages.duplicateOnUpdate(name),
    });
  }

  const [row] = await db
    .update(accountGroups)
    .set({ grpName: name, parentGrp: input.under! })
    .where(and(eq(accountGroups.bookId, bookId), eq(accountGroups.grpCode, grpCode)))
    .returning();
  if (!row) throw new UserError(groupMessages.noneFound);
  return row;
}

/** Remove: no guard at all, unlike Group Master — MDA just deletes it (docs/LOGIC-SPEC.md Q-17). */
export async function deleteSubGroup(db: Db, bookId: string, grpCode: string): Promise<void> {
  await db
    .delete(accountGroups)
    .where(and(eq(accountGroups.bookId, bookId), eq(accountGroups.grpCode, grpCode)));
}
