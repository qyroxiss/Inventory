// Guards a purchase or sale that already has returns against it (2026-11-11 audit). A return
// points at its bill by bill number and line position, so:
//   - the bill can't be cancelled while an active return stands against it (the return's stock
//     and ledger effect would be left behind with nothing to return against);
//   - an update must keep every returned line on the same position, with the same item, and at
//     least the quantity already returned;
//   - and (2026-11-12) at the same rate, discount and GST rate, with the same party and the same
//     inter-state setting: the return was valued from them, so changing them would leave the
//     credit note worth more or less than the bill.

import { and, eq, schema, sql, type Db } from '@qi/db';
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
      rate: returnLines.rate,
      disP: returnLines.disP,
      gst: sql<string>`${returnLines.sgstP} + ${returnLines.cgstP} + ${returnLines.igstP}`,
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
  lines: { itemCode: string; qty: number; rate: number; disP: number; sgstP: number; cgstP: number; igstP: number }[],
  /** The bill's party or inter-state setting is being changed. */
  headerChanged = false,
) {
  const rows = await activeReturns(db, bookId, kind, billNo);
  if (rows.length && headerChanged) {
    const nos = [...new Set(rows.map((r) => r.returnNo))].join(', ');
    throw new UserError(
      `Bill "${billNo}" has returns (${nos}). Its party and inter-state setting can't change; cancel the returns first.`,
    );
  }
  const byLine = new Map<number, { itemCode: string; itemName: string; qty: number; rate: number; disP: number; gst: number; nos: Set<string> }>();
  for (const r of rows) {
    const n = Number(r.srcLineNo);
    const e = byLine.get(n) ?? { itemCode: r.itemCode, itemName: r.itemName ?? r.itemCode, qty: 0, rate: Number(r.rate), disP: Number(r.disP), gst: Number(r.gst), nos: new Set() };
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
    const gst = now.sgstP + now.cgstP + now.igstP;
    if (Math.abs(now.rate - e.rate) >= 0.005 || Math.abs(now.disP - e.disP) >= 0.005 || Math.abs(gst - e.gst) >= 0.005)
      throw new UserError(
        `Line ${n} (${e.itemName}) has returns (${[...e.nos].join(', ')}). Its rate, discount and GST rate can't change; cancel the returns first.`,
      );
  }
}
