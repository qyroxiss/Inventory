// Role Permissions (added 2026-11-12, beyond MDA): which pages each account can see.
//
// MDA shows a ROLE PERMISSIONS grid on User Management but enforces none of it (Q-12). Here the
// Admin sets, for every page, one of three levels per role, and can change single pages for one
// user:
//   - hidden: the page is gone from the menu and the server refuses it;
//   - view:   the page opens, lists and prints, but nothing can be saved, changed or cancelled;
//   - full:   everything.
// MDA's four roles start from MDA's grid (tools.ts ROLE_PERMISSIONS). The Admin can add roles.
//
// Fixed rules, so nobody can be locked out:
//   - an Admin always has full use of every page;
//   - User Management and Role Permissions are for Admins only, whatever a role says.

import { ROLES } from './book-login.ts';
import { ROLE_PERMISSIONS, isAdminRole } from './tools.ts';

export const ACCESS_LEVELS = ['hidden', 'view', 'full'] as const;
export type Access = (typeof ACCESS_LEVELS)[number];

export const ACCESS_LABELS: Record<Access, string> = {
  hidden: 'Hidden',
  view: 'View only',
  full: 'Full',
};

/** Every page that can be controlled, in menu order (apps/web nav.ts), by section. */
export const PERMISSION_SECTIONS: { label: string; pages: string[] }[] = [
  { label: 'Dashboard', pages: ['Dashboard'] },
  {
    label: 'Masters',
    pages: [
      'Group Master',
      'Sub Group Master',
      'Ledger Creation',
      'Sales Executive',
      'Stock Group',
      'Stock Sub Group',
      'Stock Item',
      'Godown',
      'Unit Master',
      'Sale Type',
    ],
  },
  {
    label: 'Accounting Vouchers',
    pages: ['Receipt', 'Payment', 'Journal Voucher', 'Debit Note', 'Credit Note'],
  },
  {
    label: 'Transactions',
    pages: [
      'Purchase Invoice',
      'Sales Invoice',
      'Purchase Return',
      'Sales Return',
      'Stock Journal',
    ],
  },
  {
    label: 'Reports',
    pages: [
      'Stock Summary',
      'Stock Register',
      'Sales Register',
      'Purchase Register',
      'Profit & Loss',
      'Balance Sheet',
      'Trial Balance',
      'Day Book',
      'Ledger Statement',
      'Outstanding',
    ],
  },
  {
    label: 'GST Reports',
    pages: ['GSTR-1', 'GSTR-3B', 'GST Audit', 'HSN Summary', 'Input Tax Credit'],
  },
  {
    label: 'Tools',
    pages: [
      'Backup Data',
      'User Management',
      'Role Permissions',
      'Company Settings',
      'Import Data',
      'Logs',
    ],
  },
];

export const PERMISSION_PAGES: string[] = PERMISSION_SECTIONS.flatMap((s) => s.pages);

/** Pages only an Admin may use, whatever a role or user is set to. */
export const ADMIN_ONLY_PAGES = new Set(['User Management', 'Role Permissions']);

/** The roles every book has. Their names can't be changed and they can't be deleted. */
export const BUILT_IN_ROLES: readonly string[] = ROLES;

export type PageAccess = Record<string, Access>;

/** Which pages each row of MDA's grid covers. */
const GRID_PAGES: Record<string, string[]> = {
  Masters: PERMISSION_SECTIONS[1]!.pages,
  Vouchers: PERMISSION_SECTIONS[2]!.pages,
  Transactions: PERMISSION_SECTIONS[3]!.pages,
  Reports: PERMISSION_SECTIONS[4]!.pages,
  'GST Reports': PERMISSION_SECTIONS[5]!.pages,
  'Tools & Settings': ['Backup Data', 'Company Settings', 'Import Data', 'Logs'],
  'User Management': ['User Management', 'Role Permissions'],
};

/** A role's starting pages: MDA's grid for MDA's roles. Any other role (MDA's 'User', or a new
 *  one) starts as a Manager does. The Dashboard starts open for everyone, as in MDA. */
