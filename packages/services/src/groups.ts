// Group Master and Sub Group Master. Ports of MDA-Inventory lib/group_master_page.dart
// (docs/LOGIC-SPEC.md §7, Q-16) and lib/sub_group_master_page.dart (Q-18). They share one table
// (Maacct2 / account_groups): Group Master only ever sees ParentGrp='Parent' rows, Sub Group
// Master only the rest.
//
// Changed 2026-11-14 (user's request: every option must work):
//   - Duplicate names are checked whatever their case (was Q-15).
//   - A user-made group can be updated and removed; a built-in group can be renamed, but its
//     type is fixed and it can't be removed (was Q-16).
//   - A group or sub group with sub groups or ledgers under it can't be removed (was Q-17).
//   - Moving a sub group gives it (and everything under it) the new parent's type (was Q-18).

import {
  DEFAULT_GROUPS,
  SUB_GROUP_CODE_PREFIX,
  SUB_GROUP_CODE_WIDTH,
  TOP_LEVEL,
  groupCodePrefix,
  groupFieldErrors,
  groupMessages,
  isBuiltInGroup,
  nextCode,
  subGroupFieldErrors,
  subGroupMessages,
  type GroupType,
} from '@qi/core';
import { and, asc, eq, inArray, ne, schema, sql, type Db } from '@qi/db';
import { UserError, assertNoFieldErrors } from './errors.ts';

const { accountGroups } = schema;

export type AccountGroup = typeof accountGroups.$inferSelect;
export type GroupInput = { name: string; type?: GroupType; isLedger?: 'Yes' | 'No' };
export type SubGroupInput = { name: string; under?: string };
export type SubGroup = AccountGroup & { parentGrpName: string | null };

/** Whether another row in this book already has this name, whatever its case. */
async function nameClash(
  db: Db,
  bookId: string,
  name: string,
  excludeCode?: string,
): Promise<boolean> {
  const clauses = [
    eq(accountGroups.bookId, bookId),
    sql`lower(${accountGroups.grpName}) = ${name.toLowerCase()}`,
  ];
  if (excludeCode) clauses.push(ne(accountGroups.grpCode, excludeCode));
  const [clash] = await db
    .select({ id: accountGroups.id })
    .from(accountGroups)
    .where(and(...clauses));
  return !!clash;
}

/** What sits directly under a group: its sub groups and its ledgers. */
async function contents(db: Db, bookId: string, grpCode: string) {
  const n = sql<number>`count(*)::int`;
  const [subs] = await db
    .select({ n })
    .from(accountGroups)
    .where(and(eq(accountGroups.bookId, bookId), eq(accountGroups.parentGrp, grpCode)));
  const [leds] = await db
    .select({ n })
    .from(schema.ledgers)
    .where(and(eq(schema.ledgers.bookId, bookId), eq(schema.ledgers.grpCode, grpCode)));
  return { subGroups: Number(subs?.n ?? 0), ledgers: Number(leds?.n ?? 0) };
}

/** Gives a group's whole family of sub groups its type. */
async function retypeDescendants(db: Db, bookId: string, grpCode: string, grpType: string) {
  let level = [grpCode];
  const seen = new Set(level);
  while (level.length) {
    const kids = await db
      .select({ grpCode: accountGroups.grpCode })
      .from(accountGroups)
      .where(and(eq(accountGroups.bookId, bookId), inArray(accountGroups.parentGrp, level)));
    level = kids.map((k) => k.grpCode).filter((c) => !seen.has(c));
    level.forEach((c) => seen.add(c));
    if (level.length)
      await db
        .update(accountGroups)
        .set({ grpType })
        .where(and(eq(accountGroups.bookId, bookId), inArray(accountGroups.grpCode, level)));
  }
}

/**
 * Every group AND sub group by name, unfiltered — what Ledger Creation's own Under Group list
 * actually queries (`SELECT GrpName FROM Maacct2 ORDER BY GrpName`, ledger_creation_page.dart:
 * 129-140), unlike Sub Group Master's own Under Group list, which is top-level groups only.
 */
