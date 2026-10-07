import { beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { backupMessages, userMessages as um } from '@qi/core';
import { openDatabase, sql, type Db } from '@qi/db';
import {
  UserError,
  bookLogin,
  createBookUser,
  createCompany,
  createLedger,
  createStockItem,
  createYear,
  deleteBookUser,
  deleteCompany,
  exportBackup,
  listAuditLog,
  listBookIndex,
  listBookUsers,
  listPurchases,
  listSeries,
  purchaseBill,
  restoreBackup,
  savePurchase,
  stockInHand,
  updateBookUser,
  updateSeries,
  type Actor,
  type PostingContext,
} from '../src/index.ts';

const ACC = 'acc-1';
let db: Db;
let ctx: PostingContext;
let admin: Actor;
let companyId: string;
let yearId: string;

beforeAll(async () => {
  ({ db } = await openDatabase());
});
beforeEach(async () => {
  await db.execute(
    sql`TRUNCATE audit_log, stock_journal_lines, sale_lines, sales, purchase_lines, purchases, stock_trn, voucher_items, bill_refs, voucher_lines, vouchers, voucher_series, stock_items, misc_list, ledgers, book_users, account_groups, financial_years, books, companies RESTART IDENTITY CASCADE`,
  );
  const company = await createCompany(db, ACC, { compName: 'Sharma Traders', add1: 'MG Road' }, 1000);
  companyId = company.id;
  const y = await createYear(db, ACC, company.id, { yearName: '2026-2027', fromDate: '01/04/2026', toDate: '31/03/2027' });
  yearId = y.id;
  ctx = { bookId: y.bookId, userName: 'admin', fyFrom: '2026-04-01', fyTo: '2027-03-31', financialYearLabel: '2026-2027' };
  admin = { bookId: y.bookId, userName: 'admin', role: 'Admin' };
}); // prettier-ignore

const rejects = async (p: Promise<unknown>, message: string) => {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(UserError);
  expect((err as UserError).message).toBe(message);
};

describe('User Management', () => {
  test('an Admin creates a user; the role starts as "User" (Q-02); the name must be new', async () => {
    const u = await createBookUser(db, admin, {
      userName: ' ravi ',
      password: 'pass1',
      confirmPassword: 'pass1',
      isActive: true,
    });
    expect(u).toMatchObject({ userName: 'ravi', role: 'User', isActive: true });
    expect(u.userCode).toMatch(/^RAVI_\d+$/);
    expect((await listBookUsers(db, ctx.bookId)).map((x) => x.userName)).toEqual(['admin', 'ravi']);
    await rejects(
      createBookUser(db, admin, {
        userName: 'ravi',
        password: 'pass1',
        confirmPassword: 'pass1',
        isActive: true,
      }),
      um.exists('ravi'),
    );
  });

  test('only an Admin can manage users', async () => {
    await rejects(
      createBookUser(
        db,
        { ...admin, role: 'Manager' },
        { userName: 'x', password: 'pass1', confirmPassword: 'pass1', isActive: true },
      ),
      um.adminOnly,
    );
  });

  test('form rules: password at least 4, confirmation must match', async () => {
    const err = await createBookUser(db, admin, {
      userName: 'x',
      password: 'abc',
      confirmPassword: 'abd',
      isActive: true,
    }).catch((e) => e as UserError);
    expect((err as UserError).fieldErrors).toEqual({
      password: um.minPassword,
      confirmPassword: um.mismatch,
    });
  });

  test('update: a blank password keeps the old one; a new one works at login', async () => {
    const u = await createBookUser(db, admin, {
      userName: 'ravi',
      password: 'pass1',
      confirmPassword: 'pass1',
      role: 'Operator',
      isActive: true,
    });
    await updateBookUser(db, admin, u.userCode, {
      userName: 'ravi',
      password: '',
      role: 'Manager',
      isActive: true,
    });
    await bookLogin(db, ACC, { yearId, username: 'ravi', password: 'pass1' });
    await updateBookUser(db, admin, u.userCode, {
      userName: 'ravi',
      password: 'newpass',
      role: 'Manager',
      isActive: true,
    });
    const s = await bookLogin(db, ACC, { yearId, username: 'ravi', password: 'newpass' });
    expect(s.role).toBe('Manager');
  });

  test('delete: not yourself, not the last Admin; changes are logged', async () => {
    const [me] = await listBookUsers(db, ctx.bookId);
    await rejects(deleteBookUser(db, admin, me!.userCode), um.notSelf);
    await rejects(
      deleteBookUser(db, { ...admin, userName: 'someone' }, me!.userCode),
      um.lastAdmin,
    );
    const u = await createBookUser(db, admin, {
      userName: 'ravi',
      password: 'pass1',
      confirmPassword: 'pass1',
      isActive: true,
    });
    await deleteBookUser(db, admin, u.userCode);
    const log = await listAuditLog(db, ctx.bookId, {
      from: '2000-01-01',
      to: '2100-01-01',
      action: 'DELETE',
    });
    expect(log.map((l) => [l.tableName, l.recordKey])).toEqual([['User', 'ravi']]);
  });
});

describe('Company Settings: numbering', () => {
  test('a new prefix and width show in the next number; Admin only', async () => {
    const before = await listSeries(db, ctx.bookId);
    expect(before.find((s) => s.vchrType === 'RCP')).toMatchObject({
      prefix: 'RCP-',
      width: 3,
      next: 'RCP-001',
    });
    expect(before.find((s) => s.vchrType === 'PURBILL')?.next).toBe('PB-0001');
    await updateSeries(db, admin, 'RCP', { prefix: 'rc/', width: 5 });
    expect((await listSeries(db, ctx.bookId)).find((s) => s.vchrType === 'RCP')?.next).toBe(
      'RC/00001',
    );
    await rejects(
      updateSeries(db, admin, 'RCP', { prefix: 'R C', width: 3 }),
      'Use letters, digits, - or / only (up to 8)',
    );
    await rejects(
      updateSeries(db, { ...admin, role: 'Viewer' }, 'RCP', { prefix: 'R', width: 3 }),
      'Only an Admin user can change company settings',
    );
  });
});

describe('Backup and restore', () => {
  test('a backup restores the company with every record and link', async () => {
    const place = { city: 'Pune', state: 'Maharashtra', pincode: '411001' };
    await createLedger(db, ctx.bookId, { name: 'Bharat Suppliers', under: 'L007', ...place });
    await createStockItem(db, ctx.bookId, {
      code: 'IT01',
      name: 'Basmati Rice',
      unit: 'Kgs',
      regType: 'Taxable',
      gstRate: '18%',
    });
    await savePurchase(db, ctx, {
      billNo: 'PB-0001', billDate: '2026-05-01', suppCode: 'AC0001', interState: false,
      lines: [{ itemCode: 'IT01', itemName: 'Basmati Rice', unit: 'Kgs', qty: 20, rate: 80, disP: 0, disA: 0, gstRate: 18 }],
    }); // prettier-ignore
    const backup = JSON.parse(JSON.stringify(await exportBackup(db, ACC, companyId)));
    // While the company is still here, nothing is restored.
    expect(await restoreBackup(db, ACC, backup)).toEqual({
      restored: false,
      message: backupMessages.exists('Sharma Traders'),
    });

    await deleteCompany(db, ACC, companyId);
    expect(await restoreBackup(db, ACC, backup)).toEqual({
      restored: true,
      message: backupMessages.restored('Sharma Traders', 1),
    });

    const [restored] = await listBookIndex(db, ACC);
    const year = restored!.years[0]!;
    const s = await bookLogin(db, ACC, { yearId: year.id, username: 'admin', password: 'admin' });
    expect(s.bookId).not.toBe(ctx.bookId);
    const [bill] = await listPurchases(db, s.bookId);
    expect(bill).toMatchObject({
      billNo: 'PB-0001',
      netAmount: 1888,
      itemCount: 1,
      suppName: 'Bharat Suppliers',
    });
    expect((await purchaseBill(db, s.bookId, 'PB-0001'))!.lines[0]!.qty).toBe(20);
    expect((await stockInHand(db, s.bookId, ['IT01'])).get('IT01')).toBe(20);
    await rejects(restoreBackup(db, ACC, { hello: 1 }), backupMessages.notBackup);
  });
});
