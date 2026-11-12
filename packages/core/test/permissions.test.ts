import { describe, expect, test } from 'vitest';
import {
  PERMISSION_PAGES,
  canEdit,
  canView,
  cleanPageAccess,
  defaultPageAccess,
  resolvePageAccess,
  roleNameProblem,
  permissionMessages as pm,
} from '../src/index.ts';

describe('Role Permissions: starting pages are MDA’s grid', () => {
  test('Operator: vouchers and bills, no masters, reports or tools', () => {
    const a = resolvePageAccess({ role: 'Operator' });
    expect(a['Dashboard']).toBe('full');
    expect(a['Receipt']).toBe('full');
    expect(a['Sales Invoice']).toBe('full');
    expect(a['Ledger Creation']).toBe('hidden');
    expect(a['Trial Balance']).toBe('hidden');
    expect(a['GSTR-1']).toBe('hidden');
    expect(a['Backup Data']).toBe('hidden');
  });

  test('Viewer: reports only; Manager: everything but tools', () => {
    const v = resolvePageAccess({ role: 'viewer' });
    expect(v['Day Book']).toBe('full');
    expect(v['Sales Invoice']).toBe('hidden');
    const m = resolvePageAccess({ role: 'Manager' });
    expect(m['Stock Item']).toBe('full');
    expect(m['Logs']).toBe('hidden');
  });

  test('an unknown role (MDA’s "User", or a new one) starts as a Manager', () => {
    expect(defaultPageAccess('User')).toEqual(defaultPageAccess('Manager'));
  });

  test('every page gets a level', () => {
    expect(Object.keys(resolvePageAccess({ role: 'Operator' })).sort()).toEqual(
      [...PERMISSION_PAGES].sort(),
    );
  });
});

describe('Role Permissions: fixed rules', () => {
  test('an Admin has full use of everything, whatever is stored', () => {
    const a = resolvePageAccess({
      role: 'ADMIN',
      rolePages: { 'Sales Invoice': 'hidden' },
      userPages: { Logs: 'hidden' },
    });
    expect(Object.values(a).every((l) => l === 'full')).toBe(true);
  });

  test('User Management and Role Permissions stay hidden from everyone else', () => {
    const a = resolvePageAccess({
      role: 'Manager',
      rolePages: { 'User Management': 'full', 'Role Permissions': 'full' },
    });
    expect(a['User Management']).toBe('hidden');
    expect(a['Role Permissions']).toBe('hidden');
  });
});

describe('Role Permissions: role settings, then user changes', () => {
  test('a role’s saved pages replace the starting ones; a user’s changes win over both', () => {
    const a = resolvePageAccess({
      role: 'Operator',
      rolePages: { 'Trial Balance': 'view', Receipt: 'view' },
      userPages: { Receipt: 'full', 'Sales Invoice': 'hidden' },
    });
    expect(a['Trial Balance']).toBe('view');
    expect(a['Receipt']).toBe('full');
    expect(a['Sales Invoice']).toBe('hidden');
    expect(a['Payment']).toBe('full');
  });

  test('unknown pages and levels are dropped', () => {
    expect(cleanPageAccess({ Receipt: 'view', Nope: 'full', Payment: 'edit', x: 1 })).toEqual({
      Receipt: 'view',
    });
    expect(cleanPageAccess(null)).toEqual({});
  });

  test('canView / canEdit', () => {
    const a = { Receipt: 'view', Payment: 'full', Journal: 'hidden' } as const;
    expect([canView(a, 'Receipt'), canEdit(a, 'Receipt')]).toEqual([true, false]);
    expect([canView(a, 'Payment'), canEdit(a, 'Payment')]).toEqual([true, true]);
    expect([canView(a, 'Journal'), canView(a, 'Missing')]).toEqual([false, false]);
  });
});

describe('Role Permissions: role names', () => {
  test('required, at most 30 characters, and new (case ignored)', () => {
    expect(roleNameProblem('  ', [])).toBe(pm.roleRequired);
    expect(roleNameProblem('x'.repeat(31), [])).toBe(pm.roleTooLong);
    expect(roleNameProblem('operator', ['Operator'])).toBe(pm.roleExists('operator'));
    expect(roleNameProblem('User', [])).toBe(pm.roleExists('User'));
    expect(roleNameProblem('Cashier', ['Admin', 'Operator'])).toBeNull();
  });
});
