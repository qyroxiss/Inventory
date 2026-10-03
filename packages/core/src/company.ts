// Company and financial-year rules, ported from MDA-Inventory
// lib/company_creation_page.dart and lib/company_year_page.dart. Messages are verbatim.

import { validators } from './validators.ts';

/** `'C' + first 6 alphanumerics (upper-cased) + '_' + epoch ms` (company_creation_page.dart:223-224). */
export function companyCode(name: string, nowMs: number): string {
  const raw = name.trim().replace(/[^A-Za-z0-9]/g, '');
  return `C${raw.toUpperCase().substring(0, Math.min(raw.length, 6))}_${nowMs}`;
}

/** Statutory block saved with a company: GSTIN/PAN/CIN/IFSC upper-cased, StateCode from GSTIN. */
export function companyStatutory(input: {
  gstin?: string;
  pan?: string;
  cin?: string;
  bankIfsc?: string;
}) {
  const gstin = (input.gstin ?? '').trim().toUpperCase();
  return {
    gstin,
    stateCode: validators.stateCodeFromGstin(gstin) ?? '',
    pan: (input.pan ?? '').trim().toUpperCase(),
    cin: (input.cin ?? '').trim().toUpperCase(),
    bankIfsc: (input.bankIfsc ?? '').trim().toUpperCase(),
  };
}

export const companyMessages = {
  required: 'Required',
  saved: (name: string) => `Company "${name}" saved successfully`,
  updated: (name: string) => `Company "${name}" updated successfully`,
  deleted: (name: string) => `Company "${name}" deleted`,
  deleteConfirm: (name: string) =>
    `Delete company "${name}"?\n\nAll financial year records for this company will also be removed.`,
  noneFound: 'No companies found',
};

/** Field validation for the company form (only Name is required; GSTIN/PAN checked if entered). */
export function companyFieldErrors(input: { name?: string; gstin?: string; pan?: string }) {
  const errors: Record<string, string> = {};
  if (!(input.name ?? '').trim()) errors.name = companyMessages.required;
  const g = validators.gstin(input.gstin);
  if (g) errors.gstin = g;
  const p = validators.pan(input.pan);
  if (p) errors.pan = p;
  return errors;
}

/** '2026-2027' → '2627' (company_year_page.dart:102-109). */
export function yearCode(yearName: string): string {
  const parts = yearName.split('-');
  if (parts.length !== 2 || parts[0]!.length < 2 || parts[1]!.length < 2) {
    return yearName.replaceAll('-', '');
  }
  return parts[0]!.slice(-2) + parts[1]!.slice(-2);
}

export const yearMessages = {
  required: 'Required',
  format: 'Format: YYYY-YYYY',
  selectCompany: 'Please select a company first',
  added: (year: string, company: string) => `Year "${year}" added for ${company}`,
  exists: (year: string) => `Year "${year}" already exists for this company`,
  deleteConfirm: (year: string, company: string) =>
    `Delete "${year}" for ${company}?\nThis only removes the record — the database file is not deleted.`,
};

/** Year form validation. From/To are only checked for presence, as in MDA (Q-06). */
export function yearFieldErrors(input: { yearName?: string; fromDate?: string; toDate?: string }) {
  const errors: Record<string, string> = {};
  const name = (input.yearName ?? '').trim();
  if (!name) errors.yearName = yearMessages.required;
  else if (!/^\d{4}-\d{4}$/.test(name)) errors.yearName = yearMessages.format;
  if (!(input.fromDate ?? '').trim()) errors.fromDate = yearMessages.required;
  if (!(input.toDate ?? '').trim()) errors.toDate = yearMessages.required;
  return errors;
}
