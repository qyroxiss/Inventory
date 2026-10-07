import { describe, expect, test } from 'vitest';
import { gstr1, gstr3b, placeOfSupply, type GstBill } from '../src/index.ts';

const line = (rate: number, taxable: number, inter: boolean, hsn = '1006') => {
  const tax = Math.round(taxable * rate) / 100;
  return {
    hsn,
    itemName: 'Rice',
    unit: 'Kgs',
    qty: 1,
    rate,
    taxable,
    igst: inter ? tax : 0,
    cgst: inter ? 0 : tax / 2,
    sgst: inter ? 0 : tax / 2,
  };
};
const bill = (over: Partial<GstBill>): GstBill => ({
  billNo: 'SB-0001',
  date: '2026-05-10',
  partyName: 'Walk-in',
  gstin: '',
  stateCode: '',
  interState: false,
  value: 0,
  lines: [],
  ...over,
});

describe('GSTR-1', () => {
  test('sorts bills into B2B, B2C Large and B2C Small; 0% goes to nil', () => {
    const r = gstr1(
      [
        bill({
          billNo: 'B2B',
          gstin: '29ABCDE1234F1ZW',
          stateCode: '29',
          interState: true,
          value: 1180,
          lines: [line(18, 1000, true)],
        }),
        bill({
          billNo: 'BIG',
          stateCode: '29',
          interState: true,
          value: 236000,
          lines: [line(18, 200000, true)],
        }),
        bill({ billNo: 'SMALL1', value: 590, lines: [line(18, 500, false), line(0, 90, false)] }),
        bill({ billNo: 'SMALL2', value: 118, lines: [line(18, 100, false)] }),
      ],
      '27',
    );
    expect(r.b2b.map((x) => [x.billNo, x.pos, x.rate, x.igst])).toEqual([
      ['B2B', '29-Karnataka', 18, 180],
    ]);
    expect(r.b2cl.map((x) => x.billNo)).toEqual(['BIG']);
    // Both small bills: within the company's state, one row for 18%.
    expect(r.b2cs).toEqual([
      { pos: '27-Maharashtra', rate: 18, type: 'Intra', taxable: 600, igst: 0, cgst: 54, sgst: 54 },
    ]);
    expect(r.nil.taxable).toBe(90);
    expect(r.counts).toEqual({ b2b: 1, b2cl: 1, b2c: 2 });
    expect(r.totals.taxable).toBe(201600);
  });
  test('place of supply reads as code-name', () => {
    expect(placeOfSupply('27')).toBe('27-Maharashtra');
    expect(placeOfSupply('')).toBe('—');
  });
});

describe('GSTR-3B set-off order', () => {
  test('IGST credit first to IGST then CGST/SGST; CGST and SGST never cross', () => {
    const r = gstr3b({ taxable: 0, igst: 100, cgst: 300, sgst: 300 }, 0, {
      igst: 250,
      cgst: 50,
      sgst: 400,
    });
    // IGST 250: 100 to IGST, 150 to CGST. CGST 50 to CGST. SGST 400: 300 to SGST, 100 left.
    expect(r.paidByItc).toEqual({ igst: 100, cgst: 200, sgst: 300 });
    expect(r.cash).toEqual({ igst: 0, cgst: 100, sgst: 0 });
    expect(r.carryForward).toEqual({ igst: 0, cgst: 0, sgst: 100 });
  });
  test('CGST and SGST credit can pay IGST', () => {
    const r = gstr3b({ taxable: 0, igst: 500, cgst: 0, sgst: 0 }, 0, {
      igst: 0,
      cgst: 200,
      sgst: 200,
    });
    expect(r.cash.igst).toBe(100);
  });
});
