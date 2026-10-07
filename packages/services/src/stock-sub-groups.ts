// Stock Sub Group. Port of MDA-Inventory lib/stock_sub_group_page.dart: Misc_Master rows (our
// misc_list) of type 'StockSubGroup', each pointing at its Stock Group's code in Misc_Pname.
// As in MDA:
//   - The name must be unique among stock sub groups, case-sensitively, on Save and on Update.
//   - Under is required and stored as the group's code; Save stamps Misc_Date.
//   - The list shows the group's current name; a sub group whose group was removed shows a
//     blank Under, yet still points at the old code (Stock Group's Remove doesn't check, Q-40).
//   - Remove doesn't check whether a stock item uses the sub group (docs/LOGIC-SPEC.md Q-41).

import {
  STOCK_GROUP_TYPE,
  STOCK_SUB_GROUP_CODE_PREFIX,
  STOCK_SUB_GROUP_CODE_WIDTH,
  STOCK_SUB_GROUP_TYPE,
  nextCode,
  stockSubGroupFieldErrors,
  stockSubGroupMessages,
} from '@qi/core';
import { alias, and, asc, eq, ne, schema, type Db } from '@qi/db';
import { UserError, assertNoFieldErrors } from './errors.ts';

const { miscList } = schema;

export type StockSubGroup = { code: string; name: string; under: string; underName: string };
export type StockSubGroupInput = { name: string; under?: string };

const ofSubGroups = (bookId: string) =>
  and(eq(miscList.bookId, bookId), eq(miscList.miscType, STOCK_SUB_GROUP_TYPE));

/** Sub groups by name, each with its group's name (stock_sub_group_page.dart:205-211). */
export async function listStockSubGroups(db: Db, bookId: string): Promise<StockSubGroup[]> {
  const parent = alias(miscList, 'parent');
  const rows = await db
    .select({
      code: miscList.miscCode,
      name: miscList.miscName,
      under: miscList.miscPname,
      underName: parent.miscName,
    })
    .from(miscList)
    .leftJoin(
      parent,
      and(
        eq(parent.bookId, miscList.bookId),
        eq(parent.miscCode, miscList.miscPname),
        eq(parent.miscType, STOCK_GROUP_TYPE),
      ),
    )
    .where(ofSubGroups(bookId))
    .orderBy(asc(miscList.miscName));
  return rows.map((r) => ({ ...r, under: r.under ?? '', underName: r.underName ?? '' }));
}

async function assertNameFree(db: Db, bookId: string, name: string, exceptCode?: string) {
  const clauses = [ofSubGroups(bookId), eq(miscList.miscName, name)];
  if (exceptCode) clauses.push(ne(miscList.miscCode, exceptCode));
  const [clash] = await db
    .select({ code: miscList.miscCode })
    .from(miscList)
    .where(and(...clauses));
  if (clash) {
    throw new UserError(stockSubGroupMessages.duplicate, {
      name: stockSubGroupMessages.duplicate,
    });
  }
}

export async function createStockSubGroup(
  db: Db,
  bookId: string,
  input: StockSubGroupInput,
): Promise<{ code: string; name: string }> {
  assertNoFieldErrors(stockSubGroupFieldErrors(input));
  const name = input.name.trim();
  await assertNameFree(db, bookId, name);

  const codes = await db
    .select({ code: miscList.miscCode })
    .from(miscList)
    .where(ofSubGroups(bookId));
  const code = nextCode(
    codes.map((r) => r.code),
    STOCK_SUB_GROUP_CODE_PREFIX,
    STOCK_SUB_GROUP_CODE_WIDTH,
  );
  await db.insert(miscList).values({
    bookId,
    miscCode: code,
    miscName: name,
    miscPname: input.under!,
    miscType: STOCK_SUB_GROUP_TYPE,
    miscDate: new Date().toISOString(),
  });
  return { code, name };
}

export async function updateStockSubGroup(
  db: Db,
  bookId: string,
  code: string,
  input: StockSubGroupInput,
): Promise<{ code: string; name: string }> {
  assertNoFieldErrors(stockSubGroupFieldErrors(input));
  const name = input.name.trim();
  await assertNameFree(db, bookId, name, code);
  await db
    .update(miscList)
    .set({ miscName: name, miscPname: input.under! })
    .where(and(ofSubGroups(bookId), eq(miscList.miscCode, code)));
  return { code, name };
}

export async function removeStockSubGroup(db: Db, bookId: string, code: string): Promise<void> {
  await db.delete(miscList).where(and(ofSubGroups(bookId), eq(miscList.miscCode, code)));
}
