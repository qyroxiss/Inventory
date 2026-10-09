// Contact and bank number formats for the Company and Ledger forms. Not in MDA: its boxes take
// any text. Added on the owner's request (2026-10-07): a mobile number carries its country code,
// telephone and fax are landline numbers, and statutory and bank numbers have their fixed shapes.
// Every field stays optional; a blank one is never an error.

/** Country dialling codes offered beside a mobile number. India first: it's the default. */
export const COUNTRY_CODES: readonly { code: string; country: string }[] = [
  { code: '+91', country: 'India' },
  { code: '+971', country: 'UAE' },
  { code: '+966', country: 'Saudi Arabia' },
  { code: '+974', country: 'Qatar' },
  { code: '+965', country: 'Kuwait' },
  { code: '+968', country: 'Oman' },
  { code: '+973', country: 'Bahrain' },
  { code: '+977', country: 'Nepal' },
  { code: '+975', country: 'Bhutan' },
  { code: '+880', country: 'Bangladesh' },
  { code: '+94', country: 'Sri Lanka' },
  { code: '+65', country: 'Singapore' },
  { code: '+60', country: 'Malaysia' },
  { code: '+1', country: 'USA / Canada' },
  { code: '+44', country: 'UK' },
  { code: '+61', country: 'Australia' },
  { code: '+64', country: 'New Zealand' },
  { code: '+49', country: 'Germany' },
  { code: '+33', country: 'France' },
];
export const DEFAULT_COUNTRY_CODE = '+91';

/** Most digits a mobile number may have after its country code: 10 in India. */
export const mobileDigits = (code: string) => (code === DEFAULT_COUNTRY_CODE ? 10 : 12);

const digitsOf = (v: string) => v.replace(/\D/g, '');

/** "+91 9876543210" → its code and number. A number saved without a code is taken as Indian. */
export function splitPhone(value: string | null | undefined): { code: string; number: string } {
  const v = (value ?? '').trim();
  const m = /^(\+\d{1,4})[\s-]*(.*)$/.exec(v);
  if (m && COUNTRY_CODES.some((c) => c.code === m[1]))
    return { code: m[1]!, number: digitsOf(m[2]!) };
  return { code: DEFAULT_COUNTRY_CODE, number: digitsOf(v) };
}

/** The stored form, "+91 9876543210"; blank when there's no number. */
export const joinPhone = (code: string, number: string) => {
  const n = digitsOf(number);
  return n ? `${code} ${n}` : '';
};

export const contactMessages = {
  mobileIndia: 'Enter a 10-digit mobile number starting with 6, 7, 8 or 9',
  mobileOther: 'Enter a mobile number of 6 to 12 digits',
  telephone: 'Enter the STD code and number, 10 digits in all, e.g. 022 2345 6789',
  fax: 'Enter the STD code and number, 10 digits in all, e.g. 022 2345 6790',
  cin: 'CIN is 21 characters, e.g. U12345MH2020PTC123456',
  bankAcNo: 'Account number must be 9 to 18 digits',
  ifsc: 'IFSC is 11 characters, e.g. SBIN0001234',
};

/** A mobile number as stored ("+91 9876543210"); blank is fine. */
export function mobileProblem(value: string | null | undefined): string | null {
  if (!(value ?? '').trim()) return null;
  const { code, number } = splitPhone(value);
  if (code === DEFAULT_COUNTRY_CODE)
    return /^[6-9]\d{9}$/.test(number) ? null : contactMessages.mobileIndia;
  return /^\d{6,12}$/.test(number) ? null : contactMessages.mobileOther;
}

/**
 * An Indian landline or fax: digits, spaces, +, - and brackets only. STD code plus number make
 * 10 digits starting 1 to 8 (a mobile starts 6 to 9), with an optional leading 0 or +91.
 */
const landline = (value: string | null | undefined, message: string) => {
  const v = (value ?? '').trim();
  if (!v) return null;
  if (!/^[0-9+\-() ]+$/.test(v)) return message;
  let d = digitsOf(v);
  if (/^\s*\+/.test(v) && d.startsWith('91')) d = d.slice(2);
  else if (d.startsWith('0')) d = d.slice(1);
  return /^[1-8]\d{9}$/.test(d) ? null : message;
};
export const telephoneProblem = (v: string | null | undefined) =>
  landline(v, contactMessages.telephone);
export const faxProblem = (v: string | null | undefined) => landline(v, contactMessages.fax);

/** Corporate Identity Number: L/U, 5 digits, state, year, company type, 6 digits. */
export function cinProblem(value: string | null | undefined): string | null {
  const v = (value ?? '').trim().toUpperCase();
  if (!v) return null;
  return /^[LU]\d{5}[A-Z]{2}\d{4}[A-Z]{3}\d{6}$/.test(v) ? null : contactMessages.cin;
}

export function bankAcNoProblem(value: string | null | undefined): string | null {
  const v = (value ?? '').trim();
  if (!v) return null;
  return /^\d{9,18}$/.test(v) ? null : contactMessages.bankAcNo;
}

/** IFSC: 4 letters (the bank), a 0, then 6 letters or digits (the branch). */
export function ifscProblem(value: string | null | undefined): string | null {
  const v = (value ?? '').trim().toUpperCase();
  if (!v) return null;
  return /^[A-Z]{4}0[A-Z0-9]{6}$/.test(v) ? null : contactMessages.ifsc;
}