export const listAllGroups = (
  db: Db,
  bookId: string,
): Promise<{ grpCode: string; grpName: string; parentGrp: string }[]> =>
  db
    .select({
      grpCode: accountGroups.grpCode,
      grpName: accountGroups.grpName,
      parentGrp: accountGroups.parentGrp,
    })
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

/** Update: GrpName, GrpType and IsLedger only — ParentGrp is forced back to 'Parent'. A
 *  built-in group keeps its type; a new type passes down to its sub groups. */
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
  const [before] = await db
    .select({ grpType: accountGroups.grpType })
    .from(accountGroups)
    .where(and(eq(accountGroups.bookId, bookId), eq(accountGroups.grpCode, grpCode)));
  if (before && isBuiltInGroup(grpCode) && before.grpType !== input.type)
    throw new UserError(groupMessages.builtInType, { type: groupMessages.builtInType });

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
  if (before && before.grpType !== row.grpType)
    await retypeDescendants(db, bookId, grpCode, row.grpType);
  return row;
}

/** Remove a group the user made, once nothing is under it. Built-in groups stay. */
export async function deleteGroup(db: Db, bookId: string, grpCode: string): Promise<void> {
  const [row] = await db
    .select()
    .from(accountGroups)
    .where(and(eq(accountGroups.bookId, bookId), eq(accountGroups.grpCode, grpCode)));
  if (!row) return;
  if (isBuiltInGroup(grpCode)) throw new UserError(groupMessages.notDeletable);
  const c = await contents(db, bookId, grpCode);
  if (c.subGroups || c.ledgers)
    throw new UserError(groupMessages.inUse(row.grpName, c.subGroups, c.ledgers));
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

/** Update: GrpName and ParentGrp. Moved under another parent, it (and everything under it)
 *  takes that parent's type. */
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
  if (input.under === grpCode)
    throw new UserError(subGroupMessages.underItself, { under: subGroupMessages.underItself });
  const [parent] = await db
    .select({ grpType: accountGroups.grpType })
    .from(accountGroups)
    .where(and(eq(accountGroups.bookId, bookId), eq(accountGroups.grpCode, input.under!)));

  const [row] = await db
    .update(accountGroups)
    .set({ grpName: name, parentGrp: input.under!, ...(parent ? { grpType: parent.grpType } : {}) })
    .where(and(eq(accountGroups.bookId, bookId), eq(accountGroups.grpCode, grpCode)))
    .returning();
  if (!row) throw new UserError(groupMessages.noneFound);
  await retypeDescendants(db, bookId, grpCode, row.grpType);
  return row;
}

/** Remove, once no sub group or ledger is under it. */
export async function deleteSubGroup(db: Db, bookId: string, grpCode: string): Promise<void> {
  const [row] = await db
    .select({ grpName: accountGroups.grpName })
    .from(accountGroups)
    .where(and(eq(accountGroups.bookId, bookId), eq(accountGroups.grpCode, grpCode)));
  if (!row) return;
  if (isBuiltInGroup(grpCode)) throw new UserError(groupMessages.notDeletable);
  const c = await contents(db, bookId, grpCode);
  if (c.subGroups || c.ledgers)
    throw new UserError(subGroupMessages.inUse(row.grpName, c.subGroups, c.ledgers));
  await db
    .delete(accountGroups)
    .where(and(eq(accountGroups.bookId, bookId), eq(accountGroups.grpCode, grpCode)));
}

/** The codes of groups and every sub group under them, at any depth (MDA went one level down
 *  only, so a party in a sub group of a sub group was missing from the lists: Q-26). */
export async function groupFamilyCodes(db: Db, bookId: string, roots: string[]): Promise<string[]> {
  const all = await db
    .select({ code: accountGroups.grpCode, parent: accountGroups.parentGrp })
    .from(accountGroups)
    .where(eq(accountGroups.bookId, bookId));
  const family = new Set(roots.filter((r) => all.some((g) => g.code === r)));
  for (let grew = true; grew;) {
    grew = false;
    for (const g of all)
      if (!family.has(g.code) && family.has(g.parent)) {
        family.add(g.code);
        grew = true;
      }
  }
  return [...family];
}
