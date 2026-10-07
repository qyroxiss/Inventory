// GST Reports. MDA lists GSTR-1, GSTR-3B, GST Audit, HSN Summary and Input Tax Credit but shows
// "Not built yet" for each. Built here from the sale and purchase bills, following the GST
// return formats (docs/design/GST-REPORTS.md). Pure functions; the service feeds them.

import { round2 } from './round.ts';

/** GST state codes and names, as the GSTIN's first two digits use them. */
export const GST_STATES: Record<string, string> = {
  '01': 'Jammu & Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh',
  '05': 'Uttarakhand', '06': 'Haryana', '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh',
  '10': 'Bihar', '11': 'Sikkim', '12': 'Arunachal Pradesh', '13': 'Nagaland', '14': 'Manipur',
  '15': 'Mizoram', '16': 'Tripura', '17': 'Meghalaya', '18': 'Assam', '19': 'West Bengal',
  '20': 'Jharkhand', '21': 'Odisha', '22': 'Chhattisgarh', '23': 'Madhya Pradesh', '24': 'Gujarat',
  '26': 'Dadra & Nagar Haveli and Daman & Diu', '27': 'Maharashtra', '28': 'Andhra Pradesh (Old)',
  '29': 'Karnataka', '30': 'Goa', '31': 'Lakshadweep', '32': 'Kerala', '33': 'Tamil Nadu',
  '34': 'Puducherry', '35': 'Andaman & Nicobar Islands', '36': 'Telangana', '37': 'Andhra Pradesh',
  '38': 'Ladakh', '97': 'Other Territory', '99': 'Centre Jurisdiction',
}; // prettier-ignore

/** "27-Maharashtra" (or the bare code when unknown, or "—"). */
export const placeOfSupply = (code?: string | null) => {
  const c = (code ?? '').trim();
  if (!c) return '—';
  return GST_STATES[c] ? `${c}-${GST_STATES[c]}` : c;
};

/** B2C Large: an inter-state bill to an unregistered buyer above this value (₹1 lakh since
 *  1 Aug 2024; it was ₹2.5 lakh before). */
export const B2CL_LIMIT = 100000;

/** One bill line as GST sees it. `rate` is the combined rate (CGST + SGST, or IGST). */
export type GstLine = {
  hsn: string;
  itemName: string;
  unit: string;
  qty: number;
  rate: number;
  taxable: number;
  igst: number;
  cgst: number;
  sgst: number;
};

export type GstBill = {
  billNo: string;
  date: string;
  partyName: string;
  gstin: string;
  /** The party's state code; blank when unknown. */
  stateCode: string;
  interState: boolean;
  /** The bill's grand total. */
  value: number;
  lines: GstLine[];
};

export type TaxSums = { taxable: number; igst: number; cgst: number; sgst: number };
const zero = (): TaxSums => ({ taxable: 0, igst: 0, cgst: 0, sgst: 0 });
const addTo = (a: TaxSums, l: TaxSums) => {
  a.taxable = round2(a.taxable + l.taxable);
  a.igst = round2(a.igst + l.igst);
  a.cgst = round2(a.cgst + l.cgst);
  a.sgst = round2(a.sgst + l.sgst);
};
export const sumTax = (rows: TaxSums[]) => {
  const t = zero();
  rows.forEach((r) => addTo(t, r));
  return t;
};

/** A bill's lines summed per rate — GSTR-1 reports each invoice rate-wise. */
function byRate(lines: GstLine[]) {
  const m = new Map<number, TaxSums>();
  for (const l of lines) {
    const r = m.get(l.rate) ?? zero();
    addTo(r, l);
    m.set(l.rate, r);
  }
  return [...m.entries()].sort((a, b) => a[0] - b[0]);
}

export type InvoiceRateRow = TaxSums & {
  billNo: string;
  date: string;
  partyName: string;
  gstin: string;
  pos: string;
  value: number;
  rate: number;
};
export type B2csRow = TaxSums & { pos: string; rate: number; type: 'Inter' | 'Intra' };
export type HsnRow = TaxSums & {
  hsn: string;
  description: string;
  uqc: string;
  qty: number;
  rate: number;
  total: number;
};

/** HSN Summary: lines grouped by HSN code and rate. */
export function hsnSummary(bills: GstBill[]): HsnRow[] {
  const m = new Map<string, HsnRow>();
  for (const b of bills)
    for (const l of b.lines) {
      const key = `${l.hsn}|${l.rate}`;
      let r = m.get(key);
      if (!r) {
        r = {
          hsn: l.hsn,
          description: l.itemName,
          uqc: l.unit,
          qty: 0,
          rate: l.rate,
          total: 0,
          ...zero(),
        };
        m.set(key, r);
      }
      r.qty = round2(r.qty + l.qty);
      addTo(r, l);
      r.total = round2(r.taxable + r.igst + r.cgst + r.sgst);
    }
  return [...m.values()].sort((a, b) => a.hsn.localeCompare(b.hsn) || a.rate - b.rate);
}

export type Gstr1 = {
  b2b: InvoiceRateRow[];
  b2cl: InvoiceRateRow[];
  b2cs: B2csRow[];
  hsn: HsnRow[];
  /** Lines at 0% (nil rated / exempt), reported separately. */
  nil: TaxSums;
  totals: TaxSums;
  counts: { b2b: number; b2cl: number; b2c: number };
};

