import { describe, expect, test } from 'vitest';
import { validators } from '../src/validators.ts';
import { golden } from './golden.ts';

type GstinCase = { input: string; required: boolean; output: string | null };
type SimpleCase = { input: string; output: string | null; outputRequired: string | null };
type Golden = {
  gstin: GstinCase[];
  pan: SimpleCase[];
  hsn: SimpleCase[];
  mobile: SimpleCase[];
  email: SimpleCase[];
  pincode: SimpleCase[];
  stateCodeFromGstin: { input: string; output: string | null }[];
};
const g = golden<Golden>('validators');

describe('validators match Dart exactly', () => {
  test.each(g.gstin)('gstin $input (required: $required)', (c) => {
    expect(validators.gstin(c.input, { required: c.required })).toBe(c.output);
  });

  for (const name of ['pan', 'hsn', 'mobile', 'email', 'pincode'] as const) {
    test.each(g[name])(`${name} "$input"`, (c) => {
      expect(validators[name](c.input)).toBe(c.output);
      expect(validators[name](c.input, { required: true })).toBe(c.outputRequired);
    });
  }

  test.each(g.stateCodeFromGstin)('stateCodeFromGstin "$input"', (c) => {
    expect(validators.stateCodeFromGstin(c.input)).toBe(c.output);
  });

  test('the golden set includes valid GSTINs, not only rejections', () => {
    expect(g.gstin.filter((c) => c.input && c.output === null).length).toBeGreaterThan(100);
  });
});
