import { describe, expect, test } from 'vitest';
import {
  CITY_STATES,
  INDIAN_STATES,
  companyFieldErrors,
  contactMessages as m,
  fullYearName,
  joinPhone,
  mobileProblem,
  splitPhone,
  stateOfCity,
  yearChoices,
  yearDates,
} from '../src/index.ts';

describe('phone numbers', () => {
  test('split and join keep the country code; an old number without one is Indian', () => {
    expect(splitPhone('+971 501234567')).toEqual({ code: '+971', number: '501234567' });
    expect(splitPhone('98765 43210')).toEqual({ code: '+91', number: '9876543210' });
    expect(splitPhone('')).toEqual({ code: '+91', number: '' });
    expect(joinPhone('+91', '98765-43210')).toBe('+91 9876543210');
    expect(joinPhone('+91', '')).toBe('');
  });

  test('mobile: 10 digits from 6–9 in India, 6 to 12 elsewhere, blank allowed', () => {
    expect(mobileProblem('+91 9876543210')).toBeNull();
    expect(mobileProblem('9876543210')).toBeNull();
    expect(mobileProblem('+91 5876543210')).toBe(m.mobileIndia);
    expect(mobileProblem('+91 98765')).toBe(m.mobileIndia);
    expect(mobileProblem('+971 501234567')).toBeNull();
    expect(mobileProblem('+971 501')).toBe(m.mobileOther);
    expect(mobileProblem('')).toBeNull();
  });
});

describe('company form checks', () => {
  const ok = { name: 'Sharma Traders' };
  test('valid values pass; each field gets its own message', () => {
    expect(
      companyFieldErrors({
        ...ok,
        phone: '022 2345 6789',
        fax: '(022) 2345-6790',
        mobile: '+91 9876543210',
        cin: 'u12345mh2020ptc123456',
        bankAcNo: '123456789012',
        bankIfsc: 'sbin0001234',
      }),
    ).toEqual({});
    expect(
      companyFieldErrors({
        ...ok,
        phone: '12345',
        fax: '022-ABC',
        mobile: '+91 123',
        cin: 'U12345',
        bankAcNo: '12AB5678901',
        bankIfsc: 'SBIN1001234',
      }),
    ).toEqual({
      phone: m.telephone,
      fax: m.fax,
      mobile: m.mobileIndia,
      cin: m.cin,
      bankAcNo: m.bankAcNo,
      bankIfsc: m.ifsc,
    });
  });
});

describe('financial year names', () => {
  test('a range fills 1 April to 31 March; anything else gives nothing', () => {
    expect(yearDates('2026-2027')).toEqual({ from: '01/04/2026', to: '31/03/2027' });
    expect(yearDates('2026-27')).toEqual({ from: '01/04/2026', to: '31/03/2027' });
    expect(yearDates('2099-00')).toEqual({ from: '01/04/2099', to: '31/03/2100' });
    expect(yearDates('2026-2028')).toBeNull();
    expect(yearDates('2026')).toBeNull();
    expect(fullYearName('2026-27')).toBe('2026-2027');
    expect(fullYearName(' 2026-2027 ')).toBe('2026-2027');
  });

  test('choices: the years around today (April starts one), newest first, minus existing', () => {
    expect(yearChoices(new Date(2026, 9, 7), ['2025-2026'])).toEqual([
      '2027-2028', '2026-2027', '2024-2025', '2023-2024',
    ]); // prettier-ignore
    // February 2026 still belongs to 2025-2026.
    expect(yearChoices(new Date(2026, 1, 1), [])[1]).toBe('2025-2026');
  });
});

describe('cities', () => {
  test("every city's state is in the State list, and no city is listed twice", () => {
    const states = new Set<string>(INDIAN_STATES);
    expect(CITY_STATES.filter((c) => !states.has(c.state))).toEqual([]);
    const names = CITY_STATES.map((c) => c.city.toLowerCase());
    expect(names.filter((n, i) => names.indexOf(n) !== i)).toEqual([]);
  });

  test('a picked city gives its state, in any case', () => {
    expect(stateOfCity('pune')).toBe('Maharashtra');
    expect(stateOfCity(' Bengaluru ')).toBe('Karnataka');
    expect(stateOfCity('Atlantis')).toBeNull();
  });
});
