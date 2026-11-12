// Stock Register (user's request, 2026-11-11; MDA has none): each item's movements in a period,
// run like a ledger. Opening = the item's opening stock + every movement before From; each row
// carries the stock balance after it; Closing = the real stock at To. "Show" only hides rows:
// Purchase shows Purchase Invoices and Purchase Returns, Sales shows Sales Invoices and Sales
// Returns, and the balances stay the item's real stock (docs/design/REPORTS.md).

export const REGISTER_SHOW = ['all', 'purchase', 'sales'] as const;
export type RegisterShow = (typeof REGISTER_SHOW)[number];

export const REGISTER_SHOW_LABELS: Record<RegisterShow, string> = {
  all: 'All',
  purchase: 'Purchase',
  sales: 'Sales',
};

const SHOWN_TYPES: Record<Exclude<RegisterShow, 'all'>, readonly string[]> = {
  purchase: ['PUR', 'PRT'],
  sales: ['SAL', 'SRT'],
};

/** One stock movement, oldest first. */
export type RegisterMove = {
  date: string;
  vchrType: string;
  billNo: string;
  particulars: string;
  inQty: number;
  outQty: number;
  rate: number;
  amount: number;
};

export type RegisterLine = RegisterMove & { balance: number };

export type RegisterItem = {
  code: string;
  name: string;
  unit: string;
  opening: number;
  /** Inward and outward of the rows shown. */
  inward: number;
  outward: number;
  amountIn: number;
  amountOut: number;
  /** The real stock at the period's end, whatever is shown. */
  closing: number;
  lines: RegisterLine[];
};

const r3 = (n: number) => Math.round(n * 1000) / 1000;

export function registerItem(
  item: { code: string; name: string; unit: string; opQty: number },
  moves: RegisterMove[],
  from: string,
  show: RegisterShow,
): RegisterItem {
  let balance = item.opQty;
  for (const m of moves) if (m.date < from) balance += m.inQty - m.outQty;
  const opening = r3(balance);
  const lines: RegisterLine[] = [];
  for (const m of moves) {
    if (m.date < from) continue;
    balance += m.inQty - m.outQty;
    if (show === 'all' || SHOWN_TYPES[show].includes(m.vchrType))
      lines.push({ ...m, balance: r3(balance) });
  }
  const sum = (f: (l: RegisterLine) => number) => lines.reduce((a, l) => a + f(l), 0);
  return {
    code: item.code,
    name: item.name,
    unit: item.unit,
    opening,
    inward: r3(sum((l) => l.inQty)),
    outward: r3(sum((l) => l.outQty)),
    amountIn: Math.round(sum((l) => (l.inQty ? l.amount : 0)) * 100) / 100,
    amountOut: Math.round(sum((l) => (l.outQty ? l.amount : 0)) * 100) / 100,
    closing: r3(balance),
    lines,
  };
}
