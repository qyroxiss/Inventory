import { afterEach, describe, expect, test } from 'vitest';
import { fa, fq, setDecimals } from './format.ts';

// 2026-11-11 audit: a Decimal Places setting below the books' precision used to round the
// figures put back into boxes, so pressing Update changed saved amounts.
describe('decimal places never change a figure', () => {
  afterEach(() => setDecimals({ qty: 3, amount: 2 }));

  test('defaults are unchanged', () => {
    expect(fa(1450)).toBe('1450.00');
    expect(fa(10.5)).toBe('10.50');
    expect(fq(10)).toBe('10.000');
  });

  test('0 decimals trims zeros but keeps real paise and grams', () => {
    setDecimals({ qty: 0, amount: 0 });
    expect(fa(100)).toBe('100');
    expect(fa(100.5)).toBe('100.5');
    expect(fa(12.55)).toBe('12.55');
    expect(fq(2)).toBe('2');
    expect(fq(2.5)).toBe('2.5');
    expect(fq(2.125)).toBe('2.125');
  });

  test('more decimals than the books hold just pads', () => {
    setDecimals({ qty: 4, amount: 3 });
    expect(fa(10.5)).toBe('10.500');
    expect(fq(1)).toBe('1.0000');
  });
});
