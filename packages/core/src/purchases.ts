// Purchase Invoice, ported from MDA-Inventory lib/purchase_service.dart (PurcLine, PurcTotals,
// _validate) and the GST maths it uses, GstCalculator (posting_service.dart:90-140).
// docs/LOGIC-SPEC.md §4.3, §5, §5.2, §6.2, §9.

import { round2, roundOff } from './round.ts';

// ── GST (GstCalculator) ─────────────────────────────────────────────────────────

/** Different states → IGST; same state, or either one unknown → CGST + SGST. */
export const isInterState = (company?: string | null, party?: string | null): boolean => {
  const a = (company ?? '').trim();
  const b = (party ?? '').trim();
  if (!a || !b) return false;
  return a !== b;
};

/** A party's state code: the stored one, else the first two characters of its GSTIN. */
export const partyStateCode = (stored?: string | null, gstin?: string | null): string => {
  const s = (stored ?? '').trim();
  if (s) return s;
  const g = (gstin ?? '').trim();
  return g.length >= 2 ? g.substring(0, 2) : '';
};

/** An item master's GST rate ("18%", "5", "") as a number. */
export const gstRateNumber = (raw?: string | number | null): number => {
  const n = Number(
    String(raw ?? '')
      .replace(/%/g, '')
      .trim(),
  );
  return Number.isFinite(n) ? n : 0;
};

export type GstSplit = {
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  cess: number;
  total: number;
};

export function gstCompute(p: {
  qty: number;
  rate: number;
  discPct?: number;
  discAmt?: number;
  gstRate?: number;
  cessRate?: number;
  interState: boolean;
}): GstSplit {
  const discPct = p.discPct ?? 0;
  const gross = round2(p.qty * p.rate);
  const discount = discPct > 0 ? round2((gross * discPct) / 100) : round2(p.discAmt ?? 0);
  const taxable = round2(gross - discount);
  const gstAmount = round2((taxable * (p.gstRate ?? 0)) / 100);
  const cess = round2((taxable * (p.cessRate ?? 0)) / 100);
  const igst = p.interState ? gstAmount : 0;
  // Halve the total GST so the two halves add back to the same figure; SGST takes the odd paisa.
  const cgst = p.interState ? 0 : round2(gstAmount / 2);
  const sgst = p.interState ? 0 : round2(gstAmount - cgst);
  return { taxable, cgst, sgst, igst, cess, total: round2(taxable + cgst + sgst + igst + cess) };
}

// ── Lines and totals (PurcLine, PurcTotals) ─────────────────────────────────────

/** One row of the "Purchased Item Detail" grid, as PurcDetail stores it. */
export type PurcLine = {
  itemCode: string;
  itemName: string;
  hsnNo: string | null;
  unit: string | null;
  /** Godown name. */
  location: string | null;
  qty: number;
  rate: number;
  disP: number;
  disA: number;
  /** Taxable value after discount. */
  amount: number;
  sgstP: number;
  sgstA: number;
  cgstP: number;
  cgstA: number;
  igstP: number;
  igstA: number;
  lineTotal: number;
};

/** `PurcLine.compute`: a line from raw entry values, with the GST split for the supply type. */
export function purcLine(p: {
  itemCode: string;
  itemName: string;
  hsnNo?: string | null;
  unit?: string | null;
  location?: string | null;
  qty: number;
  rate: number;
  disP?: number;
  disA?: number;
  gstRate: number;
  interState: boolean;
}): PurcLine {
  const disP = p.disP ?? 0;
  const disA = p.disA ?? 0;
  const split = gstCompute({
    qty: p.qty,
    rate: p.rate,
    discPct: disP,
    discAmt: disA,
    gstRate: p.gstRate,
    interState: p.interState,
  });
  const half = round2(p.gstRate / 2);
  return {
    itemCode: p.itemCode,
    itemName: p.itemName,
    hsnNo: p.hsnNo ?? null,
    unit: p.unit ?? null,
    location: p.location ?? null,
    qty: p.qty,
    rate: p.rate,
    disP,
    // The percentage wins, and its amount is what gets stored.
    disA: disP > 0 ? round2((round2(p.qty * p.rate) * disP) / 100) : disA,
    amount: split.taxable,
    sgstP: p.interState ? 0 : half,
    sgstA: split.sgst,
    cgstP: p.interState ? 0 : half,
    cgstA: split.cgst,
    igstP: p.interState ? p.gstRate : 0,
    igstA: split.igst,
    lineTotal: split.total,
  };
}

