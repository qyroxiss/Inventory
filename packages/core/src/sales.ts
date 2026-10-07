// Sales Invoice, ported from MDA-Inventory lib/sale_service.dart (SaleLine, SaleTotals,
// _validate, _postLedger) and lib/sale_type_service.dart (billPrefix). docs/LOGIC-SPEC.md §4.3,
// §5.1, §6.1, §9. A sale line is computed exactly as a purchase line (`SaleLine.compute` and
// `PurcLine.compute` are the same code), so `purcLine` serves both.

import { round2, roundOff } from './round.ts';
import { purcLine, type PurcLine } from './purchases.ts';

export type SaleLine = PurcLine;
export const saleLine = purcLine;

export type SaleTotals = {
  qty: number;
  subTotal: number;
  /** Σ line discounts, shown only ("Discount On Items"). */
  itemDisc: number;
  /** The bill-level discount, taken after tax. */
  billDisc: number;
  sgst: number;
  cgst: number;
  igst: number;
  roundOff: number;
  net: number;
};

/** `SaleTotals.of`: the bill discount % wins over its amount, and comes off after tax. */
export function saleTotals(lines: SaleLine[], billDiscPct = 0, billDiscAmt = 0): SaleTotals {
  const total = (f: (l: SaleLine) => number) => round2(lines.reduce((a, l) => a + f(l), 0));
  const subTotal = total((l) => l.amount);
  const sgst = total((l) => l.sgstA);
  const cgst = total((l) => l.cgstA);
  const igst = total((l) => l.igstA);
  const gross = round2(subTotal + sgst + cgst + igst);
  const billDisc = billDiscPct > 0 ? round2((gross * billDiscPct) / 100) : round2(billDiscAmt);
  const afterDisc = round2(gross - billDisc);
  const round = roundOff(afterDisc);
  return {
    qty: total((l) => l.qty),
    subTotal,
    itemDisc: total((l) => l.disA),
    billDisc,
    sgst,
    cgst,
    igst,
    roundOff: round,
    net: round2(afterDisc + round),
  };
}

/** The system ledgers a sale posts to (SaleLedgers). */
export const SALE_LEDGERS = {
  sales: 'SAL001',
  outputCgst: 'TAX004',
  outputSgst: 'TAX005',
  outputIgst: 'TAX006',
  roundOff: 'TAX007',
  discAllowed: 'SAL002',
} as const;

/** What `_ensureLedgers` creates when a book is missing one: ledger → name, group, Dr/Cr. */
export const SALE_LEDGER_SEEDS: Record<string, [name: string, group: string, drCr: string]> = {
  SAL001: ['Sales A/c', 'I003', 'Cr'],
  TAX004: ['Output CGST', 'L005', 'Cr'],
  TAX005: ['Output SGST', 'L005', 'Cr'],
  TAX006: ['Output IGST', 'L005', 'Cr'],
  TAX007: ['Round Off', 'E002', 'Dr'],
  SAL002: ['Discount Allowed', 'E002', 'Dr'],
};
/** …and their groups, created first when missing: name, type, parent. */
export const SALE_GROUP_SEEDS: Record<string, [name: string, type: string, parent: string]> = {
  L005: ['Duties & Taxes', 'Liabilities', 'L004'],
  I003: ['Sales Accounts', 'Income', 'Parent'],
  E002: ['Indirect Expenses', 'Expenses', 'Parent'],
  A003: ['Cash-in-Hand', 'Assets', 'A001'],
};
/** A cash sale is debited to the first Cash-in-Hand ledger by code; a book with none gets this
 *  one (Q-30). */
export const CASH_SALE_LEDGER = { code: 'CASH001', name: 'Cash', group: 'A003' } as const;

/** Customers are the ledgers in Sundry Debtors or in a group directly under it. */
export const CUSTOMER_GROUP = 'A007';

/** The bill-number series (`SALEBILL`, default SB- and 4 digits). */
export const SALE_BILL_SERIES = { type: 'SALEBILL', prefix: 'SB-', width: 4 } as const;

/** A sale type's prefix as the numbering wants it: "CS" → "CS-"; null when it has none, so the
 *  standard series is used. */
export const saleBillPrefix = (prefix?: string | null): string | null => {
  const p = (prefix ?? '').trim();
  if (!p) return null;
  return p.endsWith('-') ? p : `${p}-`;
};

