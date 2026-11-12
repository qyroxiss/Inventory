// Guards a purchase or sale that already has returns against it (2026-11-11 audit). A return
// points at its bill by bill number and line position, so:
//   - the bill can't be cancelled while an active return stands against it (the return's stock
//     and ledger effect would be left behind with nothing to return against);
//   - an update must keep every returned line on the same position, with the same item, and at
//     least the quantity already returned.

import { and, eq, schema, type Db } from '@qi/db';
import { UserError } from './errors.ts';

const { returnLines, returns } = schema;

type Kind = 'PRT' | 'SRT';

async function activeReturns(db: Db, bookId: string, kind: Kind, billNo: string) {
  return db
    .select({
      returnNo: returns.returnNo,
      srcLineNo: returnLines.srcLineNo,
      itemCode: returnLines.itemCode,
      itemName: returnLines.itemName,
      qty: returnLines.qty,
    })
    .from(returnLines)
    .innerJoin(returns, eq(returns.id, returnLines.returnId))
    .where(
      and(
        eq(returns.bookId, bookId),
        eq(returns.kind, kind),
        eq(returns.againstBillNo, billNo),
        eq(returns.status, 'Active'),
      ),
    );
}

const r3 = (v: number) => Math.round(v * 1000) / 1000;

/** Refuses to cancel a bill with active returns. */
export async function assertNoReturns(db: Db, bookId: string, kind: Kind, billNo: string) {
  const rows = await activeReturns(db, bookId, kind, billNo);
  if (!rows.length) return;
  const nos = [...new Set(rows.map((r) => r.returnNo))].join(', ');
  throw new UserError(
    `Bill "${billNo}" has ${kind === 'PRT' ? 'a purchase return' : 'a sales return'} (${nos}). Cancel the return first, then cancel the bill.`,
  );
}

/** Refuses an update that would leave a return pointing at a missing, different or smaller
 *  line. [lines] are the bill's new lines, in order. */
export async function assertReturnsFit(
  db: Db,
  bookId: string,
  kind: Kind,
  billNo: string,
  lines: { itemCode: string; qty: number }[],
) {
  const rows = await activeReturns(db, bookId, kind, billNo);
  const byLine = new Map<number, { itemCode: string; itemName: string; qty: number; nos: Set<string> }>();
  for (const r of rows) {
    const n = Number(r.srcLineNo);
    const e = byLine.get(n) ?? { itemCode: r.itemCode, itemName: r.itemName ?? r.itemCode, qty: 0, nos: new Set() };
    e.qty = r3(e.qty + Number(r.qty));
    e.nos.add(r.returnNo);
    byLine.set(n, e);
  }
  for (const [n, e] of [...byLine].sort((a, b) => a[0] - b[0])) {
    const now = lines[n - 1];
    if (!now || now.itemCode !== e.itemCode || r3(now.qty) < e.qty)
      throw new UserError(
        `Line ${n} (${e.itemName}) has ${e.qty} returned on ${[...e.nos].join(', ')}. Keep it as line ${n} with at least that quantity, or cancel the return first.`,
      );
  }
}
