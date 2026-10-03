import { describe, expect, test } from 'vitest';
import {
  DEFAULT_GROUPS,
  SUB_GROUP_CODE_PREFIX,
  SUB_GROUP_CODE_WIDTH,
  groupCodePrefix,
  groupFieldErrors,
  nextCode,
  subGroupFieldErrors,
} from '../src/groups.ts';

describe('nextCode', () => {
  test('starts at 1 when nothing of that prefix exists', () => {
    expect(nextCode([], 'A')).toBe('A001');
    expect(nextCode(['L001', 'E001'], 'A')).toBe('A001');
  });

  test('takes the highest numeric suffix of the same prefix, plus one', () => {
    expect(nextCode(['A001', 'A002', 'A009'], 'A')).toBe('A010');
  });

  test('ignores codes of a different prefix', () => {
    expect(nextCode(['A001', 'L099'], 'A')).toBe('A002');
  });

  test('an unparseable suffix counts as 0, so it never breaks generation', () => {
    expect(nextCode(['A-odd', 'A001'], 'A')).toBe('A002');
  });

  test('pads to the given width', () => {
    expect(nextCode(['SG0007'], 'SG', 4)).toBe('SG0008');
  });

  test(groupCodePrefix.name + ' takes the first letter of the group type', () => {
    expect(groupCodePrefix('Assets')).toBe('A');
    expect(groupCodePrefix('Liabilities')).toBe('L');
    expect(groupCodePrefix('Expenses')).toBe('E');
    expect(groupCodePrefix('Income')).toBe('I');
  });
});

describe('groupFieldErrors', () => {
  test('name is required', () => {
    expect(groupFieldErrors({ name: '', type: 'Assets' })).toEqual({
      name: 'Group name is required',
    });
    expect(groupFieldErrors({ name: '   ', type: 'Assets' })).toEqual({
      name: 'Group name is required',
    });
  });

  test('type is required', () => {
    expect(groupFieldErrors({ name: 'Petty Cash' })).toEqual({
      type: 'Please select a group type',
    });
  });

  test('a complete form has no errors', () => {
    expect(groupFieldErrors({ name: 'Petty Cash', type: 'Assets' })).toEqual({});
  });
});

describe('subGroupFieldErrors', () => {
  test('name is required', () => {
    expect(subGroupFieldErrors({ name: '', under: 'A001' })).toEqual({
      name: 'Sub group name is required',
    });
  });

  test('an under group is required', () => {
    expect(subGroupFieldErrors({ name: 'Petty Cash' })).toEqual({
      under: 'Please select an under group',
    });
  });

  test('a complete form has no errors', () => {
    expect(subGroupFieldErrors({ name: 'Petty Cash', under: 'A001' })).toEqual({});
  });

  test('the code prefix is SG, width 4 (docs/LOGIC-SPEC.md §4.1)', () => {
    expect(SUB_GROUP_CODE_PREFIX).toBe('SG');
    expect(SUB_GROUP_CODE_WIDTH).toBe(4);
    expect(nextCode(['SG0007'], SUB_GROUP_CODE_PREFIX, SUB_GROUP_CODE_WIDTH)).toBe('SG0008');
  });
});

describe('DEFAULT_GROUPS', () => {
  test('has exactly 16 top-level groups, matching docs/LOGIC-SPEC.md §3', () => {
    expect(DEFAULT_GROUPS.filter((g) => g.parentGrp === 'Parent')).toHaveLength(16);
  });

  test('has 28 groups in total, every code unique', () => {
    expect(DEFAULT_GROUPS).toHaveLength(28);
    expect(new Set(DEFAULT_GROUPS.map((g) => g.grpCode)).size).toBe(28);
  });

  test('every sub group points at a code that is actually seeded', () => {
    const codes = new Set(DEFAULT_GROUPS.map((g) => g.grpCode));
    for (const g of DEFAULT_GROUPS) {
      if (g.parentGrp !== 'Parent') expect(codes.has(g.parentGrp)).toBe(true);
    }
  });
});
