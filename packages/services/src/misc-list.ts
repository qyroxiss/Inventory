// Misc_Master: small name lists that learn new entries as they're typed. City (Ledger Creation)
// is the first of these; Unit, Godown, Stock Group and Sale Type share the same table later, as
// MDA's does (misc_list_service.dart).

import { MISC_CODE_WIDTH, nextCode } from '@qi/core';
import { and, asc, eq, schema, sql, type Db } from '@qi/db';

const { miscList } = schema;

/** Every name of the given type, sorted — for the dropdown list (misc_list_service.dart:21-30). */
export const listMisc = async (db: Db, bookId: string, type: string): Promise<string[]> => {
  const rows = await db
    .select({ miscName: miscList.miscName })
    .from(miscList)
    .where(and(eq(miscList.bookId, bookId), eq(miscList.miscType, type)))
    .orderBy(asc(miscList.miscName));
  return rows.map((r) => r.miscName);
};

/**
 * Adds `name` if it's new (case-insensitively) and returns the spelling to use — an existing
 * entry wins, so "pune" typed against a stored "Pune" does not create a second record
 * (misc_list_service.dart:46-66).
 */
export async function addMiscIfNew(
  db: Db,
  bookId: string,
  type: string,
  prefix: string,
  name: string,
): Promise<string> {
  const trimmed = name.trim();
  if (!trimmed) return '';

  const [existing] = await db
    .select({ miscName: miscList.miscName })
    .from(miscList)
    .where(
      and(
        eq(miscList.bookId, bookId),
        eq(miscList.miscType, type),
        sql`lower(${miscList.miscName}) = lower(${trimmed})`,
      ),
    );
  if (existing) return existing.miscName;

  const codes = await db
    .select({ miscCode: miscList.miscCode })
    .from(miscList)
    .where(and(eq(miscList.bookId, bookId), eq(miscList.miscType, type)));
  const code = nextCode(
    codes.map((r) => r.miscCode),
    prefix,
    MISC_CODE_WIDTH,
  );

  await db.insert(miscList).values({ bookId, miscCode: code, miscName: trimmed, miscType: type });
  return trimmed;
}
