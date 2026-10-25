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

/** A quantity: 10.000 */
export const fq = (v: number) => v.toFixed(qtyDec);
/** A rate or amount: 1450.00 */
export const fa = (v: number) => v.toFixed(amtDec);

const grouped = (v: number, d: number) =>
  v.toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d });
/** With Indian grouping, for reports and prints: 12,34,567.89 */
export const faIN = (v: number) => grouped(v, amtDec);
export const fqIN = (v: number) => grouped(v, qtyDec);
