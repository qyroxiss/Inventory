import { describe, expect, test } from 'vitest';
import { gstr1, gstr3b, isInterState, placeOfSupply, stateCodeFromText, type GstBill } from '../src/index.ts';

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
    expect(r.counts).toEqual({ b2b: 1, b2cl: 1, b2c: 2, cdnr: 0, cdnur: 0 });
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

describe('stateCodeFromText', () => {
  test('resolves a state name, a code or "code-name"', () => {
    expect(stateCodeFromText('Maharashtra')).toBe('27');
    expect(stateCodeFromText(' gujarat ')).toBe('24');
    expect(stateCodeFromText('29')).toBe('29');
    expect(stateCodeFromText('07-Delhi')).toBe('07');
  });
  test('is blank for an unknown or empty state, which the bill treats as intra-state', () => {
    expect(stateCodeFromText('')).toBe('');
    expect(stateCodeFromText('Mahar')).toBe('');
    expect(isInterState('27', stateCodeFromText('Mahar'))).toBe(false);
  });
  test('drives IGST vs CGST + SGST against the company state', () => {
    expect(isInterState('27', stateCodeFromText('Gujarat'))).toBe(true);
    expect(isInterState('27', stateCodeFromText('Maharashtra'))).toBe(false);
  });
});

describe('GSTR-1 with Sales Returns (credit notes)', () => {
  const l = (taxable: number, rate = 18) => ({
    hsn: '1006', itemName: 'Rice', unit: 'Kgs', qty: 1, rate, taxable,
    igst: 0, cgst: (taxable * rate) / 200, sgst: (taxable * rate) / 200,
  }); // prettier-ignore
  const bill = (no: string, gstin: string, taxable: number): GstBill => ({
    billNo: no, date: '2026-05-10', partyName: 'P', gstin, stateCode: '27', interState: false,
    value: taxable * 1.18, lines: [l(taxable)],
  }); // prettier-ignore
  const note = (no: string, gstin: string, taxable: number) => ({
    ...bill(no, gstin, taxable), againstBillNo: 'SB-1', againstDate: '2026-05-10',
  });

  test('registered → CDNR; unregistered → off B2CS; HSN and totals net', () => {
    const r = gstr1(
      [bill('SB-1', '27AAAPA1234A1Z5', 1000), bill('SB-2', '', 500)],
      '27',
      [note('SRT-001', '27AAAPA1234A1Z5', 200), note('SRT-002', '', 100)],
    );
    expect(r.cdnr).toHaveLength(1);
    expect(r.cdnr[0]).toMatchObject({ billNo: 'SRT-001', againstBillNo: 'SB-1', rate: 18, taxable: 200 });
    expect(r.b2cs[0]).toMatchObject({ rate: 18, taxable: 400 });
    expect(r.counts.cdnr).toBe(1);
    expect(r.notes.taxable).toBe(300);
    expect(r.totals.taxable).toBe(1000 + 500 - 300);
    expect(r.hsn[0]).toMatchObject({ qty: 0, taxable: 1200 });
  });
});

describe('fixes 2026-11-12', () => {
  test('3B: leftover IGST credit goes where CGST/SGST credit falls short (rule 88A)', () => {
    // CGST credit covers CGST, so IGST credit pays SGST: nothing in cash.
    const r = gstr3b({ taxable: 0, igst: 0, cgst: 100, sgst: 100 }, 0, { igst: 100, cgst: 100, sgst: 0 });
    expect(r.cash).toEqual({ igst: 0, cgst: 0, sgst: 0 });
    expect(r.carryForward).toEqual({ igst: 0, cgst: 0, sgst: 0 });
  }); // prettier-ignore
  test('GSTR-1: a return against a B2C Large bill goes to CDNUR, not off B2C Small', () => {
    const big = bill({ billNo: 'SB-9', stateCode: '29', interState: true, value: 236000, lines: [line(18, 200000, true)] });
    const ret = { ...big, billNo: 'SRT-9', againstBillNo: 'SB-9', againstDate: '2026-05-10', againstValue: 236000 };
    const r = gstr1([big], '27', [ret]);
    expect(r.b2cl).toHaveLength(1);
    expect(r.b2cs).toHaveLength(0);
    expect(r.cdnur).toHaveLength(1);
    expect(r.counts.cdnur).toBe(1);
    expect(r.totals.taxable).toBe(0);
  }); // prettier-ignore
});
