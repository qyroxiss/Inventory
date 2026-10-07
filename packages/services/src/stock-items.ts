// Stock Item. Port of MDA-Inventory lib/stock_item_page.dart (Part_Master / our stock_items).
// As in MDA:
//   - Item Code and Item Name are required. The code is typed by the user and can't be changed
//     once saved; Save refuses a code that exists (exact match), then a name that exists.
//   - Update checks the name against the other items only (case-sensitive).
//   - Under Sub Group is optional (stored as the sub group's code, '' for none). Unit and GST
//     Rate are free text. GST Rate is cleared unless the Tax Type is Taxable (the screen does
//     this; the service stores what it's given, as MDA's does).
//   - Remove doesn't check purchases, sales or stock (docs/LOGIC-SPEC.md Q-42).
// Added here: Purchase Rate and Sale Rate. MDA's table has them (the invoices fill them in and
// stock is valued at them) but its form never sets them. Leaving them out of an update keeps
// the stored rates, so an MDA import's rates survive.

import {
  STOCK_SUB_GROUP_TYPE,
  rateValue,
  stockItemFieldErrors,
  stockItemMessages as msg,
} from '@qi/core';
import { and, asc, eq, ne, schema, type Db } from '@qi/db';
import { UserError, assertNoFieldErrors } from './errors.ts';

const { miscList, stockItems } = schema;

export type StockItem = {
  code: string;
  name: string;
  printName: string;
  subGrpCode: string;
  subGrpName: string;
  unit: string;
  regType: string;
  gstRate: string;
  hsn: string;
  purRate: number;
  saleRate: number;
};
export type StockItemInput = {
  code: string;
  name: string;
  printName?: string;
  subGrpCode?: string;
  unit?: string;
  regType?: string;
  gstRate?: string;
  hsn?: string;
  purRate?: string;
  saleRate?: string;
};

const t = (v: string | undefined) => (v ?? '').trim();

/** Every item by name, with its sub group's name (stock_item_page.dart:239-244). */
export async function listStockItems(db: Db, bookId: string): Promise<StockItem[]> {
  const rows = await db
    .select({ item: stockItems, subGrpName: miscList.miscName })
    .from(stockItems)
    .leftJoin(
      miscList,
      and(
        eq(miscList.bookId, stockItems.bookId),
        eq(miscList.miscCode, stockItems.subGrpCode),
        eq(miscList.miscType, STOCK_SUB_GROUP_TYPE),
      ),
    )
    .where(eq(stockItems.bookId, bookId))
    .orderBy(asc(stockItems.partName));
  return rows.map(({ item: i, subGrpName }) => ({
    code: i.partCode,
    name: i.partName,
    printName: i.printName ?? '',
    subGrpCode: i.subGrpCode ?? '',
    subGrpName: subGrpName ?? '',
    unit: i.unit ?? '',
    regType: i.regType ?? '',
    gstRate: i.gstRate ?? '',
    hsn: i.hsnNo ?? '',
    purRate: Number(i.purRate),
    saleRate: Number(i.saleRate),
  }));
}

async function nameTaken(db: Db, bookId: string, name: string, exceptCode?: string) {
  const clauses = [eq(stockItems.bookId, bookId), eq(stockItems.partName, name)];
  if (exceptCode) clauses.push(ne(stockItems.partCode, exceptCode));
  const [clash] = await db
    .select({ code: stockItems.partCode })
    .from(stockItems)
    .where(and(...clauses));
  return !!clash;
}

const fields = (input: StockItemInput) => ({
  partName: t(input.name),
  printName: t(input.printName),
  subGrpCode: input.subGrpCode ?? '',
  unit: t(input.unit),
  regType: input.regType ?? '',
  gstRate: t(input.gstRate),
  hsnNo: t(input.hsn),
  ...(input.purRate === undefined ? {} : { purRate: rateValue(input.purRate)!.toFixed(2) }),
  ...(input.saleRate === undefined ? {} : { saleRate: rateValue(input.saleRate)!.toFixed(2) }),
});

export async function createStockItem(
  db: Db,
  bookId: string,
  input: StockItemInput,
): Promise<{ code: string; name: string }> {
  assertNoFieldErrors(stockItemFieldErrors(input));
  const code = t(input.code);
  const v = fields(input);

  const [codeClash] = await db
    .select({ code: stockItems.partCode })
    .from(stockItems)
    .where(and(eq(stockItems.bookId, bookId), eq(stockItems.partCode, code)));
  if (codeClash) throw new UserError(msg.duplicateCode(code), { code: msg.duplicateCode(code) });
  if (await nameTaken(db, bookId, v.partName)) {
    throw new UserError(msg.duplicateName, { name: msg.duplicateName });
  }

  await db.insert(stockItems).values({ bookId, partCode: code, ...v });
  return { code, name: v.partName };
}

export async function updateStockItem(
  db: Db,
  bookId: string,
  code: string,
  input: StockItemInput,
): Promise<{ code: string; name: string }> {
  // The code is read-only while editing; the one in the address is the one updated.
  assertNoFieldErrors(stockItemFieldErrors({ ...input, code }));
  const v = fields(input);
  if (await nameTaken(db, bookId, v.partName, code)) {
    throw new UserError(msg.duplicateName, { name: msg.duplicateName });
  }
  await db
    .update(stockItems)
    .set(v)
    .where(and(eq(stockItems.bookId, bookId), eq(stockItems.partCode, code)));
  return { code, name: v.partName };
}

export async function removeStockItem(db: Db, bookId: string, code: string): Promise<void> {
  await db
    .delete(stockItems)
    .where(and(eq(stockItems.bookId, bookId), eq(stockItems.partCode, code)));
}