export function defaultPageAccess(role: string): PageAccess {
  const col = BUILT_IN_ROLES.findIndex((r) => r.toLowerCase() === role.trim().toLowerCase());
  const at = col < 0 ? 1 : col; // Manager
  const out: PageAccess = { Dashboard: 'full' };
  for (const [feature, ...allowed] of ROLE_PERMISSIONS) {
    for (const page of GRID_PAGES[feature] ?? []) out[page] = allowed[at] ? 'full' : 'hidden';
  }
  return out;
}

const isAccess = (v: unknown): v is Access => ACCESS_LEVELS.includes(v as Access);

/** Keeps only known pages with known levels (stored JSON may be old or hand-edited). */
export function cleanPageAccess(raw: unknown): PageAccess {
  const out: PageAccess = {};
  if (raw && typeof raw === 'object') {
    for (const [page, level] of Object.entries(raw as Record<string, unknown>)) {
      if (PERMISSION_PAGES.includes(page) && isAccess(level)) out[page] = level;
    }
  }
  return out;
}

/**
 * What one user may do on every page: their role's starting pages, then the role's saved
 * settings, then their own changes. Admins get everything; admin-only pages stay hidden from
 * everyone else.
 */
export function resolvePageAccess(input: {
  role: string;
  rolePages?: unknown;
  userPages?: unknown;
}): PageAccess {
  const admin = isAdminRole(input.role);
  const merged: PageAccess = {
    ...defaultPageAccess(input.role),
    ...cleanPageAccess(input.rolePages),
    ...cleanPageAccess(input.userPages),
  };
  const out: PageAccess = {};
  for (const page of PERMISSION_PAGES) {
    out[page] = admin ? 'full' : ADMIN_ONLY_PAGES.has(page) ? 'hidden' : (merged[page] ?? 'hidden');
  }
  return out;
}

/** Can the page be opened at all (view or full)? */
export const canView = (a: PageAccess, page: string) => (a[page] ?? 'hidden') !== 'hidden';
/** Can things be saved, changed or cancelled on the page? */
export const canEdit = (a: PageAccess, page: string) => a[page] === 'full';

/** The page a voucher type belongs to (vouchers.ts VOUCHER_SERIES). */
export const VOUCHER_TYPE_PAGES: Record<string, string> = {
  RCP: 'Receipt',
  BNK: 'Receipt',
  PAY: 'Payment',
  BPAY: 'Payment',
  JNL: 'Journal Voucher',
  DRN: 'Debit Note',
  CRN: 'Credit Note',
};

/** The page of a return kind. */
export const RETURN_KIND_PAGES: Record<string, string> = {
  PRT: 'Purchase Return',
  SRT: 'Sales Return',
};

/** A role name: required, not too long, and no clash with another role (case ignored). */
export function roleNameProblem(name: string, existing: string[]): string | null {
  const n = name.trim();
  if (!n) return permissionMessages.roleRequired;
  if (n.length > 30) return permissionMessages.roleTooLong;
  if (n.toLowerCase() === 'user') return permissionMessages.roleExists(n);
  if (existing.some((e) => e.trim().toLowerCase() === n.toLowerCase()))
    return permissionMessages.roleExists(n);
  return null;
}

export const permissionMessages = {
  adminOnly: 'Only an Admin can change role permissions.',
  noAccess: 'You do not have permission to open this page.',
  viewOnly: 'You can only view this page. Ask your Admin for full access.',
  roleRequired: 'Required',
  roleTooLong: 'Max 30 characters',
  roleExists: (n: string) => `Role "${n}" already exists.`,
  adminFixed: 'The Admin role always has full access and cannot be changed.',
  builtInFixed: (n: string) => `"${n}" is a standard role and cannot be renamed or deleted.`,
  roleInUse: (n: string, count: number) =>
    `Role "${n}" is given to ${count} user${count === 1 ? '' : 's'}. Move ${count === 1 ? 'that user' : 'them'} to another role first.`,
  roleNotFound: (n: string) => `Role "${n}" was not found.`,
  userNotFound: 'User not found.',
};
