// Sale Type Master. Port of MDA-Inventory lib/sale_type_service.dart: Misc_Master rows (our
// misc_list) of type 'SaleType'. As in MDA:
//   - Sale Name and Sale By are required; Sale Prefix is upper-cased; all trimmed.
//   - The name must be unique among sale types, case-sensitively, on Save and on Update.
//   - Update has no confirmation step (the screen saves straight away).
//   - Remove is refused once a sale bill (cancelled ones too) carries the type's name.

import {
  SALE_TYPE,
  SALE_TYPE_CODE_PREFIX,
  SALE_TYPE_CODE_WIDTH,
  nextCode,
  saleTypeMessages as msg,
} from '@qi/core';
import { and, asc, eq, ne, schema, sql, type Db } from '@qi/db';
import { UserError } from './errors.ts';

const { miscList, sales } = schema;

export type SaleType = { code: string; name: string; prefix: string; saleBy: string };
export type SaleTypeInput = { name: string; prefix?: string; saleBy?: string };

const ofTypes = (bookId: string) =>
  and(eq(miscList.bookId, bookId), eq(miscList.miscType, SALE_TYPE));

/** Every sale type by name (sale_type_service.dart:38-45). */
export async function listSaleTypes(db: Db, bookId: string): Promise<SaleType[]> {
  const rows = await db
    .select({
      code: miscList.miscCode,
      name: miscList.miscName,
      prefix: miscList.miscPname,
      saleBy: miscList.miscSname,
    })
    .from(miscList)
    .where(ofTypes(bookId))
    .orderBy(asc(miscList.miscName));
  return rows.map((r) => ({ ...r, prefix: r.prefix ?? '', saleBy: r.saleBy ?? '' }));
}

/** The service's own checks, with its own wording (sale_type_service.dart:57-66). */
async function check(db: Db, bookId: string, input: SaleTypeInput, exceptCode?: string) {
  const name = input.name.trim();
  if (!name) throw new UserError(msg.nameRequiredService, { name: msg.nameRequired });
  if (!(input.saleBy ?? '').trim()) {
    throw new UserError(msg.saleByRequiredService, { saleBy: msg.saleByRequired });
  }
  const clauses = [ofTypes(bookId), eq(miscList.miscName, name)];
  if (exceptCode) clauses.push(ne(miscList.miscCode, exceptCode));
  const [clash] = await db
    .select({ code: miscList.miscCode })
    .from(miscList)
    .where(and(...clauses));
  if (clash) throw new UserError(msg.duplicate(name));
  return {
    name,
    prefix: (input.prefix ?? '').trim().toUpperCase(),
    saleBy: (input.saleBy ?? '').trim(),
  };
}

export async function createSaleType(
  db: Db,
  bookId: string,
  input: SaleTypeInput,
): Promise<SaleType> {
  const v = await check(db, bookId, input);
  const codes = await db.select({ code: miscList.miscCode }).from(miscList).where(ofTypes(bookId));
  const code = nextCode(
    codes.map((r) => r.code),
    SALE_TYPE_CODE_PREFIX,
    SALE_TYPE_CODE_WIDTH,
  );
  await db.insert(miscList).values({
    bookId,
    miscCode: code,
    miscName: v.name,
    miscPname: v.prefix,
    miscSname: v.saleBy,
    miscType: SALE_TYPE,
    miscDate: new Date().toISOString(),
  });
  return { code, ...v };
}

export async function updateSaleType(
  db: Db,
  bookId: string,
  code: string,
  input: SaleTypeInput,
): Promise<SaleType> {
  const v = await check(db, bookId, input, code);
  await db
    .update(miscList)
    .set({ miscName: v.name, miscPname: v.prefix, miscSname: v.saleBy })
    .where(and(ofTypes(bookId), eq(miscList.miscCode, code)));
  return { code, ...v };
}

/** How many sale bills carry this type, by name (sale_type_service.dart:107-112). */
export async function saleTypeUsageCount(db: Db, bookId: string, name: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(sales)
    .where(and(eq(sales.bookId, bookId), eq(sales.saleType, name)));
  return Number(row?.n ?? 0);
}

export async function removeSaleType(db: Db, bookId: string, code: string): Promise<void> {
  const [row] = await db
    .select({ name: miscList.miscName })
    .from(miscList)
    .where(and(ofTypes(bookId), eq(miscList.miscCode, code)));
  if (!row) return;
  const used = await saleTypeUsageCount(db, bookId, row.name);
  if (used > 0) throw new UserError(msg.inUse(row.name, used));
  await db.delete(miscList).where(and(ofTypes(bookId), eq(miscList.miscCode, code)));
}
