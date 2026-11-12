// Purchase Return (PRT) and Sales Return (SRT). MDA seeds both number series but never built the
// pages; added at the user's request (2026-11-09). Decisions taken with the user:
//   - A return is always made against one of the party's bills: its lines load, and each can be
//     returned up to what was billed less what earlier returns took.
//   - Rate, discount, GST rate and the CGST + SGST / IGST split come from that bill.
//   - Returns post to their own ledgers, "Purchase Return" and "Sales Return".
//   - Printed as "Debit Note" (purchase return) and "Credit Note" (sales return).
//   - The GST reports count them (credit/debit notes in GSTR-1, net in GSTR-3B, less ITC).

import { purcLine, purcTotals, type PurcLine, type PurcTotals } from './purchases.ts';
import { round2 } from './round.ts';
import { saleTotals, type SaleTotals } from './sales.ts';

export type ReturnKind = 'PRT' | 'SRT';

/** The returns' own ledgers, created when a book is missing them: name, group, Dr/Cr. */
export const RETURN_LEDGERS = { purchaseReturn: 'PUR003', salesReturn: 'SAL003' } as const;
export const RETURN_LEDGER_SEEDS: Record<string, [name: string, group: string, drCr: string]> = {
  PUR003: ['Purchase Return', 'E003', 'Cr'],
  SAL003: ['Sales Return', 'I003', 'Dr'],
};

/** A line of the original bill, as the return screen offers it. */
export type BillLineForReturn = PurcLine & {
  /** The bill's line number; a return line points back at it. */
  lineNo: number;
  /** Already taken back by other active returns against this bill. */
  returned: number;
  /** What can still be returned. */
  left: number;
};

/** The return line for `qty` of a bill line: same rate, GST rate and split; a percentage
 *  discount stays a percentage, an amount discount is shared out by quantity. */
export function returnLine(src: PurcLine, qty: number, interState: boolean): PurcLine {
  const share = src.qty > 0 ? qty / src.qty : 0;
  return purcLine({
    itemCode: src.itemCode,
    itemName: src.itemName,
    hsnNo: src.hsnNo,
    unit: src.unit,
    location: src.location,
    qty,
    rate: src.rate,
    disP: src.disP,
    disA: src.disP > 0 ? 0 : round2(src.disA * share),
    gstRate: round2(src.sgstP + src.cgstP + src.igstP),
    interState,
  });
}

/** The bill discount a sale gave, as a percentage of its gross, so a sales return gives back
 *  the same share (a percentage as typed, or an amount turned into one). */
export function saleBillDiscPct(billDiscPct: number, billDiscAmt: number, gross: number): number {
  if (billDiscPct > 0) return billDiscPct;
  return billDiscAmt > 0 && gross > 0 ? (billDiscAmt / gross) * 100 : 0;
}

export type ReturnTotals = {
  qty: number;
  subTotal: number;
  sgst: number;
  cgst: number;
  igst: number;
  /** A sales return's share of the bill discount; 0 on a purchase return. */
  billDisc: number;
  roundOff: number;
  net: number;
};

export function returnTotals(kind: ReturnKind, lines: PurcLine[], billDiscPct = 0): ReturnTotals {
  if (kind === 'SRT') {
    const t: SaleTotals = saleTotals(lines, billDiscPct);
    return { ...pick(t), billDisc: t.billDisc };
  }
  const t: PurcTotals = purcTotals(lines, 0);
  return { ...pick(t), billDisc: 0 };
}
const pick = (t: { qty: number; subTotal: number; sgst: number; cgst: number; igst: number; roundOff: number; net: number }) => ({
  qty: t.qty,
  subTotal: t.subTotal,
  sgst: t.sgst,
  cgst: t.cgst,
  igst: t.igst,
  roundOff: t.roundOff,
  net: t.net,
}); // prettier-ignore

type Posting = { accCode: string; dr: number; cr: number }[];

/** Purchase return, the purchase turned round: Dr the supplier; Cr Purchase Return and the
 *  input tax taken on the bill. */
