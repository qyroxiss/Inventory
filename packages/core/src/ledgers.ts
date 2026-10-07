// Ledger Creation, ported from MDA-Inventory lib/ledger_creation_page.dart (fields, messages,
// quirks) and the Maacct/Misc_Master tables in lib/db_service.dart (docs/LOGIC-SPEC.md §2, §7).
//
// MDA's own form has three fields that are collected but never saved anywhere — Aadhar No.,
// Sales Executive and Reg. Type have no matching column in Maacct and are never written on save
// or update. Kept in the UI for look and feel, but there is nothing here to validate or persist
// for them; they never reach this module or the API.

import { mobileProblem } from './contact.ts';

/** MDA's own list, in its own order (ledger_creation_page.dart:25-34). */
export const INDIAN_STATES = [
  'Andaman & Nicobar Islands', 'Andhra Pradesh', 'Arunachal Pradesh',
  'Assam', 'Bihar', 'Chandigarh', 'Chhattisgarh',
  'Dadra & Nagar Haveli and Daman & Diu', 'Delhi', 'Goa', 'Gujarat',
  'Haryana', 'Himachal Pradesh', 'Jammu & Kashmir', 'Jharkhand',
  'Karnataka', 'Kerala', 'Ladakh', 'Lakshadweep', 'Madhya Pradesh',
  'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha',
  'Puducherry', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana',
  'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
] as const; // prettier-ignore

/** Shown in the Country field, but never saved — MDA has no Country column on Maacct. */
export const COUNTRIES = ['India', 'Others'] as const;

/** Shown in the Reg. Type field, but never saved — same dead-field pattern as Country. */
export const REG_TYPES = [
  'Regular',
  'Composition',
  'Unregistered',
  'Consumer',
  'Overseas',
] as const;

/** MDA's own fake list for Sales Executive — never saved, decorative only. */
export const SALES_EXECUTIVES = [
  'Rahul Sharma', 'Priya Patel', 'Amit Singh', 'Neha Gupta',
  'Suresh Kumar', 'Deepa Nair', 'Vijay Mehta', 'Anita Joshi',
] as const; // prettier-ignore

export const DR_CR = ['Dr', 'Cr'] as const;
export type DrCr = (typeof DR_CR)[number];

export const LEDGER_CODE_PREFIX = 'AC';
export const LEDGER_CODE_WIDTH = 4;

/** City is the one field that learns new entries (Misc_Master, type 'City'). */
export const MISC_TYPE_CITY = 'City';
/** Misc_Master code prefix for City (misc_list_service.dart:14). */
export const MISC_CITY_CODE_PREFIX = 'CT';
export const MISC_CODE_WIDTH = 4;

const PINCODE_RE = /^[1-9][0-9]{5}$/;

export const ledgerMessages = {
  nameRequired: 'Name is required',
  cityRequired: 'City is required',
  stateRequired: 'State is required',
  pincodeRequired: 'Pincode is required',
  pincodeFormat: 'Pincode must be 6 digits',
  /** Bare "Required", unlike City/State's fuller phrasing — a genuine MDA inconsistency, kept. */
  underRequired: 'Required',
  saved: (name: string, code: string) => `Ledger "${name}" saved (Code: ${code})`,
  updated: (name: string) => `Ledger "${name}" updated`,
  /** Shown in the error/red colour, same as the other Accounting Masters' remove messages. */
  removed: (name: string) => `Ledger "${name}" removed`,
  /** Verbatim; save and update use the identical wording here, unlike Group Master. */
  duplicate: 'Name is Already Exists..',
  removeBlocked: (name: string, count: number) =>
    `"${name}" is used in ${count} voucher line(s) and cannot be removed. Mark it inactive instead.`,
  updateConfirm: (name: string) => `Update record "${name}"?`,
  deleteConfirm: (name: string) => `Remove "${name}"?\nThis cannot be undone.`,
  noneFound: 'No ledgers saved yet.',
};

export function ledgerFieldErrors(input: {
  name?: string;
  city?: string;
  state?: string;
  under?: string;
  pincode?: string;
  mobile?: string;
}) {
  const errors: Record<string, string> = {};
  if (!(input.name ?? '').trim()) errors.name = ledgerMessages.nameRequired;
  if (!(input.city ?? '').trim()) errors.city = ledgerMessages.cityRequired;
  if (!(input.state ?? '').trim()) errors.state = ledgerMessages.stateRequired;
  if (!input.under) errors.under = ledgerMessages.underRequired;
  const pin = (input.pincode ?? '').trim();
  if (!pin) errors.pincode = ledgerMessages.pincodeRequired;
  else if (!PINCODE_RE.test(pin)) errors.pincode = ledgerMessages.pincodeFormat;
  // Added: the mobile number, with its country code, when entered (contact.ts).
  const mobile = mobileProblem(input.mobile);
  if (mobile) errors.mobile = mobile;
  return errors;
}
