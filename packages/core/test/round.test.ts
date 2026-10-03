import { describe, expect, test } from 'vitest';
import { round2, roundOff } from '../src/round.ts';
import { golden } from './golden.ts';

type Case = { input: number; round2: number; roundOff: number };
const cases = golden<Case[]>('round');

describe('round2 / roundOff match Dart exactly', () => {
  test.each(cases)('$input', (c) => {
    expect(round2(c.input)).toBe(c.round2);
    expect(roundOff(c.input)).toBe(c.roundOff);
  });

  test('negative halves round away from zero (the Math.round trap)', () => {
    expect(round2(-0.125)).toBe(-0.13);
    expect(roundOff(-2.5)).toBe(-0.5);
  });
});
