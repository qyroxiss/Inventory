// Company and financial-year rules, ported from MDA-Inventory
// lib/company_creation_page.dart and lib/company_year_page.dart. Messages are verbatim.

import {
  bankAcNoProblem,
  cinProblem,
  faxProblem,
  ifscProblem,
  mobileProblem,
  telephoneProblem,
} from './contact.ts';
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

/**
 * Field validation for the company form. Only Name is required. GSTIN and PAN are checked if
 * entered, as in MDA; the contact, CIN and bank checks are added (contact.ts).
 */
export function companyFieldErrors(input: {
  name?: string;
  gstin?: string;
  pan?: string;
  phone?: string;
  mobile?: string;
  fax?: string;
  cin?: string;
  bankAcNo?: string;
  bankIfsc?: string;
}) {
  const errors: Record<string, string> = {};
  if (!(input.name ?? '').trim()) errors.name = companyMessages.required;
  const checks: [string, string | null][] = [
    ['gstin', validators.gstin(input.gstin)],
    ['pan', validators.pan(input.pan)],
    ['phone', telephoneProblem(input.phone)],
    ['mobile', mobileProblem(input.mobile)],
    ['fax', faxProblem(input.fax)],
    ['cin', cinProblem(input.cin)],
    ['bankAcNo', bankAcNoProblem(input.bankAcNo)],
    ['bankIfsc', ifscProblem(input.bankIfsc)],
  ];
  for (const [k, problem] of checks) if (problem) errors[k] = problem;
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

/**
 * The usual April–March dates for a year name "2026-2027" (or "2026-27"): 01/04/2026 and
 * 31/03/2027, dd/MM/yyyy as the form shows them. Null when the name isn't such a range. Added on
 * the owner's request; the dates stay editable.
 */
export function yearDates(yearName: string): { from: string; to: string } | null {
  const m = /^\s*(\d{4})\s*-\s*(\d{2}|\d{4})\s*$/.exec(yearName);
  if (!m) return null;
  const start = Number(m[1]);
  const end = m[2]!.length === 2 ? fullEnd(start, Number(m[2])) : Number(m[2]);
  if (end !== start + 1) return null;
  return { from: `01/04/${start}`, to: `31/03/${end}` };
}

/** The 4-digit year a 2-digit end stands for: the next one with those last digits. */
const fullEnd = (start: number, yy: number) => {
  const end = Math.floor(start / 100) * 100 + yy;
  return end < start ? end + 100 : end;
};

/** "2026-27" → "2026-2027", MDA's own form; anything else is left as typed. */
export function fullYearName(yearName: string): string {
  const m = /^\s*(\d{4})\s*-\s*(\d{2})\s*$/.exec(yearName);
  if (!m) return yearName.trim();
  return `${m[1]}-${fullEnd(Number(m[1]), Number(m[2]))}`;
}

/**
 * Year names to pick from: the five years around the one [today] falls in (April starts a
 * year), newest first, leaving out those the company already has.
 */
export function yearChoices(today: Date, existing: readonly string[]): string[] {
  const current = today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1;
  const names = [];
  for (let y = current + 1; y >= current - 3; y--) names.push(`${y}-${y + 1}`);
  return names.filter((n) => !existing.includes(n));
}

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
