// Tools. User Management is ported from MDA-Inventory lib/user_management_page.dart. MDA shows
// "Not built yet" for Backup Data, Company Settings, Import Data and Logs; they're built here
// (docs/design/TOOLS.md).

// ── User Management (user_management_page.dart) ─────────────────────────────────

/** A new user's role before one is picked: 'User', which isn't in the role list (Q-02). */
export const NEW_USER_ROLE = 'User';

/** The ROLE PERMISSIONS grid. Shown only — nothing enforces it (Q-12). */
export const ROLE_PERMISSIONS: [feature: string, admin: boolean, manager: boolean, operator: boolean, viewer: boolean][] = [
  ['Masters', true, true, false, false],
  ['Vouchers', true, true, true, false],
  ['Transactions', true, true, true, false],
  ['Reports', true, true, false, true],
  ['GST Reports', true, true, false, true],
  ['Tools & Settings', true, false, false, false],
  ['User Management', true, false, false, false],
]; // prettier-ignore

export const userMessages = {
  required: 'Required',
  minPassword: 'Min 4 characters',
  mismatch: 'Passwords do not match',
  adminOnly: 'Only an Admin user can manage users',
  created: (name: string) => `User "${name}" created successfully`,
  updated: (name: string) => `User "${name}" updated successfully`,
  deleted: (name: string) => `User "${name}" deleted`,
  exists: (name: string) => `User "${name}" already exists`,
  notSelf: 'Cannot delete the currently logged-in user',
  lastAdmin: 'Cannot delete the only Admin user',
  deleteConfirm: (name: string) => `Delete user "${name}"? This cannot be undone.`,
  none: 'No users yet',
} as const;

/** Is the signed-in user an Admin (`DbService.isAdmin`: case-insensitive). */
export const isAdminRole = (role?: string | null) => (role ?? '').toLowerCase() === 'admin';

/** The form's validators: name; password (required on new, min 4 when given); confirm (new). */
export function userFieldErrors(input: {
  userName: string;
  password: string;
  confirmPassword?: string;
  editing: boolean;
}): Record<string, string> {
  const m = userMessages;
  const e: Record<string, string> = {};
  if (!input.userName.trim()) e.userName = m.required;
  if (!input.editing && !input.password) e.password = m.required;
  else if (input.password && input.password.length < 4) e.password = m.minPassword;
  if (!input.editing) {
    if (!input.confirmPassword) e.confirmPassword = m.required;
    else if (input.confirmPassword !== input.password) e.confirmPassword = m.mismatch;
  }
  return e;
}

/** UserCode: the name's first four letters/digits upper-cased, '_' and the time in ms. */
export const userCode = (name: string, nowMs: number) =>
  `${name
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase()
    .substring(0, 4)}_${nowMs}`;

// ── Company Settings: voucher numbering ─────────────────────────────────────────

export const seriesMessages = {
  prefixRequired: 'Prefix is required',
  prefixChars: 'Use letters, digits, - or / only (up to 8)',
  width: 'Digits must be 1 to 8',
  saved: (name: string) => `Numbering for ${name} updated`,
  adminOnly: 'Only an Admin user can change company settings',
  companyUpdated: (name: string) => `Company "${name}" updated successfully`,
} as const;

/** A series' prefix and width, checked; the prefix is upper-cased. */
export function seriesProblem(prefix: string, width: number): string | null {
  const p = prefix.trim();
  if (!p) return seriesMessages.prefixRequired;
  if (!/^[A-Za-z0-9/-]{1,8}$/.test(p)) return seriesMessages.prefixChars;
  if (!Number.isInteger(width) || width < 1 || width > 8) return seriesMessages.width;
  return null;
}

// ── Backup and restore ───────────────────────────────────────────────────────────

/** Marks a file as one of our backups, and its layout version. */
export const BACKUP_FORMAT = 'qyroxis-inventory-backup';
export const BACKUP_VERSION = 1;

export const backupMessages = {
  notBackup: 'This file is not an Inventory backup.',
  newer: 'This backup was made by a newer version of the app.',
  restored: (name: string, years: number) =>
    `Restored "${name}" with ${years} year${years === 1 ? '' : 's'}.`,
  exists: (name: string) =>
    `"${name}" is already in this account, so nothing was restored. Delete it first, or restore into another account.`,
} as const;

export const logMessages = { none: 'No log entries in this period' } as const;
