// Ledger Creation, ported from MDA-Inventory lib/ledger_creation_page.dart (fields, messages,
// quirks) and the Maacct/Misc_Master tables in lib/db_service.dart (docs/LOGIC-SPEC.md §2, §7).
//
// MDA's form showed Country, Aadhar No., Sales Executive and Reg. Type but never saved them. Since
// 2026-11-14 (user's request) all four are saved with the ledger, Sales Executive comes from its
// own master (misc-masters.ts), and a ledger can be marked inactive.

import { mobileProblem } from './contact.ts';
import { validators } from './validators.ts';

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

/** The Country field. Outside India the pincode may be any postal code. */
export const COUNTRIES = ['India', 'Others'] as const;

/** The party's GST registration type. */
export const REG_TYPES = [
  'Regular',
  'Composition',
  'Unregistered',
  'Consumer',
  'Overseas',
] as const;

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
  aadharFormat: 'Aadhar No. must be 12 digits',
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

/** The Opening Balance box as a number (2026-11-11 audit): commas, spaces and ₹ are allowed
 *  ("1,00,000", "₹ 500.50"); blank is 0; anything else, or more than the books can hold, is
 *  null. */
export function parseOpeningBalance(text?: string | null): number | null {
  const t = (text ?? '').replace(/[,\s₹]/g, '');
  if (!t) return 0;
  if (!/^(\d+\.?\d*|\.\d+)$/.test(t)) return null;
  const v = Math.round(Number(`${t}e2`)) / 100;
  return v < 1e12 ? v : null;
}

export const openingBalanceInvalid = 'Enter a valid amount, like 1,00,000.00';

export function ledgerFieldErrors(input: {
  name?: string;
  city?: string;
  state?: string;
  under?: string;
  pincode?: string;
  mobile?: string;
  openingBalance?: string;
  country?: string;
  aadhar?: string;
  gstin?: string;
  pan?: string;
  email?: string;
}) {
  const errors: Record<string, string> = {};
  if (!(input.name ?? '').trim()) errors.name = ledgerMessages.nameRequired;
  if (!(input.city ?? '').trim()) errors.city = ledgerMessages.cityRequired;
  if (!(input.state ?? '').trim()) errors.state = ledgerMessages.stateRequired;
  if (!input.under) errors.under = ledgerMessages.underRequired;
  const pin = (input.pincode ?? '').trim();
  if (!pin) errors.pincode = ledgerMessages.pincodeRequired;
  // An Indian PIN is 6 digits; a postal code abroad can be anything.
  else if ((input.country ?? 'India') === 'India' && !PINCODE_RE.test(pin))
    errors.pincode = ledgerMessages.pincodeFormat;
  const aadhar = (input.aadhar ?? '').replace(/\s/g, '');
  if (aadhar && !/^\d{12}$/.test(aadhar)) errors.aadhar = ledgerMessages.aadharFormat;
  // Added 2026-11-14 (MDA took any text: Q-10).
  const gstin = validators.gstin(input.gstin);
  if (gstin) errors.gstin = gstin;
  const pan = validators.pan(input.pan);
  if (pan) errors.pan = pan;
  const email = validators.email(input.email);
  if (email) errors.email = email;
  // Added: the mobile number, with its country code, when entered (contact.ts).
  const mobile = mobileProblem(input.mobile);
  if (mobile) errors.mobile = mobile;
  if (parseOpeningBalance(input.openingBalance) === null)
    errors.openingBalance = openingBalanceInvalid;
  return errors;
}