/**
 * GSTR-1 from the period's sale bills:
 *   B2B  — buyer has a GSTIN: each invoice, rate-wise.
 *   B2CL — no GSTIN, inter-state, bill value above B2CL_LIMIT: each invoice, rate-wise.
 *   B2CS — every other B2C bill: summed by place of supply and rate.
 * A bill with no known buyer state is a supply within the company's own state.
 * 0% lines go to Nil rated / exempt, not to these tables.
 */
export function gstr1(bills: GstBill[], companyState: string): Gstr1 {
  const b2b: InvoiceRateRow[] = [];
  const b2cl: InvoiceRateRow[] = [];
  const b2csMap = new Map<string, B2csRow>();
  const nil = zero();
  const counts = { b2b: 0, b2cl: 0, b2c: 0 };
  for (const b of bills) {
    const taxed = b.lines.filter((l) => l.rate > 0);
    b.lines.filter((l) => l.rate <= 0).forEach((l) => addTo(nil, l));
    if (!taxed.length) continue;
    const state = b.stateCode || companyState;
    const pos = placeOfSupply(state);
    const registered = !!b.gstin.trim();
    const large = !registered && b.interState && b.value > B2CL_LIMIT;
    if (registered) counts.b2b++;
    else if (large) counts.b2cl++;
    else counts.b2c++;
    for (const [rate, t] of byRate(taxed)) {
      if (registered || large) {
        const row = {
          billNo: b.billNo,
          date: b.date,
          partyName: b.partyName,
          gstin: b.gstin,
          pos,
          value: b.value,
          rate,
          ...t,
        };
        (registered ? b2b : b2cl).push(row);
      } else {
        const key = `${state}|${rate}`;
        const r = b2csMap.get(key) ?? {
          pos,
          rate,
          type: b.interState ? 'Inter' : 'Intra',
          ...zero(),
        };
        addTo(r, t);
        b2csMap.set(key, r);
      }
    }
  }
  const b2cs = [...b2csMap.values()].sort((a, b) => a.pos.localeCompare(b.pos) || a.rate - b.rate);
  return {
    b2b,
    b2cl,
    b2cs,
    hsn: hsnSummary(bills),
    nil,
    totals: sumTax([...b2b, ...b2cl, ...b2cs]),
    counts,
  };
}

export type Heads = { igst: number; cgst: number; sgst: number };

export type Gstr3b = {
  /** 3.1(a): outward taxable supplies (other than nil rated and exempted). */
  outward: TaxSums;
  /** 3.1(c): nil rated and exempted. */
  nilExempt: number;
  /** 4(A)(5): all other ITC — from purchases from registered suppliers. */
  itc: Heads;
  /** ITC used against each head of output tax. */
  paidByItc: Heads;
  /** Output tax left to pay in cash. */
  cash: Heads;
  /** ITC left over, carried to the next period. */
  carryForward: Heads;
};

/**
 * GSTR-3B. Credit is set off in the order the law sets (sec. 49, rule 88A): IGST credit pays
 * IGST first, then CGST and SGST; CGST credit pays CGST, then IGST; SGST credit pays SGST, then
 * IGST. CGST credit never pays SGST, nor SGST credit CGST.
 */
export function gstr3b(outward: TaxSums, nilExempt: number, itc: Heads): Gstr3b {
  const due = { igst: outward.igst, cgst: outward.cgst, sgst: outward.sgst };
  const credit = { ...itc };
  const used = { igst: 0, cgst: 0, sgst: 0 };
  const apply = (from: keyof Heads, to: keyof Heads) => {
    const n = round2(Math.min(credit[from], due[to]));
    if (n <= 0) return;
    credit[from] = round2(credit[from] - n);
    due[to] = round2(due[to] - n);
    used[to] = round2(used[to] + n);
  };
  apply('igst', 'igst');
  apply('igst', 'cgst');
  apply('igst', 'sgst');
  apply('cgst', 'cgst');
  apply('cgst', 'igst');
  apply('sgst', 'sgst');
  apply('sgst', 'igst');
  return { outward, nilExempt, itc, paidByItc: used, cash: due, carryForward: credit };
}

export type AuditFinding = {
  level: 'error' | 'warning';
  area: string;
  text: string;
  /** What to open to fix it (a ledger, item or bill). */
  ref: string;
};

export const gstMessages = {
  noCompanyGstin:
    'The company has no GSTIN. Fill it in under Company Settings before filing returns.',
  noCompanyState:
    'The company state is unknown (no GSTIN), so every supply is treated as within the state (CGST + SGST).',
  badGstin: (who: string, problem: string) => `${who}: ${problem}`,
  noHsn: (item: string) => `${item} has no HSN code.`,
  noRate: (item: string) => `${item} is billed at 0% GST although it is marked Taxable.`,
  wrongSplit: (bill: string, expected: string) =>
    `${bill} is billed as ${expected === 'IGST' ? 'CGST + SGST' : 'IGST'}, but the states say ${expected}.`,
  unregisteredItc: (bill: string, supplier: string) =>
    `${bill}: input tax taken on a purchase from ${supplier}, who has no valid GSTIN.`,
  ledgerMismatch: (ledger: string, books: number, bills: number) =>
    `${ledger} moved ${books.toFixed(2)} in the books, but the bills total ${bills.toFixed(2)}.`,
  allClear: 'No problems found for this period.',
} as const;
