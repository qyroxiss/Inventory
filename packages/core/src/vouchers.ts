// Accounting Vouchers, ported from MDA-Inventory lib/posting_service.dart (the posting gate and
// numbering), lib/accounting_vouchers_page.dart (the five tabs and how each builds its lines),
// lib/voucher_print.dart (amount in words) and the seeds in lib/db_service.dart:827-1019.
// docs/LOGIC-SPEC.md §4.2, §6.3-6.9, §9, §13.

import { round2 } from './round.ts';

/** Voucher types and their seeded series (db_service.dart:827-850): code, name, prefix. */
export const VOUCHER_SERIES: [type: string, name: string, prefix: string, width: number][] = [
  ['RCP', 'Cash Receipt', 'RCP-', 3],
  ['BNK', 'Bank Receipt', 'BNK-', 3],
  ['PAY', 'Cash Payment', 'PAY-', 3],
  ['BPAY', 'Bank Payment', 'BPAY-', 3],
  ['JNL', 'Journal Voucher', 'JNL-', 3],
  ['DRN', 'Debit Note', 'DRN-', 3],
  ['CRN', 'Credit Note', 'CRN-', 3],
  ['PUR', 'Purchase Invoice', 'PUR-', 3],
  ['SAL', 'Sales Invoice', 'SAL-', 3],
  ['PRT', 'Purchase Return', 'PRT-', 3],
  ['SRT', 'Sales Return', 'SRT-', 3],
  ['STJ', 'Stock Journal', 'STJ-', 3],
  ['PURBILL', 'Purchase Bill No', 'PB-', 4],
  ['SALEBILL', 'Sale Bill No', 'SB-', 4],
];

/** System ledgers seeded into every book, only under groups the book has (db_service.dart:988-1019). */
export const SYSTEM_LEDGERS: [code: string, name: string, group: string][] = [
  ['TAX001', 'Input CGST', 'L005'],
  ['TAX002', 'Input SGST', 'L005'],
  ['TAX003', 'Input IGST', 'L005'],
  ['TAX004', 'Output CGST', 'L005'],
  ['TAX005', 'Output SGST', 'L005'],
  ['TAX006', 'Output IGST', 'L005'],
  ['TAX007', 'Round Off', 'E002'],
  ['SAL001', 'Sales A/c', 'I003'],
  ['PUR001', 'Purchase A/c', 'E003'],
];
/** DrCr of a seeded ledger: Cr under an Income group, otherwise Dr. */
export const systemLedgerDrCr = (group: string) => (group.startsWith('I') ? 'Cr' : 'Dr');

/** Group codes the voucher tabs read (accounting_vouchers_page.dart). */
export const CASH_GROUP = 'A003';
export const BANK_GROUP = 'A002';
/** Debit notes are raised against Sundry Creditors, credit notes for Sundry Debtors. */
export const CREDITORS_GROUP = 'L007';
export const DEBTORS_GROUP = 'A007';

export const DN_REASONS = [
  'Purchase Return',
  'Price Difference',
  'Short Supply',
  'Damaged Goods',
  'Other',
];
export const CN_REASONS = [
  'Sales Return',
  'Price Difference',
  'Excess Supply',
  'Discount Given',
  'Other',
];

export const CANCELLED = 'Cancelled';
export const ACTIVE = 'Active';

/** The posting gate's messages, verbatim (posting_service.dart:436-475). */
export const postingMessages = {
  typeMissing: 'Voucher type is missing.',
  outsideYear: (label: string) => `Voucher date is outside the open financial year (${label}).`,
  noLines: 'A voucher needs at least one ledger line.',
  lineNoLedger: 'Every line must have a ledger selected.',
  negative: 'Amounts cannot be negative.',
  bothSides: (code: string) => `A line cannot be both debit and credit (${code}).`,
  zero: 'Voucher amount cannot be zero.',
  unbalanced: (diff: number) => `Debit and credit do not match. Difference: ${diff.toFixed(2)}`,
  numberUsed: (no: string) =>
    `Voucher number "${no}" is already used. Save again to take the next free number.`,
  notFound: 'Voucher not found.',
  cancelledEdit: 'A cancelled voucher cannot be edited.',
};

export type PostingLine = { accCode: string; dr: number; cr: number; narration?: string };

