// Company, year, date and login rules. Expected values are read off the Dart source
// (cited per test); these functions are not in the golden export because they live in pages.
import { describe, expect, test } from 'vitest';
import {
  companyCode,
  companyFieldErrors,
  companyStatutory,
  financialYearLabel,
  isInFinancialYear,
  loginFieldErrors,
  newPasswordErrors,
  parseDate,
  yearCode,
  yearFieldErrors,
} from '../src/index.ts';

describe('company (company_creation_page.dart)', () => {
  test('code = C + 6 alphanumerics + _ + ms', () => {
    expect(companyCode('Sharma & Sons Pvt. Ltd.', 1767225600000)).toBe('CSHARMA_1767225600000');
    expect(companyCode('  ab-1 ', 5)).toBe('CAB1_5');
    expect(companyCode('!!!', 5)).toBe('C_5');
  });

  test('state code comes from the GSTIN only; fields upper-cased', () => {
    expect(companyStatutory({ gstin: ' 27aapfu0939f1zv ', pan: 'aapfu0939f' })).toEqual({
      gstin: '27AAPFU0939F1ZV',
      stateCode: '27',
      pan: 'AAPFU0939F',
      cin: '',
      bankIfsc: '',
    });
    expect(companyStatutory({}).stateCode).toBe('');
  });

  test('only Name is required; GSTIN/PAN validated if entered', () => {
    expect(companyFieldErrors({ name: ' ' })).toEqual({ name: 'Required' });
    expect(companyFieldErrors({ name: 'X', gstin: '27AAPFU0939F1Z' })).toEqual({
      gstin: 'GSTIN must be 15 characters',
    });
    expect(companyFieldErrors({ name: 'X' })).toEqual({});
  });
});

describe('financial year (company_year_page.dart)', () => {
  test('year code', () => {
    expect(yearCode('2026-2027')).toBe('2627');
    expect(yearCode('26-27')).toBe('2627');
    expect(yearCode('2026')).toBe('2026');
  });

  test('form errors: name format, dates only checked for presence (Q-06)', () => {
    expect(yearFieldErrors({})).toEqual({
      yearName: 'Required',
      fromDate: 'Required',
      toDate: 'Required',
    });
    expect(yearFieldErrors({ yearName: '2026-27', fromDate: 'x', toDate: 'y' })).toEqual({
      yearName: 'Format: YYYY-YYYY',
    });
    // To before From is accepted, as in MDA.
    expect(
      yearFieldErrors({ yearName: '2026-2027', fromDate: '31/03/2027', toDate: '01/04/2026' }),
    ).toEqual({});
  });
});

describe('dates (db_service.dart:29-60)', () => {
  test('parseDate accepts ISO and d/m/y with / - . separators', () => {
    expect(parseDate('2026-04-01')).toBe('2026-04-01');
    expect(parseDate('2026-04-01T10:00:00')).toBe('2026-04-01');
    expect(parseDate('01/04/2026')).toBe('2026-04-01');
    expect(parseDate('1-4-26')).toBe('2026-04-01');
    expect(parseDate('1.4.2026')).toBe('2026-04-01');
    expect(parseDate('31/02/2026')).toBe('2026-03-03'); // Dart DateTime rolls over
    expect(parseDate('1-Apr-26')).toBeNull(); // MDA cannot parse its own default either
    expect(parseDate('')).toBeNull();
  });

  test('FY guard is inclusive and open when the range is unknown', () => {
    expect(isInFinancialYear('2026-04-01', '2026-04-01', '2027-03-31')).toBe(true);
    expect(isInFinancialYear('2027-03-31', '2026-04-01', '2027-03-31')).toBe(true);
    expect(isInFinancialYear('2027-04-01', '2026-04-01', '2027-03-31')).toBe(false);
    expect(isInFinancialYear('1999-01-01', null, null)).toBe(true);
    expect(financialYearLabel('2026-2027', '2026-04-01', '2027-03-31')).toBe(
      '2026-2027 (01/04/2026 to 31/03/2027)',
    );
    expect(financialYearLabel('2026-2027', null, null)).toBe('2026-2027');
  });
});

describe('book login (auth_page.dart)', () => {
  test('username is trimmed, password is not', () => {
    expect(loginFieldErrors({ username: '  ', password: '' })).toEqual({
      username: 'Required',
      password: 'Required',
    });
    expect(loginFieldErrors({ username: 'a', password: ' ' })).toEqual({});
  });

  test('forced change: 6+ chars, not admin, must match', () => {
    expect(newPasswordErrors({ newPassword: '12345', confirmPassword: '12345' })).toEqual({
      newPassword: 'Use at least 6 characters',
    });
    expect(newPasswordErrors({ newPassword: 'admin', confirmPassword: 'admin' })).toEqual({
      newPassword: 'Use at least 6 characters',
    });
    expect(newPasswordErrors({ newPassword: 'secret1', confirmPassword: 'secret2' })).toEqual({
      confirmPassword: 'Passwords do not match',
    });
    expect(newPasswordErrors({ newPassword: 'secret1', confirmPassword: 'secret1' })).toEqual({});
  });
});
