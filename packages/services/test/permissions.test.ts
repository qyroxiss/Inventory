import { beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { permissionMessages as pm } from '@qi/core';
import { openDatabase, sql, type Db } from '@qi/db';
import {
  UserError,
  accessFor,
  createBookUser,
  createCompany,
  createRole,
  createYear,
  deleteRole,
  exportBackup,
  listAuditLog,
  listPermissions,
  renameRole,
  restoreBackup,
  roleNames,
  saveRolePages,
  saveUserPages,
  updateBookUser,
  type Actor,
} from '../src/index.ts';

const ACC = 'acc-1';
let db: Db;
let admin: Actor;
let bookId: string;
let companyId: string;

beforeAll(async () => {
  ({ db } = await openDatabase());
});
beforeEach(async () => {
  await db.execute(
    sql`TRUNCATE audit_log, book_roles, book_users, account_groups, misc_list, voucher_series, financial_years, books, companies RESTART IDENTITY CASCADE`,
  );
  const company = await createCompany(db, ACC, { compName: 'Sharma Traders', add1: 'MG Road' }, 1000);
  companyId = company.id;
  const y = await createYear(db, ACC, company.id, { yearName: '2026-2027', fromDate: '01/04/2026', toDate: '31/03/2027' });
  bookId = y.bookId;
  admin = { bookId, userName: 'admin', role: 'Admin' };
}); // prettier-ignore

const rejects = async (p: Promise<unknown>, message: string) => {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(UserError);
  expect((err as UserError).message).toBe(message);
};

const addUser = async (userName: string, role: string) => {
  const u = await createBookUser(db, admin, {
    userName,
    password: 'pass1',
    confirmPassword: 'pass1',
    role,
    isActive: true,
  });
  return u.userCode;
};

describe('Role Permissions (services)', () => {
  test('only an Admin can see or change permissions', async () => {
    const op: Actor = { bookId, userName: 'ravi', role: 'Operator' };
    await rejects(listPermissions(db, op), pm.adminOnly);
    await rejects(saveRolePages(db, op, 'Viewer', {}), pm.adminOnly);
    await rejects(createRole(db, op, { name: 'Cashier' }), pm.adminOnly);
  });

  test('MDA’s four roles are listed with MDA’s grid until changed', async () => {
    const v = await listPermissions(db, admin);
    expect(v.roles.map((r) => r.name)).toEqual(['Admin', 'Manager', 'Operator', 'Viewer']);
    expect(v.roles[0]).toMatchObject({ builtIn: true, locked: true, users: 1 });
    expect(v.roles[2]!.pages['Ledger Creation']).toBe('hidden');
  });

  test('a role’s pages change for its users at once, without signing in again', async () => {
    await addUser('ravi', 'Operator');
    expect((await accessFor(db, bookId, 'ravi'))['Trial Balance']).toBe('hidden');
    const pages = (await listPermissions(db, admin)).roles[2]!.pages;
    await saveRolePages(db, admin, 'operator', { ...pages, 'Trial Balance': 'view' });
    expect((await accessFor(db, bookId, 'ravi'))['Trial Balance']).toBe('view');
    // Stored under MDA's spelling.
    expect((await listPermissions(db, admin)).roles[2]!.pages['Trial Balance']).toBe('view');
  });

  test('the Admin role can’t be changed', async () => {
    await rejects(saveRolePages(db, admin, 'Admin', {}), pm.adminFixed);
  });

  test('added roles: create (copying another), rename (users follow), delete only when unused', async () => {
    await createRole(db, admin, { name: 'Cashier', copyFrom: 'Operator' });
    await rejects(createRole(db, admin, { name: 'cashier' }), pm.roleExists('cashier'));
    expect(await roleNames(db, bookId)).toEqual([
      'Admin',
      'Manager',
      'Operator',
      'Viewer',
      'Cashier',
    ]);
    await addUser('sita', 'Cashier');
    expect((await accessFor(db, bookId, 'sita'))['Sales Invoice']).toBe('full');
    expect((await accessFor(db, bookId, 'sita'))['Ledger Creation']).toBe('hidden');

    await renameRole(db, admin, 'Cashier', 'Counter');
    const v = await listPermissions(db, admin);
    expect(v.users.find((u) => u.userName === 'sita')!.role).toBe('Counter');
    expect(v.roles.find((r) => r.name === 'Counter')).toMatchObject({ builtIn: false, users: 1 });

    await rejects(deleteRole(db, admin, 'Counter'), pm.roleInUse('Counter', 1));
    await rejects(deleteRole(db, admin, 'Viewer'), pm.builtInFixed('Viewer'));
    await rejects(renameRole(db, admin, 'Manager', 'Boss'), pm.builtInFixed('Manager'));
    const code = v.users.find((u) => u.userName === 'sita')!.userCode;
    await updateBookUser(db, admin, code, {
      userName: 'sita',
      password: '',
      role: 'Viewer',
      isActive: true,
    });
    await deleteRole(db, admin, 'Counter');
    expect(await roleNames(db, bookId)).toEqual(['Admin', 'Manager', 'Operator', 'Viewer']);
  });

  test('a user’s own changes keep only real differences from their role', async () => {
    const code = await addUser('ravi', 'Operator');
    await saveUserPages(db, admin, code, {
      Receipt: 'full',
      'Day Book': 'view',
      Payment: 'hidden',
    });
    let u = (await listPermissions(db, admin)).users.find((x) => x.userName === 'ravi')!;
    expect(u.changes).toEqual({ 'Day Book': 'view', Payment: 'hidden' });
    expect(u.pages['Day Book']).toBe('view');
    expect((await accessFor(db, bookId, 'ravi'))['Payment']).toBe('hidden');

    await saveUserPages(db, admin, code, {});
    u = (await listPermissions(db, admin)).users.find((x) => x.userName === 'ravi')!;
    expect(u.changes).toEqual({});
    expect(u.pages['Payment']).toBe('full');
  });

  test('an Admin user can’t be given changes; an inactive user gets nothing', async () => {
    const admins = (await listPermissions(db, admin)).users;
    await rejects(saveUserPages(db, admin, admins[0]!.userCode, { Logs: 'hidden' }), pm.adminFixed);
    const code = await addUser('old', 'Manager');
    await updateBookUser(db, admin, code, {
      userName: 'old',
      password: '',
      role: 'Manager',
      isActive: false,
    });
    const a = await accessFor(db, bookId, 'old');
    expect(Object.values(a).every((l) => l === 'hidden')).toBe(true);
  });

  test('changes are written to the log', async () => {
    await createRole(db, admin, { name: 'Cashier' });
    const today = new Date().toISOString().slice(0, 10);
    const rows = await listAuditLog(db, bookId, {
      from: '2000-01-01',
      to: today.replace(/^\d{4}/, '2999'),
    });
    expect(rows.some((r) => r.tableName === 'Role' && r.recordKey === 'Cashier')).toBe(true);
  });

  test('roles come along in a backup', async () => {
    await createRole(db, admin, { name: 'Cashier' });
    const backup = await exportBackup(db, ACC, companyId);
    await restoreBackup(db, 'acc-2', backup);
    const res = (await db.execute(
      sql`SELECT count(*)::int AS n FROM book_roles WHERE name = 'Cashier'`,
    )) as unknown as { rows: { n: number }[] };
    expect(res.rows[0]!.n).toBe(2);
  });
});