/** The posting gate (posting_service.dart:436-475). Returns the first problem, or null. */
export function postingProblem(input: {
  vchrType: string;
  date: string;
  fyFrom: string | null;
  fyTo: string | null;
  fyLabel: string;
  lines: PostingLine[];
}): string | null {
  if (!input.vchrType.trim()) return postingMessages.typeMissing;
  const { fyFrom, fyTo } = input;
  if (fyFrom && fyTo && (input.date < fyFrom || input.date > fyTo)) {
    return postingMessages.outsideYear(input.fyLabel);
  }
  if (!input.lines.length) return postingMessages.noLines;
  for (const l of input.lines) {
    if (!l.accCode.trim()) return postingMessages.lineNoLedger;
    if (l.dr < 0 || l.cr < 0) return postingMessages.negative;
    if (l.dr > 0 && l.cr > 0) return postingMessages.bothSides(l.accCode);
  }
  const dr = sum(input.lines.map((l) => l.dr));
  const cr = sum(input.lines.map((l) => l.cr));
  if (dr <= 0) return postingMessages.zero;
  if (Math.abs(dr - cr) >= 0.005) return postingMessages.unbalanced(Math.abs(dr - cr));
  return null;
}

/** MDA's `_sum`: added up, then rounded to paise. */
export const sum = (values: number[]) => round2(values.reduce((a, b) => a + b, 0));

/** The confirmation every tab shows before cancelling (accounting_vouchers_page.dart:68-88). */
export const cancelConfirm = (what: string) =>
  `Cancel ${what}?\n\nThe voucher stays in the books marked "Cancelled" so the audit trail is preserved, and it stops affecting balances and stock.`;

/** Each tab's own words (accounting_vouchers_page.dart). */
export const voucherMessages = {
  selectAccount: 'Select account',
  selectParty: 'Select party',
  selectPartyNote: 'Select a party',
  selectLedger: 'Select ledger',
  selectReason: 'Select reason',
  required: 'Required',
  validAmount: 'Enter valid amount',
  invalid: 'Invalid',
  noAccounts: (bank: boolean) => `No ${bank ? 'bank' : 'cash'} accounts — create ledger first`,
  notBalanced: (diff: string) => `Not balanced. Difference: ₹${diff}`,
  saved: (what: string, no: string) => `${what} ${no} saved`,
  updated: (what: string, no: string) => `${what} ${no} updated`,
  cancelled: (what: string, no: string) => `${what} ${no} cancelled`,
  printLater: (what: string) => `${what} printing arrives with the report module`,
  noReceipts: (filter: string) =>
    `No ${filter === 'All' ? '' : `${filter.toLowerCase()} `}receipt vouchers found.`,
  noPayments: (filter: string) =>
    `No ${filter === 'All' ? '' : `${filter.toLowerCase()} `}payment vouchers found.`,
  noVouchers: 'No vouchers found',
};

/** MDA's on-screen total: whole rupees without decimals, otherwise two places. */
export const fmtTotal = (v: number) => (v === Math.trunc(v) ? v.toFixed(0) : v.toFixed(2));

// ── How each tab builds its voucher (accounting_vouchers_page.dart) ────────────────

export type VoucherDraft = {
  vchrType: string;
  partyCode: string | null;
  lines: PostingLine[];
  /** Written on Save only; Update replaces the lines but writes no bill reference (Q-43). */
  bills: { accCode: string; billNo: string; refType: string; amount: number }[];
};

/** Receipt: money comes in. Dr the cash/bank account, Cr the party (lines 504-533). */
export const receiptDraft = (bank: boolean, accDr: string, accCr: string, amount: number, vchrNo: string): VoucherDraft => ({
  vchrType: bank ? 'BNK' : 'RCP',
  partyCode: accCr,
  lines: [
    { accCode: accDr, dr: amount, cr: 0 },
    { accCode: accCr, dr: 0, cr: amount },
  ],
  bills: [{ accCode: accCr, billNo: vchrNo, refType: 'On Account', amount }],
}); // prettier-ignore

/** Payment: money goes out. Dr the party, Cr the cash/bank account (lines 1124-1153). */
export const paymentDraft = (bank: boolean, accCr: string, accDr: string, amount: number, vchrNo: string): VoucherDraft => ({
  vchrType: bank ? 'BPAY' : 'PAY',
  partyCode: accDr,
  lines: [
    { accCode: accDr, dr: amount, cr: 0 },
    { accCode: accCr, dr: 0, cr: amount },
  ],
  bills: [{ accCode: accDr, billNo: vchrNo, refType: 'On Account', amount }],
}); // prettier-ignore

