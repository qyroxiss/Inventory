// Decimal places for quantities and for rates/amounts, set per company by an Admin in
// Tools › Company Settings › Decimal Places (added 2026-10-25). Defaults: Qty 3, Rate/Amount 2.
// Only what's shown, typed and printed follows them; the maths (GST, totals, postings) is always
// to the paisa, so a setting can never change a figure in the books.
//
// The main shell loads the setting before any book screen draws (`setDecimals`), so plain
// functions are enough here, including in module-level grid columns.

let qtyDec = 3;
let amtDec = 2;

export type Decimals = { qty: number; amount: number };

export const decimals = (): Decimals => ({ qty: qtyDec, amount: amtDec });

export function setDecimals(d: Decimals) {
  qtyDec = d.qty;
  amtDec = d.amount;
}

// A figure missing from a reply (an older server, a field not sent) shows as 0 rather than
// taking the whole page down.
const n = (v: number | null | undefined) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/** How many decimals [v] really has, up to [max] (the books' own precision). */
const needed = (v: number, max: number) => {
  for (let d = 0; d < max; d++) {
    const s = v * 10 ** d;
    if (Math.abs(s - Math.round(s)) < 1e-6) return d;
  }
  return max;
};

// The setting only trims zeros: it never hides a real paisa or gram (2026-11-11 audit). Boxes
// are filled with these, and what a box shows is what gets saved, so a 0-decimal setting must
// show 10.50 as 10.5, not round it to 11.
/** A quantity: 10.000 */
export const fq = (v: number) => n(v).toFixed(Math.max(qtyDec, needed(n(v), 3)));
/** A rate or amount: 1450.00 */
export const fa = (v: number) => n(v).toFixed(Math.max(amtDec, needed(n(v), 2)));

const grouped = (v: number, d: number) =>
  n(v).toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d });
/** With Indian grouping, for reports and prints: 12,34,567.89 */
export const faIN = (v: number) => grouped(v, amtDec);
export const fqIN = (v: number) => grouped(v, qtyDec);