export const saleMessages = {
  billNoRequired: 'Bill No. is required.',
  customerNameRequired: 'Customer name is required.',
  creditNeedsLedger: 'A credit sale must be booked against a customer ledger.',
  outsideYear: (label: string) => `Bill date is outside the open financial year (${label}).`,
  noItems: 'Add at least one item.',
  lineNoItem: 'Every line must have an item.',
  lineQty: (name: string) => `Quantity must be more than zero for ${name}.`,
  lineRate: (name: string) => `Rate cannot be negative for ${name}.`,
  lineDiscount: (name: string) => `Discount is more than the value of ${name}.`,
  zero: 'Bill value cannot be zero or negative.',
  billUsed: (no: string) =>
    `Bill No. "${no}" already exists. Save again to take the next free number.`,
  unbalanced: (diff: number) => `Sale does not balance. Difference: ${diff.toFixed(2)}`,
  creditNoCustomer: 'A credit sale needs a customer ledger.',
  notFound: 'Sale not found.',
  cancelledEdit: 'A cancelled sale cannot be edited.',
  notEnoughStock: (name: string, needed: number, inHand: number) =>
    `Not enough stock for ${name}: ${needed.toFixed(2)} needed, ${inHand.toFixed(2)} in hand.`,
  // The page's own messages.
  selectItemFirst: 'Select an item first',
  qtyZero: 'Required Qty must be more than zero',
  saleTypeRequired: 'Sale type is required',
  customerRequired: 'Customer is required',
  noSaleTypes: 'No sale types found. Create them under Masters > Inventory Masters > Sale Type.',
  noSaleTypesHint: 'No sale types defined',
  noCustomersHint: 'No ledgers under Sundry Debtors',
  saved: (no: string, net: number) => `Sale ${no} saved  -  Grand Total ${net.toFixed(2)}`,
  updated: (no: string) => `Sale ${no} updated`,
  cancelled: (no: string) => `Sale ${no} cancelled`,
  shownCancelled: (no: string) => `Bill ${no} is cancelled - shown for reference only`,
  cancelConfirm: (no: string) =>
    `Cancel sale ${no}?\n\nThe bill stays in the books marked "Cancelled" for audit. The goods go back into stock and the ledger entry is reversed.`,
  printLater: 'Sale printing arrives with the report module',
  noLines: 'No items added yet',
  noSales: 'No sales yet',
} as const;

export type SaleHeaderCheck = {
  billNo: string;
  custName: string;
  custCode: string | null;
  isCash: boolean;
  /** yyyy-MM-dd */
  billDate: string;
  fyFrom: string | null;
  fyTo: string | null;
  fyLabel: string;
  billDiscPct: number;
  billDiscAmt: number;
};

/** `_validate`: the first problem with a sale, in MDA's order, or null. */
export function saleProblem(h: SaleHeaderCheck, lines: SaleLine[]): string | null {
  const m = saleMessages;
  if (!h.billNo.trim()) return m.billNoRequired;
  if (!h.custName.trim()) return m.customerNameRequired;
  if (!h.isCash && !(h.custCode ?? '').trim()) return m.creditNeedsLedger;
  if (h.fyFrom && h.fyTo && (h.billDate < h.fyFrom || h.billDate > h.fyTo))
    return m.outsideYear(h.fyLabel);
  if (!lines.length) return m.noItems;
  for (const l of lines) {
    if (!l.itemCode.trim()) return m.lineNoItem;
    if (l.qty <= 0) return m.lineQty(l.itemName);
    if (l.rate < 0) return m.lineRate(l.itemName);
    if (l.amount < 0) return m.lineDiscount(l.itemName);
  }
  if (saleTotals(lines, h.billDiscPct, h.billDiscAmt).net <= 0) return m.zero;
  return null;
}

/** `_postLedger`'s double entry: Dr the customer (or cash) the net and Discount Allowed the bill
 *  discount; Cr Sales A/c and Output GST; Round Off on whichever side balances. */
export function salePosting(
  debtor: string,
  t: SaleTotals,
  interState: boolean,
): { accCode: string; dr: number; cr: number }[] {
  const L = SALE_LEDGERS;
  const out: { accCode: string; dr: number; cr: number }[] = [];
  const dr = (accCode: string, v: number) => {
    if (Math.abs(v) >= 0.005) out.push({ accCode, dr: v, cr: 0 });
  };
  const cr = (accCode: string, v: number) => {
    if (Math.abs(v) >= 0.005) out.push({ accCode, dr: 0, cr: v });
  };
  dr(debtor, t.net);
  dr(L.discAllowed, t.billDisc);
  cr(L.sales, t.subTotal);
  if (interState) cr(L.outputIgst, t.igst);
  else {
    cr(L.outputCgst, t.cgst);
    cr(L.outputSgst, t.sgst);
  }
  if (t.roundOff > 0) cr(L.roundOff, t.roundOff);
  else if (t.roundOff < 0) dr(L.roundOff, -t.roundOff);
  return out;
}