export type PurcTotals = {
  qty: number;
  subTotal: number;
  /** Σ line discounts, shown only; there is no bill-level discount on a purchase. */
  discount: number;
  sgst: number;
  cgst: number;
  igst: number;
  roundOff: number;
  net: number;
};

export function purcTotals(lines: PurcLine[]): PurcTotals {
  const total = (f: (l: PurcLine) => number) => round2(lines.reduce((a, l) => a + f(l), 0));
  const subTotal = total((l) => l.amount);
  const sgst = total((l) => l.sgstA);
  const cgst = total((l) => l.cgstA);
  const igst = total((l) => l.igstA);
  const gross = round2(subTotal + sgst + cgst + igst);
  const round = roundOff(gross);
  return {
    qty: total((l) => l.qty),
    subTotal,
    discount: total((l) => l.disA),
    sgst,
    cgst,
    igst,
    roundOff: round,
    net: round2(gross + round),
  };
}

// ── Ledgers, groups and numbering ───────────────────────────────────────────────

/** The system ledgers a purchase posts to (PurcLedgers). */
export const PURCHASE_LEDGERS = {
  purchase: 'PUR001',
  inputCgst: 'TAX001',
  inputSgst: 'TAX002',
  inputIgst: 'TAX003',
  roundOff: 'TAX007',
} as const;

/** What `_ensureLedgers` creates when a book is missing one: ledger → name, group, Dr/Cr. */
export const PURCHASE_LEDGER_SEEDS: Record<string, [name: string, group: string, drCr: string]> = {
  PUR001: ['Purchase A/c', 'E003', 'Dr'],
  TAX001: ['Input CGST', 'L005', 'Dr'],
  TAX002: ['Input SGST', 'L005', 'Dr'],
  TAX003: ['Input IGST', 'L005', 'Dr'],
  TAX007: ['Round Off', 'E002', 'Dr'],
};
/** …and the group each sits under, created first if it's missing too: name, type, parent. */
export const PURCHASE_GROUP_SEEDS: Record<string, [name: string, type: string, parent: string]> = {
  L005: ['Duties & Taxes', 'Liabilities', 'L004'],
  E003: ['Purchase Accounts', 'Expenses', 'Parent'],
  E002: ['Indirect Expenses', 'Expenses', 'Parent'],
};

/** The bill-number series (`PURBILL`, default PB- and 4 digits). Its LastNo is never moved on
 *  save, so numbering runs on the highest bill + 1 (Q-08). */
export const PURCHASE_BILL_SERIES = { type: 'PURBILL', prefix: 'PB-', width: 4 } as const;

/** Suppliers are the ledgers in Sundry Creditors or in a group directly under it. */
export const SUPPLIER_GROUP = 'L007';

// ── Wording (purchase_service.dart, purchase_invoice_page.dart) ─────────────────

