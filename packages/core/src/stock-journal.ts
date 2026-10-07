// Stock Journal. MDA lists it but shows "Not built yet"; it seeds only its series (STJ-, 3
// digits). Built here in the usual Indian accounting shape (owner, 2026-10-07):
//   - Consumption (Source): items taken out of stock, each from a godown.
//   - Production (Destination): items brought into stock, each into a godown.
//   - It moves stock only — no ledger lines. A godown transfer is the same item out of one
//     godown and into another.
// Saving follows MDA's other documents: numbered STJ-001…, refused when the source runs short
// (the sale's stock check and wording), cancelled rather than deleted.

import { round2 } from './round.ts';

export type StjSide = 'out' | 'in';

export type StjLine = {
  side: StjSide;
  itemCode: string;
  itemName: string;
  unit: string | null;
  /** Godown name. */
  godown: string | null;
  qty: number;
  rate: number;
  amount: number;
};

export const stjLine = (p: Omit<StjLine, 'amount'>): StjLine => ({
  ...p,
  amount: round2(p.qty * p.rate),
});

export type StjTotals = { outQty: number; outValue: number; inQty: number; inValue: number };

export function stjTotals(lines: StjLine[]): StjTotals {
  const total = (side: StjSide, f: (l: StjLine) => number) =>
    round2(lines.filter((l) => l.side === side).reduce((a, l) => a + f(l), 0));
  return {
    outQty: total('out', (l) => l.qty),
    outValue: total('out', (l) => l.amount),
    inQty: total('in', (l) => l.qty),
    inValue: total('in', (l) => l.amount),
  };
}

export const stockJournalMessages = {
  outsideYear: (label: string) => `Voucher date is outside the open financial year (${label}).`,
  noItems: 'Add at least one item.',
  lineNoItem: 'Every line must have an item.',
  lineQty: (name: string) => `Quantity must be more than zero for ${name}.`,
  lineRate: (name: string) => `Rate cannot be negative for ${name}.`,
  notFound: 'Stock journal not found.',
  cancelledEdit: 'A cancelled stock journal cannot be edited.',
  // The page's own messages.
  selectItemFirst: 'Select an item first',
  qtyZero: 'Quantity must be more than zero',
  saved: (no: string) => `Stock Journal ${no} saved`,
  updated: (no: string) => `Stock Journal ${no} updated`,
  cancelled: (no: string) => `Stock Journal ${no} cancelled`,
  shownCancelled: (no: string) => `${no} is cancelled - shown for reference only`,
  cancelConfirm: (no: string) =>
    `Cancel stock journal ${no}?\n\nThe voucher stays in the books marked "Cancelled" for audit. Its stock movement is reversed.`,
  noLines: 'No items added yet',
  noJournals: 'No stock journals yet',
} as const;

/** The first problem with a stock journal, or null. */
export function stockJournalProblem(
  h: { date: string; fyFrom: string | null; fyTo: string | null; fyLabel: string },
  lines: StjLine[],
): string | null {
  const m = stockJournalMessages;
  if (h.fyFrom && h.fyTo && (h.date < h.fyFrom || h.date > h.fyTo)) return m.outsideYear(h.fyLabel);
  if (!lines.length) return m.noItems;
  for (const l of lines) {
    if (!l.itemCode.trim()) return m.lineNoItem;
    if (l.qty <= 0) return m.lineQty(l.itemName);
    if (l.rate < 0) return m.lineRate(l.itemName);
  }
  return null;
}
