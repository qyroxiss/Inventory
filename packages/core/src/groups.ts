// Group Master and Sub Group Master, ported from MDA-Inventory lib/group_master_page.dart and
// lib/sub_group_master_page.dart (fields, messages, quirks), and the group seed in
// lib/db_service.dart:936-984 (docs/LOGIC-SPEC.md §2, §3, §7). Both read and write the same
// table (Maacct2 / account_groups): Group Master only ever sees ParentGrp='Parent' rows,
// Sub Group Master only the rest.

/** MDA's own order (group_master_page.dart:40). Not alphabetical — kept as is. */
export const GROUP_TYPES = ['Liabilities', 'Expenses', 'Assets', 'Income'] as const;
export type GroupType = (typeof GROUP_TYPES)[number];

export const LEDGER_OPTIONS = ['Yes', 'No'] as const;

/** Every top-level group is stored with this sentinel; Group Master never changes it. */
export const TOP_LEVEL = 'Parent';

export const groupMessages = {
  nameRequired: 'Group name is required',
  typeRequired: 'Please select a group type',
  saved: (name: string, code: string) => `Group "${name}" saved (Code: ${code})`,
  updated: (name: string) => `Group "${name}" updated`,
  removed: (name: string) => `Group "${name}" removed`,
  /** Verbatim, double period and all (group_master_page.dart:103). */
  duplicateOnSave: 'Name is Already Exists..',
  duplicateOnUpdate: 'This Name Already Exists',
  /** Shown only if Remove is somehow reached on a top-level group; the button is disabled (Q-16). */
  notDeletable: 'This record will be not deleted',
  updateConfirm: (name: string) => `Wants to update this record "${name}"?`,
  deleteConfirm: (name: string) => `Wants to remove this record "${name}"?\nThis cannot be undone.`,
  noneFound: 'No groups saved yet.',
};

export function groupFieldErrors(input: { name?: string; type?: string }) {
  const errors: Record<string, string> = {};
  if (!(input.name ?? '').trim()) errors.name = groupMessages.nameRequired;
  if (!input.type) errors.type = groupMessages.typeRequired;
  return errors;
}

/** Sub Group Master's own messages (sub_group_master_page.dart) — a different wording from
 * Group Master's, including its own duplicate-name text and its own confirm dialogs. */
export const subGroupMessages = {
  nameRequired: 'Sub group name is required',
  underRequired: 'Please select an under group',
  saved: (name: string, code: string) => `Sub Group "${name}" saved (Code: ${code})`,
  updated: (name: string) => `Sub Group "${name}" updated`,
  /** MDA shows this with the error/red toast colour even though it is a success message. */
  removed: (name: string) => `Sub Group "${name}" removed`,
  duplicateOnSave: (name: string) => `Error: Sub Group "${name}" may already exist.`,
  duplicateOnUpdate: (name: string) => `Error: "${name}" may conflict with an existing sub group.`,
  updateConfirm: (name: string) => `Update record "${name}"?`,
  deleteConfirm: (name: string) => `Remove "${name}"?\nThis cannot be undone.`,
  noneFound: 'No sub groups saved yet.',
};

export function subGroupFieldErrors(input: { name?: string; under?: string }) {
  const errors: Record<string, string> = {};
  if (!(input.name ?? '').trim()) errors.name = subGroupMessages.nameRequired;
  if (!input.under) errors.under = subGroupMessages.underRequired;
  return errors;
}

/** Sub Group's code prefix and width (docs/LOGIC-SPEC.md §4.1). */
export const SUB_GROUP_CODE_PREFIX = 'SG';
export const SUB_GROUP_CODE_WIDTH = 4;

/** First letter of the Group Type (A/L/E/I) — the code prefix (docs/LOGIC-SPEC.md §4.1). */
export const groupCodePrefix = (type: GroupType): string => type.charAt(0);

/**
 * `prefix + pad(max(numeric suffix of existing codes starting with prefix) + 1, width)`
 * (code_gen.dart:13-61). Codes that don't parse as numbers count as 0, so an odd hand-entered
 * code never breaks generation. `existingCodes` should be every code in scope, not pre-filtered.
 */
export function nextCode(existingCodes: string[], prefix: string, width = 3): string {
  let max = 0;
  for (const code of existingCodes) {
    if (!code.startsWith(prefix)) continue;
    const n = parseInt(code.slice(prefix.length).replace(/[^0-9]/g, ''), 10);
    if (!Number.isNaN(n) && n > max) max = n;
  }
  return prefix + String(max + 1).padStart(width, '0');
}

