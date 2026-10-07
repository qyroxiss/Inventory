// Stock Group. Port of MDA-Inventory lib/stock_group_page.dart: Misc_Master rows (our misc_list)
// of type 'StockGroup'. As in MDA:
//   - The name must be unique among stock groups, case-sensitively, on Save and on Update.
//   - GST Rate and HSN No. are free text, trimmed, stored in Misc_Gen1 / Misc_Gen2.
//   - Save stamps Misc_Date; Update leaves it.
//   - Remove doesn't check whether a stock sub group sits under the group (docs/LOGIC-SPEC.md Q-40).

import {
  STOCK_GROUP_CODE_PREFIX,
  STOCK_GROUP_CODE_WIDTH,
  STOCK_GROUP_TYPE,
  nextCode,
  stockGroupFieldErrors,
  stockGroupMessages,
} from '@qi/core';
import { and, asc, eq, ne, schema, type Db } from '@qi/db';
import { UserError, assertNoFieldErrors } from './errors.ts';

const { miscList } = schema;

export type StockGroup = { code: string; name: string; gstRate: string; hsn: string };
export type StockGroupInput = { name: string; gstRate?: string; hsn?: string };

const ofGroups = (bookId: string) =>
  and(eq(miscList.bookId, bookId), eq(miscList.miscType, STOCK_GROUP_TYPE));

/** Every stock group by name, for View and Print (stock_group_page.dart:197-202). */
export async function listStockGroups(db: Db, bookId: string): Promise<StockGroup[]> {
  const rows = await db
    .select({
      code: miscList.miscCode,
      name: miscList.miscName,
      gstRate: miscList.miscGen1,
      hsn: miscList.miscGen2,
    })
    .from(miscList)
    .where(ofGroups(bookId))
    .orderBy(asc(miscList.miscName));
  return rows.map((r) => ({ ...r, gstRate: r.gstRate ?? '', hsn: r.hsn ?? '' }));
}

async function assertNameFree(db: Db, bookId: string, name: string, exceptCode?: string) {
  const clauses = [ofGroups(bookId), eq(miscList.miscName, name)];
  if (exceptCode) clauses.push(ne(miscList.miscCode, exceptCode));
  const [clash] = await db
    .select({ code: miscList.miscCode })
    .from(miscList)
    .where(and(...clauses));
  if (clash) {
    throw new UserError(stockGroupMessages.duplicate, { name: stockGroupMessages.duplicate });
  }
}

const values = (input: StockGroupInput) => ({
  name: input.name.trim(),
  gstRate: (input.gstRate ?? '').trim(),
  hsn: (input.hsn ?? '').trim(),
});

export async function createStockGroup(
  db: Db,
  bookId: string,
  input: StockGroupInput,
): Promise<StockGroup> {
  assertNoFieldErrors(stockGroupFieldErrors(input));
  const v = values(input);
  await assertNameFree(db, bookId, v.name);

  const codes = await db.select({ code: miscList.miscCode }).from(miscList).where(ofGroups(bookId));
  const code = nextCode(
    codes.map((r) => r.code),
    STOCK_GROUP_CODE_PREFIX,
    STOCK_GROUP_CODE_WIDTH,
  );
  await db.insert(miscList).values({
    bookId,
    miscCode: code,
    miscName: v.name,
    miscGen1: v.gstRate,
    miscGen2: v.hsn,
    miscType: STOCK_GROUP_TYPE,
    miscDate: new Date().toISOString(),
  });
  return { code, ...v };
}

export async function updateStockGroup(
  db: Db,
  bookId: string,
  code: string,
  input: StockGroupInput,
): Promise<StockGroup> {
  assertNoFieldErrors(stockGroupFieldErrors(input));
  const v = values(input);
  await assertNameFree(db, bookId, v.name, code);
  await db
    .update(miscList)
    .set({ miscName: v.name, miscGen1: v.gstRate, miscGen2: v.hsn })
    .where(and(ofGroups(bookId), eq(miscList.miscCode, code)));
  return { code, ...v };
}

export async function removeStockGroup(db: Db, bookId: string, code: string): Promise<void> {
  await db.delete(miscList).where(and(ofGroups(bookId), eq(miscList.miscCode, code)));
}