/** Journal: free Dr/Cr lines, no party, no bill reference. */
export const journalDraft = (lines: { accCode: string; debit: boolean; amount: number }[]): VoucherDraft => ({
  vchrType: 'JNL',
  partyCode: null,
  lines: lines.map((l) => ({ accCode: l.accCode, dr: l.debit ? l.amount : 0, cr: l.debit ? 0 : l.amount })),
  bills: [],
}); // prettier-ignore

/** Debit Note: Dr the party for the total (narration = reason), Cr each entry (lines 1719-1769). */
export function debitNoteDraft(party: string, reason: string, items: { accCode: string; amount: number }[], vchrNo: string): VoucherDraft {
  const total = sumRaw(items.map((i) => i.amount));
  return {
    vchrType: 'DRN',
    partyCode: party,
    lines: [
      { accCode: party, dr: total, cr: 0, narration: reason },
      ...items.map((i) => ({ accCode: i.accCode, dr: 0, cr: i.amount })),
    ],
    bills: [{ accCode: party, billNo: vchrNo, refType: 'New', amount: total }],
  };
} // prettier-ignore

/** Credit Note: Dr each entry, Cr the party for the total (narration = reason) (lines 2019-2069). */
export function creditNoteDraft(party: string, reason: string, items: { accCode: string; amount: number }[], vchrNo: string): VoucherDraft {
  const total = sumRaw(items.map((i) => i.amount));
  return {
    vchrType: 'CRN',
    partyCode: party,
    lines: [
      ...items.map((i) => ({ accCode: i.accCode, dr: i.amount, cr: 0 })),
      { accCode: party, dr: 0, cr: total, narration: reason },
    ],
    bills: [{ accCode: party, billNo: vchrNo, refType: 'New', amount: total }],
  };
} // prettier-ignore

/** The tabs add amounts with a plain fold, no rounding (`_total`, `_totalDr`). */
export const sumRaw = (values: number[]) => values.reduce((a, b) => a + b, 0);

/** Dart's `double.tryParse(text) ?? 0` for an amount box (digits and '.' only). */
export const parseAmount = (text: string): number => {
  const t = text.trim();
  if (!/^(\d+\.?\d*|\.\d+)$/.test(t)) return 0;
  return Number(t);
};
/** The amount box's own check: 'Required' / 'Enter valid amount' (Receipt, Payment) or 'Invalid' (lines). */
export function amountProblem(text: string, invalid: string): string | null {
  if (!text.trim()) return voucherMessages.required;
  const n = /^(\d+\.?\d*|\.\d+)$/.test(text.trim()) ? Number(text.trim()) : NaN;
  return Number.isNaN(n) || n <= 0 ? invalid : null;
}

// ── Amount in words (voucher_print.dart:480-522) ──────────────────────────────────

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
  'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']; // prettier-ignore
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

const twoDigits = (x: number) =>
  x < 20 ? ONES[x]! : `${TENS[Math.trunc(x / 10)]}${x % 10 ? ` ${ONES[x % 10]}` : ''}`;
function threeDigits(x: number) {
  const h = Math.trunc(x / 100);
  const r = x % 100;
  let s = '';
  if (h > 0) s = `${ONES[h]} Hundred${r > 0 ? ' ' : ''}`;
  if (r > 0) s += twoDigits(r);
  return s;
}
function numToWords(n: number): string {
  if (n === 0) return 'Zero';
  const parts: string[] = [];
  const crore = Math.trunc(n / 10000000);
  n %= 10000000;
  const lakh = Math.trunc(n / 100000);
  n %= 100000;
  const thousand = Math.trunc(n / 1000);
  n %= 1000;
  if (crore > 0) parts.push(`${numToWords(crore)} Crore`);
  if (lakh > 0) parts.push(`${twoDigits(lakh)} Lakh`);
  if (thousand > 0) parts.push(`${twoDigits(thousand)} Thousand`);
  if (n > 0) parts.push(threeDigits(n));
  return parts.join(' ');
}
/** `Rupees <words>[ and <paise> Paise] Only`. */
export function amountInWords(amount: number): string {
  const rupees = Math.floor(amount);
  const paise = Math.round((amount - rupees) * 100);
  let s = `Rupees ${rupees === 0 ? 'Zero' : numToWords(rupees)}`;
  if (paise > 0) s += ` and ${numToWords(paise)} Paise`;
  return `${s} Only`;
}
