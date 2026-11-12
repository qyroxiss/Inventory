// Stock valuation for the Stock Summary (user's request, 2026-11-10): the user picks how stock is
// valued — at the Opening Rate, at the moving Average rate, First-In-First-Out, or at MRP. Each
// item's opening stock (Opening Stock × Opening Rate on its master) is the first lot.
//
// Movements are taken in date order, goods coming in before goods going out on the same day.
// Goods coming back on a Sales Return (or any receipt without a rate) come in at the current
// cost, so a return at the selling price doesn't change the cost of what's in hand. Stock that
// goes below zero is valued at the last known cost.

import { round2 } from './round.ts';

export const VALUATION_METHODS = ['opening', 'average', 'fifo', 'mrp'] as const;
export type ValuationMethod = (typeof VALUATION_METHODS)[number];
export const VALUATION_LABELS: Record<ValuationMethod, string> = {
  opening: 'Opening Rate',
  average: 'Average Rate',
  fifo: 'FIFO',
  mrp: 'MRP',
};

export type StockMove = {
  /** yyyy-MM-dd */
  date: string;
  vchrType: string;
  inQty: number;
  outQty: number;
  rate: number;
};

export type ItemRates = {
  opQty: number;
  /** Opening Rate; 0 when the master has none. */
  opRate: number;
  mrp: number;
  /** The rate used when there is no better one (the item's purchase/sale rate). */
  fallback: number;
};

export type Valued = { qty: number; value: number };

/** The item's stock and its value at the start of `from` and at the end of the moves. */
export function valueItem(
  method: ValuationMethod,
  item: ItemRates,
  moves: StockMove[],
  from: string,
): { opening: Valued; closing: Valued } {
  const sorted = [...moves].sort(
    (a, b) => a.date.localeCompare(b.date) || Number(b.inQty > 0) - Number(a.inQty > 0),
  );
  const openRate = item.opRate > 0 ? item.opRate : item.fallback;

  // Opening Rate and MRP: every unit at one rate.
  if (method === 'opening' || method === 'mrp') {
    const rate = method === 'mrp' ? item.mrp : openRate;
    let qty = item.opQty;
    let opening: Valued | null = null;
    for (const m of sorted) {
      if (!opening && m.date >= from) opening = { qty, value: round2(qty * rate) };
      qty += m.inQty - m.outQty;
    }
    opening ??= { qty, value: round2(qty * rate) };
    return { opening: tidy(opening), closing: tidy({ qty, value: qty * rate }) };
  }

  // Average and FIFO: lots of stock at their cost.
  let lots: { qty: number; rate: number }[] = item.opQty ? [{ qty: item.opQty, rate: openRate }] : [];
  let lastCost = openRate;
  const qtyOf = () => lots.reduce((a, l) => a + l.qty, 0);
  const valueOf = () => lots.reduce((a, l) => a + l.qty * l.rate, 0);
  const avg = () => {
    const q = qtyOf();
    return q > 0 ? valueOf() / q : lastCost;
  };
  let opening: Valued | null = null;
  for (const m of sorted) {
    if (!opening && m.date >= from) opening = { qty: qtyOf(), value: valueOf() };
    if (m.inQty > 0) {
      const cost = m.vchrType === 'SRT' || m.rate <= 0 ? avg() : m.rate;
      if (method === 'average') {
        const q = qtyOf() + m.inQty;
        const v = valueOf() + m.inQty * cost;
        lots = [{ qty: q, rate: q !== 0 ? v / q : cost }];
      } else lots.push({ qty: m.inQty, rate: cost });
      lastCost = cost;
    }
    if (m.outQty > 0) {
      if (method === 'average') {
        const rate = avg();
        lots = [{ qty: qtyOf() - m.outQty, rate }];
        lastCost = rate;
      } else {
        // First in, first out: the oldest lots go first.
        let left = m.outQty;
        while (left > 0 && lots.length && lots[0]!.qty > 0) {
          const lot = lots[0]!;
          const take = Math.min(lot.qty, left);
          lot.qty -= take;
          left -= take;
          lastCost = lot.rate;
          if (lot.qty <= 1e-9) lots.shift();
        }
        if (left > 1e-9) lots = [...lots, { qty: -left, rate: lastCost }];
      }
    }
  }
  opening ??= { qty: qtyOf(), value: valueOf() };
  return { opening: tidy(opening), closing: tidy({ qty: qtyOf(), value: valueOf() }) };
}

const tidy = (v: Valued): Valued => ({
  qty: Math.round(v.qty * 1000) / 1000,
  value: round2(v.value),
});
