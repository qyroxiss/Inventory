// Stock in hand (docs/LOGIC-SPEC.md §6.9): an item's opening quantity plus Σ(In − Out) over
// every stock movement, in all godowns. Cancelled documents have no movements (cancelling
// deletes them), so they don't count.

import { round2, saleMessages } from '@qi/core';
import { and, eq, inArray, schema, sql, type Db } from '@qi/db';
import { UserError } from './errors.ts';

const { stockItems, stockTrn } = schema;

/** In hand for each item code asked about. */
export async function stockInHand(
  db: Db,
  bookId: string,
  codes: string[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>(codes.map((c) => [c, 0]));
  if (!codes.length) return out;
  const items = await db
    .select({ code: stockItems.partCode, op: stockItems.opQty })
    .from(stockItems)
    .where(and(eq(stockItems.bookId, bookId), inArray(stockItems.partCode, codes)));
  for (const i of items) out.set(i.code, Number(i.op));
  const moved = await db
    .select({
      code: stockTrn.partCode,
      qty: sql<string>`coalesce(sum(${stockTrn.inQty}), 0) - coalesce(sum(${stockTrn.outQty}), 0)`,
    })
    .from(stockTrn)
    .where(and(eq(stockTrn.bookId, bookId), inArray(stockTrn.partCode, codes)))
    .groupBy(stockTrn.partCode);
  for (const m of moved) out.set(m.code, (out.get(m.code) ?? 0) + Number(m.qty));
  for (const [c, v] of out) out.set(c, round2(v));
  return out;
}

/** `_assertStockAvailable`: several lines may name the same item, so demand is summed first;
 *  refuses with "Not enough stock for <name>: x needed, y in hand." Call it after the
 *  document's own old movement is removed, so it sees the position without it. */
export async function assertStockAvailable(
  db: Db,
  bookId: string,
  lines: { itemCode: string; itemName: string; qty: number }[],
): Promise<void> {
  const wanted = new Map<string, number>();
  const names = new Map<string, string>();
  for (const l of lines) {
    wanted.set(l.itemCode, (wanted.get(l.itemCode) ?? 0) + l.qty);
    names.set(l.itemCode, l.itemName);
  }
  const have = await stockInHand(db, bookId, [...wanted.keys()]);
  for (const [code, need] of wanted) {
    const inHand = have.get(code) ?? 0;
    if (need > inHand + 0.0001)
      throw new UserError(saleMessages.notEnoughStock(names.get(code) ?? code, need, inHand));
  }
}
