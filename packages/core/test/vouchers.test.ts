import { describe, expect, test } from 'vitest';
import {
  amountInWords,
  amountProblem,
  creditNoteDraft,
  fmtTotal,
  parseAmount,
  postingProblem,
  voucherMessages,
} from '../src/index.ts';

describe('amountInWords (voucher_print.dart)', () => {
  test.each([
    [0, 'Rupees Zero Only'],
    [15, 'Rupees Fifteen Only'],
    [1500.5, 'Rupees One Thousand Five Hundred and Fifty Paise Only'],
    [105000, 'Rupees One Lakh Five Thousand Only'],
    [
      123456789.07,
      'Rupees Twelve Crore Thirty Four Lakh Fifty Six Thousand Seven Hundred Eighty Nine and Seven Paise Only',
    ],
  ])('%s', (n, words) => expect(amountInWords(n)).toBe(words));
});

describe('the tabs’ own checks', () => {
  test('amount boxes', () => {
    expect(amountProblem('', 'Enter valid amount')).toBe(voucherMessages.required);
    expect(amountProblem('0', 'Enter valid amount')).toBe('Enter valid amount');
    expect(amountProblem('1.2.3', 'Invalid')).toBe('Invalid');
    expect(amountProblem('12.50', 'Invalid')).toBeNull();
    expect(parseAmount('12.5')).toBe(12.5);
    expect(parseAmount('abc')).toBe(0);
  });
  test('on-screen totals drop .00', () => {
    expect(fmtTotal(1500)).toBe('1500');
    expect(fmtTotal(1500.5)).toBe('1500.50');
  });
  test('credit note: entries debited, party credited with the reason', () => {
    expect(
      creditNoteDraft('AC0002', 'Sales Return', [{ accCode: 'SAL001', amount: 99.99 }], 'CRN-001')
        .lines,
    ).toEqual([
      { accCode: 'SAL001', dr: 99.99, cr: 0 },
      { accCode: 'AC0002', dr: 0, cr: 99.99, narration: 'Sales Return' },
    ]);
  });
  test('posting gate: within half a paisa is balanced', () => {
    const base = {
      vchrType: 'JNL',
      date: '2026-05-01',
      fyFrom: '2026-04-01',
      fyTo: '2027-03-31',
      fyLabel: 'x',
    };
    expect(
      postingProblem({
        ...base,
        lines: [
          { accCode: 'A', dr: 10.004, cr: 0 },
          { accCode: 'B', dr: 0, cr: 10 },
        ],
      }),
    ).toBeNull();
    expect(
      postingProblem({ ...base, date: '2026-03-31', lines: [{ accCode: 'A', dr: 1, cr: 0 }] }),
    ).toBe('Voucher date is outside the open financial year (x).');
  });
});
