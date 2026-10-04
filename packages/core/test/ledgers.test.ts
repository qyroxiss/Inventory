import { describe, expect, test } from 'vitest';
import { ledgerFieldErrors, ledgerMessages, INDIAN_STATES } from '../src/ledgers.ts';

describe('ledgerFieldErrors', () => {
  const valid = {
    name: 'Petty Cash',
    city: 'Pune',
    state: 'Maharashtra',
    under: 'A001',
    pincode: '411001',
  };

  test('a fully filled form has no errors', () => {
    expect(ledgerFieldErrors(valid)).toEqual({});
  });

  test('requires name, city, state, under group and pincode', () => {
    expect(ledgerFieldErrors({})).toEqual({
      name: ledgerMessages.nameRequired,
      city: ledgerMessages.cityRequired,
      state: ledgerMessages.stateRequired,
      under: ledgerMessages.underRequired,
      pincode: ledgerMessages.pincodeRequired,
    });
  });

  test('Under Group\'s own error is the bare word "Required", unlike City/State (MDA as-is)', () => {
    expect(ledgerFieldErrors({ ...valid, under: undefined }).under).toBe('Required');
  });

  test('pincode must be 6 digits, not starting with 0', () => {
    expect(ledgerFieldErrors({ ...valid, pincode: '12345' }).pincode).toBe(
      ledgerMessages.pincodeFormat,
    );
    expect(ledgerFieldErrors({ ...valid, pincode: '012345' }).pincode).toBe(
      ledgerMessages.pincodeFormat,
    );
    expect(ledgerFieldErrors({ ...valid, pincode: '411001' }).pincode).toBeUndefined();
  });
});

describe('INDIAN_STATES', () => {
  test("has all 28 states and 8 union territories, in MDA's own order", () => {
    expect(INDIAN_STATES).toHaveLength(36);
    expect(INDIAN_STATES[0]).toBe('Andaman & Nicobar Islands');
    expect(INDIAN_STATES).toContain('Maharashtra');
  });
});
