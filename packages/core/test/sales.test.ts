// The bill discount on a sale comes off before tax (user's decision, 2026-11-14): GST is charged
// on the discounted value, and the discount is shared over the lines by their value.
import { describe, expect, test } from 'vitest';
import { saleLine, salePosting, saleProblem, saleTotals } from '../src/index.ts';

const line = (code: string, qty: number, rate: number, gstRate: number, interState = false) =>
  saleLine({ itemCode: code, itemName: code, qty, rate, gstRate, interState });

describe('bill discount before tax', () => {
  test('no discount: tax on the full value', () => {
    const t = saleTotals([line('A', 2, 500, 18)]);
    expect(t).toMatchObject({ subTotal: 1000, billDisc: 0, cgst: 90, sgst: 90, net: 1180 });
  });

  test('a % discount lowers the taxable value, so GST is on the reduced amount', () => {
    const t = saleTotals([line('A', 2, 500, 18)], 10);
    // 1000 - 10% = 900 taxable; 9% + 9% of 900 = 81 + 81.
    expect(t).toMatchObject({ subTotal: 1000, billDisc: 100, cgst: 81, sgst: 81, net: 1062 });
    expect(t.taxed[0]).toMatchObject({ amount: 900, cgstA: 81, sgstA: 81, lineTotal: 1062 });
  });

  test('an amount is shared over lines by value, each at its own GST rate', () => {
    const t = saleTotals([line('A', 1, 300, 5), line('B', 1, 700, 18)], 0, 100);
    // A takes 30 (300 of 1000), B takes the rest: 70.
    expect(t.taxed.map((l) => l.amount)).toEqual([270, 630]);
    expect(t.taxed.map((l) => l.cgstA)).toEqual([6.75, 56.7]);
    expect(t.cgst).toBe(63.45);
    expect(t.net).toBe(Math.round(900 + 63.45 * 2));
  });

  test('inter-state: IGST on the reduced value', () => {
    const t = saleTotals([line('A', 1, 1000, 12, true)], 5);
    expect(t).toMatchObject({ billDisc: 50, igst: 114, cgst: 0, net: 1064 });
  });

  test('the posting balances: Dr party + discount, Cr sales (before discount) + tax', () => {
    const t = saleTotals([line('A', 3, 333.33, 18)], 0, 77.77);
    const p = salePosting('CUST', t, false);
    const dr = p.reduce((a, l) => a + l.dr, 0);
    const cr = p.reduce((a, l) => a + l.cr, 0);
    expect(Math.abs(dr - cr)).toBeLessThan(0.005);
  });

  test('a discount bigger than the items is refused', () => {
    const h = {
      billNo: 'SB-1',
      custName: 'X',
      custCode: null,
      isCash: true,
      billDate: '2026-05-01',
      fyFrom: '2026-04-01',
      fyTo: '2027-03-31',
      fyLabel: '2026-2027',
      billDiscPct: 0,
      billDiscAmt: 1500,
    };
    expect(saleProblem(h, [line('A', 1, 1000, 18)])).toBe(
      'Bill discount is more than the value of the items.',
    );
  });
});