export const purchaseMessages = {
  billNoRequired: 'Purchase No. is required.',
  selectSupplier: 'Select a supplier.',
  outsideYear: (label: string) => `Purchase date is outside the open financial year (${label}).`,
  noItems: 'Add at least one item.',
  lineNoItem: 'Every line must have an item.',
  lineQty: (name: string) => `Quantity must be more than zero for ${name}.`,
  lineRate: (name: string) => `Rate cannot be negative for ${name}.`,
  lineDiscount: (name: string) => `Discount is more than the value of ${name}.`,
  zero: 'Purchase value cannot be zero.',
  billUsed: (no: string) =>
    `Purchase No. "${no}" already exists. Save again to take the next free number.`,
  unbalanced: (diff: number) => `Purchase does not balance. Difference: ${diff.toFixed(2)}`,
  notFound: 'Purchase not found.',
  cancelledEdit: 'A cancelled purchase cannot be edited.',
  // The page's own messages.
  selectItemFirst: 'Select an item first',
  qtyZero: 'Quantity must be more than zero',
  supplierFirst: 'Select the supplier first - it decides CGST/SGST vs IGST',
  supplierRequired: 'Supplier is required',
  noSuppliers:
    'No supplier ledgers found. Create them under Masters > Ledger Creation with the group "Sundry Creditors".',
  noSuppliersHint: 'No ledgers under Sundry Creditors',
  saved: (no: string, net: number) => `Purchase ${no} saved  -  Net ${net.toFixed(2)}`,
  updated: (no: string) => `Purchase ${no} updated`,
  cancelled: (no: string) => `Purchase ${no} cancelled`,
  shownCancelled: (no: string) => `Bill ${no} is cancelled - shown for reference only`,
  cancelConfirm: (no: string) =>
    `Cancel purchase ${no}?\n\nThe bill stays in the books marked "Cancelled" for audit. Its stock and ledger effect are reversed.`,
  noLines: 'No items added yet',
  noPurchases: 'No purchases yet',
} as const;

export type PurcHeaderCheck = {
  billNo: string;
  suppCode: string;
  /** yyyy-MM-dd */
  billDate: string;
  fyFrom: string | null;
  fyTo: string | null;
  fyLabel: string;
};

/** `_validate`: the first problem with a purchase, in MDA's order, or null. */
export function purchaseProblem(h: PurcHeaderCheck, lines: PurcLine[]): string | null {
  const m = purchaseMessages;
  if (!h.billNo.trim()) return m.billNoRequired;
  if (!h.suppCode.trim()) return m.selectSupplier;
  if (h.fyFrom && h.fyTo && (h.billDate < h.fyFrom || h.billDate > h.fyTo))
    return m.outsideYear(h.fyLabel);
  if (!lines.length) return m.noItems;
  for (const l of lines) {
    if (!l.itemCode.trim()) return m.lineNoItem;
    if (l.qty <= 0) return m.lineQty(l.itemName);
    if (l.rate < 0) return m.lineRate(l.itemName);
    if (l.amount < 0) return m.lineDiscount(l.itemName);
  }
  if (purcTotals(lines).net <= 0) return m.zero;
  return null;
}

/** `_postLedger`'s double entry: Dr Purchase A/c and Input GST, Dr/Cr Round Off, Cr supplier.
 *  Lines under half a paisa are left out. */
export function purchasePosting(
  suppCode: string,
  t: PurcTotals,
  interState: boolean,
): { accCode: string; dr: number; cr: number }[] {
  const L = PURCHASE_LEDGERS;
  const out: { accCode: string; dr: number; cr: number }[] = [];
  const dr = (accCode: string, v: number) => {
    if (Math.abs(v) >= 0.005) out.push({ accCode, dr: v, cr: 0 });
  };
  const cr = (accCode: string, v: number) => {
    if (Math.abs(v) >= 0.005) out.push({ accCode, dr: 0, cr: v });
  };
  dr(L.purchase, t.subTotal);
  if (interState) dr(L.inputIgst, t.igst);
  else {
    dr(L.inputCgst, t.cgst);
    dr(L.inputSgst, t.sgst);
  }
  if (t.roundOff > 0) dr(L.roundOff, t.roundOff);
  else if (t.roundOff < 0) cr(L.roundOff, -t.roundOff);
  cr(suppCode, t.net);
  return out;
}

/** Two decimals, as the screen shows every figure (`_f`). */
export const f2 = (v: number) => v.toFixed(2);
