import { describe, expect, test } from 'vitest';
import {
  gstCompute,
  gstRateNumber,
  isInterState,
  partyStateCode,
  purcLine,
  purcTotals,
  purchaseMessages as pm,
  purchasePosting,
  purchaseProblem,
} from '../src/index.ts';

const line = (over: Partial<Parameters<typeof purcLine>[0]> = {}) =>
  purcLine({
    itemCode: 'IT01',
    itemName: 'Basmati Rice',
    qty: 10,
    rate: 100,
    disP: 5,
    gstRate: 18,
    interState: false,
    ...over,
  });

describe('GST', () => {
  test('inter-state only when both states are known and differ', () => {
    expect(isInterState('27', '29')).toBe(true);
    expect(isInterState('27', '27')).toBe(false);
    expect(isInterState('27', '')).toBe(false);
    expect(isInterState(' ', '29')).toBe(false);
  });
  test('a party’s state falls back to its GSTIN prefix', () => {
    expect(partyStateCode('', '29ABCDE1234F1Z5')).toBe('29');
    expect(partyStateCode('27', '29ABCDE1234F1Z5')).toBe('27');
    expect(partyStateCode(null, null)).toBe('');
  });
  test('item rates read as numbers', () => {
    expect(gstRateNumber('18%')).toBe(18);
    expect(gstRateNumber('5')).toBe(5);
    expect(gstRateNumber('')).toBe(0);
    expect(gstRateNumber(null)).toBe(0);
  });
  test('SGST takes the odd paisa', () => {
    const s = gstCompute({ qty: 1, rate: 10.05, gstRate: 18, interState: false });
    expect([s.taxable, s.cgst, s.sgst, s.total]).toEqual([10.05, 0.91, 0.9, 11.86]);
  });
  test('a percentage discount wins over an amount', () => {
    expect(
      gstCompute({ qty: 10, rate: 100, discPct: 5, discAmt: 300, interState: false }).taxable,
    ).toBe(950);
    expect(gstCompute({ qty: 10, rate: 100, discAmt: 300, interState: false }).taxable).toBe(700);
  });
});

describe('lines and totals', () => {
  test('an intra-state line splits CGST and SGST, storing half the rate on each', () => {
    const l = line();
    expect(l).toMatchObject({
      disA: 50,
      amount: 950,
      cgstP: 9,
      cgstA: 85.5,
      sgstP: 9,
      sgstA: 85.5,
      igstP: 0,
      igstA: 0,
      lineTotal: 1121,
    });
  });
  test('an inter-state line carries IGST at the full rate', () => {
    expect(line({ interState: true })).toMatchObject({ igstP: 18, igstA: 171, cgstA: 0, sgstA: 0 });
  });
  test('totals round the net to the rupee', () => {
    const t = purcTotals([
      line(),
      line({ itemCode: 'IT02', qty: 3, rate: 33.33, disP: 0, gstRate: 12 }),
    ]);
    expect(t).toEqual({
      qty: 13,
      subTotal: 1049.99,
      discount: 50,
      sgst: 91.5,
      cgst: 91.5,
      igst: 0,
      roundOff: 0.01,
      net: 1233,
    });
  });
  test('posting: Dr Purchase and input taxes and round off, Cr the supplier', () => {
    const t = purcTotals([
      line(),
      line({ itemCode: 'IT02', qty: 3, rate: 33.33, disP: 0, gstRate: 12 }),
    ]);
    expect(purchasePosting('AC0004', t, false)).toEqual([
      { accCode: 'PUR001', dr: 1049.99, cr: 0 },
      { accCode: 'TAX001', dr: 91.5, cr: 0 },
      { accCode: 'TAX002', dr: 91.5, cr: 0 },
      { accCode: 'TAX007', dr: 0.01, cr: 0 },
      { accCode: 'AC0004', dr: 0, cr: 1233 },
    ]);
    const inter = purcTotals([line({ interState: true, qty: 1, rate: 99.5, disP: 0 })]);
    // 99.50 + 17.91 = 117.41 → rounds down by 0.41, posted on the credit side.
    expect(purchasePosting('AC0004', inter, true)).toEqual([
      { accCode: 'PUR001', dr: 99.5, cr: 0 },
      { accCode: 'TAX003', dr: 17.91, cr: 0 },
      { accCode: 'TAX007', dr: 0, cr: 0.41 },
      { accCode: 'AC0004', dr: 0, cr: 117 },
    ]);
  });
});

describe('purchaseProblem (MDA’s order)', () => {
  const h = {
    billNo: 'PB-0001',
    suppCode: 'AC0004',
    billDate: '2026-05-10',
    fyFrom: '2026-04-01',
    fyTo: '2027-03-31',
    fyLabel: '2026-2027',
  };
  test('each rule', () => {
    expect(purchaseProblem({ ...h, billNo: ' ' }, [line()])).toBe(pm.billNoRequired);
    expect(purchaseProblem({ ...h, suppCode: '' }, [line()])).toBe(pm.selectSupplier);
    expect(purchaseProblem({ ...h, billDate: '2027-04-01' }, [line()])).toBe(
      'Purchase date is outside the open financial year (2026-2027).',
    );
    expect(purchaseProblem(h, [])).toBe(pm.noItems);
    expect(purchaseProblem(h, [line({ itemCode: '' })])).toBe(pm.lineNoItem);
    expect(purchaseProblem(h, [line({ qty: 0 })])).toBe(
      'Quantity must be more than zero for Basmati Rice.',
    );
    expect(purchaseProblem(h, [line({ rate: -1 })])).toBe(
      'Rate cannot be negative for Basmati Rice.',
    );
    expect(purchaseProblem(h, [line({ disP: 0, disA: 5000 })])).toBe(
      'Discount is more than the value of Basmati Rice.',
    );
    expect(purchaseProblem(h, [line({ rate: 0 })])).toBe(pm.zero);
    expect(purchaseProblem(h, [line()])).toBeNull();
  });
});
