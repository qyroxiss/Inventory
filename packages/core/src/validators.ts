// Port of Validators (MDA-Inventory lib/security.dart:78-147).
// Each returns null when valid, else the message shown under the form field.

const GSTIN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
const PAN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const HSN = /^[0-9]{4,8}$/;
const CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** GSTIN check digit, as published by GSTN: weighted mod-36 over the first 14 characters. */
function gstinChecksumOk(value: string): boolean {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const code = CHARS.indexOf(value[i]!);
    if (code < 0) return false;
    const product = code * (i % 2 === 0 ? 1 : 2);
    sum += Math.trunc(product / 36) + (product % 36);
  }
  return CHARS[(36 - (sum % 36)) % 36] === value[14];
}

type Opt = { required?: boolean };
const str = (v: string | null | undefined) => (v ?? '').trim();

export const validators = {
  gstin(value: string | null | undefined, { required = false }: Opt = {}): string | null {
    const v = str(value).toUpperCase();
    if (!v) return required ? 'GSTIN is required' : null;
    if (v.length !== 15) return 'GSTIN must be 15 characters';
    if (!GSTIN.test(v)) return 'Invalid GSTIN format';
    if (!gstinChecksumOk(v)) return 'Invalid GSTIN check digit';
    return null;
  },

  pan(value: string | null | undefined, { required = false }: Opt = {}): string | null {
    const v = str(value).toUpperCase();
    if (!v) return required ? 'PAN is required' : null;
    return PAN.test(v) ? null : 'PAN must look like AAAAA9999A';
  },

  hsn(value: string | null | undefined, { required = false }: Opt = {}): string | null {
    const v = str(value);
    if (!v) return required ? 'HSN/SAC is required' : null;
    return HSN.test(v) ? null : 'HSN/SAC must be 4 to 8 digits';
  },

  mobile(value: string | null | undefined, { required = false }: Opt = {}): string | null {
    const v = str(value);
    if (!v) return required ? 'Mobile is required' : null;
    return /^[6-9][0-9]{9}$/.test(v) ? null : 'Enter a 10 digit mobile number';
  },

  email(value: string | null | undefined, { required = false }: Opt = {}): string | null {
    const v = str(value);
    if (!v) return required ? 'Email is required' : null;
    return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v) ? null : 'Enter a valid email address';
  },

  pincode(value: string | null | undefined, { required = false }: Opt = {}): string | null {
    const v = str(value);
    if (!v) return required ? 'PIN code is required' : null;
    return /^[1-9][0-9]{5}$/.test(v) ? null : 'PIN code must be 6 digits';
  },

  /** The first two characters of a GSTIN are the GST state code. */
  stateCodeFromGstin(gstin: string | null | undefined): string | null {
    const v = str(gstin);
    return v.length >= 2 ? v.substring(0, 2) : null;
  },
};