export type DefaultGroup = {
  grpCode: string;
  grpName: string;
  grpType: GroupType;
  parentGrp: string;
  sortOrder: number;
};

/** The 28 groups every new book is seeded with, verbatim (db_service.dart:936-984). */
export const DEFAULT_GROUPS: DefaultGroup[] = [
  // Assets
  { grpCode: 'A001', grpName: 'Current Assets', grpType: 'Assets', parentGrp: 'Parent', sortOrder: 1 },
  { grpCode: 'A002', grpName: 'Bank Accounts', grpType: 'Assets', parentGrp: 'A001', sortOrder: 1 },
  { grpCode: 'A003', grpName: 'Cash-in-Hand', grpType: 'Assets', parentGrp: 'A001', sortOrder: 2 },
  { grpCode: 'A004', grpName: 'Deposits (Asset)', grpType: 'Assets', parentGrp: 'A001', sortOrder: 3 },
  { grpCode: 'A005', grpName: 'Loans & Advances (Asset)', grpType: 'Assets', parentGrp: 'A001', sortOrder: 4 },
  { grpCode: 'A006', grpName: 'Stock-in-Hand', grpType: 'Assets', parentGrp: 'A001', sortOrder: 5 },
  { grpCode: 'A007', grpName: 'Sundry Debtors', grpType: 'Assets', parentGrp: 'A001', sortOrder: 6 },
  { grpCode: 'A008', grpName: 'Fixed Assets', grpType: 'Assets', parentGrp: 'Parent', sortOrder: 2 },
  { grpCode: 'A009', grpName: 'Investments', grpType: 'Assets', parentGrp: 'Parent', sortOrder: 3 },
  { grpCode: 'A010', grpName: 'Misc. Expenses (ASSET)', grpType: 'Assets', parentGrp: 'Parent', sortOrder: 4 },
  // Liabilities
  { grpCode: 'L001', grpName: 'Branch / Divisions', grpType: 'Liabilities', parentGrp: 'Parent', sortOrder: 1 },
  { grpCode: 'L002', grpName: 'Capital Account', grpType: 'Liabilities', parentGrp: 'Parent', sortOrder: 2 },
  { grpCode: 'L003', grpName: 'Reserves & Surplus', grpType: 'Liabilities', parentGrp: 'Parent', sortOrder: 3 },
  { grpCode: 'L004', grpName: 'Current Liabilities', grpType: 'Liabilities', parentGrp: 'Parent', sortOrder: 4 },
  { grpCode: 'L005', grpName: 'Duties & Taxes', grpType: 'Liabilities', parentGrp: 'L004', sortOrder: 1 },
  { grpCode: 'L006', grpName: 'Provisions', grpType: 'Liabilities', parentGrp: 'L004', sortOrder: 2 },
  { grpCode: 'L007', grpName: 'Sundry Creditors', grpType: 'Liabilities', parentGrp: 'L004', sortOrder: 3 },
  { grpCode: 'L008', grpName: 'Loans (Liability)', grpType: 'Liabilities', parentGrp: 'Parent', sortOrder: 5 },
  { grpCode: 'L009', grpName: 'Bank OD A/c', grpType: 'Liabilities', parentGrp: 'L008', sortOrder: 1 },
  { grpCode: 'L010', grpName: 'Secured Loans', grpType: 'Liabilities', parentGrp: 'L008', sortOrder: 2 },
  { grpCode: 'L011', grpName: 'Unsecured Loans', grpType: 'Liabilities', parentGrp: 'L008', sortOrder: 3 },
  { grpCode: 'L012', grpName: 'Suspense A/c', grpType: 'Liabilities', parentGrp: 'Parent', sortOrder: 6 },
  // Expenses
  { grpCode: 'E001', grpName: 'Direct Expenses', grpType: 'Expenses', parentGrp: 'Parent', sortOrder: 1 },
  { grpCode: 'E002', grpName: 'Indirect Expenses', grpType: 'Expenses', parentGrp: 'Parent', sortOrder: 2 },
  { grpCode: 'E003', grpName: 'Purchase Accounts', grpType: 'Expenses', parentGrp: 'Parent', sortOrder: 3 },
  // Income
  { grpCode: 'I001', grpName: 'Direct Incomes', grpType: 'Income', parentGrp: 'Parent', sortOrder: 1 },
  { grpCode: 'I002', grpName: 'Indirect Incomes', grpType: 'Income', parentGrp: 'Parent', sortOrder: 2 },
  { grpCode: 'I003', grpName: 'Sales Accounts', grpType: 'Income', parentGrp: 'Parent', sortOrder: 3 },
]; // prettier-ignore
