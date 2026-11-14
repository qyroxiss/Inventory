// Stock in hand (docs/LOGIC-SPEC.md §6.9): an item's opening quantity plus Σ(In − Out) over
// every stock movement, in all godowns. Cancelled documents have no movements (cancelling
// deletes them), so they don't count.
//
// Since 2026-11-14 a sale is also checked as on its own date and in its own godown (MDA looked
// at all godowns and every date: Q-27). Stock with no godown (opening stock, or a bill saved
// without one) can be sold from any godown.

import { round2, saleMessages } from '@qi/core';
import { and, eq, inArray, isNull, lte, or, schema, sql, type Db } from '@qi/db';
import { UserError } from './errors.ts';

const { stockItems, stockTrn } = schema;

/** In hand for each item code asked about. */
export async function stockInHand(
  db: Db,
  bookId: string,
  codes: string[],
  /** Only movements up to this date (yyyy-MM-dd) count. */
  asOn?: string,
  /** Only movements in this godown (by name), plus those with no godown at all. */
  godown?: string,
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
    .where(
      and(
        eq(stockTrn.bookId, bookId),
        inArray(stockTrn.partCode, codes),
        asOn ? lte(stockTrn.trnDate, asOn) : undefined,
        godown
          ? or(
              eq(stockTrn.godownCode, godown),
              isNull(stockTrn.godownCode),
              eq(stockTrn.godownCode, ''),
            )
          : undefined,
      ),
    )
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
  lines: { itemCode: string; itemName: string; qty: number; location?: string | null }[],
  /** The document's date: stock bought after it can't be sold on it. */
  asOn?: string,
): Promise<void> {
  const names = new Map(lines.map((l) => [l.itemCode, l.itemName]));
  const check = async (group: typeof lines, date?: string, godown?: string) => {
    const wanted = new Map<string, number>();
    for (const l of group) wanted.set(l.itemCode, (wanted.get(l.itemCode) ?? 0) + l.qty);
    const have = await stockInHand(db, bookId, [...wanted.keys()], date, godown);
    for (const [code, need] of wanted) {
      const inHand = have.get(code) ?? 0;
      if (need > inHand + 0.0001) {
        const name = names.get(code) ?? code;
        throw new UserError(
          godown
            ? saleMessages.notEnoughInGodown(name, godown, need, inHand)
            : saleMessages.notEnoughStock(name, need, inHand),
        );
      }
    }
  };
  // Everything that will be in hand, then as on the date, then in each godown.
  await check(lines);
  if (asOn) await check(lines, asOn);
  const godowns = new Set(lines.map((l) => (l.location ?? '').trim()).filter(Boolean));
  for (const g of godowns)
    await check(
      lines.filter((l) => (l.location ?? '').trim() === g),
      asOn,
      g,
    );
}