export function purchaseReturnPosting(
  suppCode: string,
  t: ReturnTotals,
  interState: boolean,
): Posting {
  const out: Posting = [];
  const dr = (accCode: string, v: number) => {
    if (Math.abs(v) >= 0.005) out.push({ accCode, dr: v, cr: 0 });
  };
  const cr = (accCode: string, v: number) => {
    if (Math.abs(v) >= 0.005) out.push({ accCode, dr: 0, cr: v });
  };
  dr(suppCode, t.net);
  cr(RETURN_LEDGERS.purchaseReturn, t.subTotal);
  if (interState) cr('TAX003', t.igst);
  else {
    cr('TAX001', t.cgst);
    cr('TAX002', t.sgst);
  }
  if (t.roundOff > 0) cr('TAX007', t.roundOff);
  else if (t.roundOff < 0) dr('TAX007', -t.roundOff);
  return out;
}

/** Sales return, the sale turned round: Dr Sales Return and the output tax charged; Cr the
 *  customer (or Cash, for a cash sale) and the share of the bill discount given back. */
export function salesReturnPosting(debtor: string, t: ReturnTotals, interState: boolean): Posting {
  const out: Posting = [];
  const dr = (accCode: string, v: number) => {
    if (Math.abs(v) >= 0.005) out.push({ accCode, dr: v, cr: 0 });
  };
  const cr = (accCode: string, v: number) => {
    if (Math.abs(v) >= 0.005) out.push({ accCode, dr: 0, cr: v });
  };
  dr(RETURN_LEDGERS.salesReturn, t.subTotal);
  if (interState) dr('TAX006', t.igst);
  else {
    dr('TAX004', t.cgst);
    dr('TAX005', t.sgst);
  }
  if (t.roundOff > 0) dr('TAX007', t.roundOff);
  else if (t.roundOff < 0) cr('TAX007', -t.roundOff);
  cr('SAL002', t.billDisc);
  cr(debtor, t.net);
  return out;
}

export const returnMessages = {
  title: (k: ReturnKind) => (k === 'PRT' ? 'Purchase Return' : 'Sales Return'),
  noteTitle: (k: ReturnKind) => (k === 'PRT' ? 'Debit Note' : 'Credit Note'),
  partyRequired: (k: ReturnKind) => (k === 'PRT' ? 'Supplier is required' : 'Customer is required'),
  billRequired: 'Select the bill the goods are returned against',
  nothingReturned: 'Enter the quantity returned for at least one item',
  tooMuch: (name: string, left: number) => `Only ${left} of ${name} can still be returned.`,
  outsideYear: (label: string) => `Return date is outside the open financial year (${label}).`,
  beforeBill: 'The return date cannot be before the bill date.',
  billNotFound: 'The bill was not found.',
  billCancelled: 'That bill is cancelled; goods cannot be returned against it.',
  noUsed: (no: string) => `Return No. "${no}" already exists. Save again to take the next number.`,
  notFound: 'Return not found.',
  cancelledEdit: 'A cancelled return cannot be edited.',
  unbalanced: (diff: number) => `Return does not balance. Difference: ${diff.toFixed(2)}`,
  saved: (k: ReturnKind, no: string, net: number) =>
    `${returnMessages.title(k)} ${no} saved  -  Net ${net.toFixed(2)}`,
  updated: (k: ReturnKind, no: string) => `${returnMessages.title(k)} ${no} updated`,
  cancelled: (k: ReturnKind, no: string) => `${returnMessages.title(k)} ${no} cancelled`,
  cancelConfirm: (k: ReturnKind, no: string) =>
    `Cancel ${returnMessages.title(k).toLowerCase()} ${no}?\n\nIt stays in the books marked "Cancelled" for audit. Its stock and ledger effect are reversed.`,
  shownCancelled: (no: string) => `Return ${no} is cancelled - shown for reference only`,
  noBills: (k: ReturnKind) =>
    k === 'PRT' ? 'This supplier has no purchase bills' : 'This customer has no sale bills',
  noReturns: 'No returns yet',
} as const;
