// 2026-11-14, user's request: every option must work. MDA's gaps (docs/LOGIC-SPEC.md §14) that
// were fixed: bills, vouchers, users, login, years and numbering.
import { beforeAll, beforeEach, describe, expect, test } from 'vitest';
import {
  loginMessages,
  saleMessages as sm,
  seriesMessages,
  userMessages as um,
  yearMessages,
} from '@qi/core';
import { eq, openDatabase, schema, sql, type Db } from '@qi/db';
import {
  UserError,
  bookLogin,
  createBookUser,
  createCompany,
  createLedger,
  createStockItem,
  createYear,
  listBookUsers,
  listSeries,
  listVouchers,
  outstandingReport,
  saleBill,
  savePurchase,
  saveSale,
  saveVoucher,
  updateBookUser,
  updateSeries,
  updateVoucher,
  voucherForPrint,
  voucherLinesOf,
  type PostingContext,
  type SaleInput,
} from '../src/index.ts';

const ACC = 'acc-1';
let db: Db;
let ctx: PostingContext;
let companyId = '';
let yearId = '';

beforeAll(async () => {
  ({ db } = await openDatabase());
});
beforeEach(async () => {
  await db.execute(
    sql`TRUNCATE audit_log, stock_journal_lines, sale_lines, sales, purchase_lines, purchases, stock_trn, voucher_items, bill_refs, voucher_lines, vouchers, voucher_series, stock_items, misc_list, ledgers, book_roles, book_users, account_groups, financial_years, books, companies RESTART IDENTITY CASCADE`,
  );
  const company = await createCompany(db, ACC, { compName: 'Sharma Traders' }, 1000);
  companyId = company.id;
  const year = await createYear(db, ACC, company.id, { yearName: '2026-2027', fromDate: '01/04/2026', toDate: '31/03/2027' });
  yearId = year.id;
  ctx = { bookId: year.bookId, userName: 'admin', fyFrom: '2026-04-01', fyTo: '2027-03-31', financialYearLabel: '2026-2027' };
  const place = { city: 'Pune', state: 'Maharashtra', pincode: '411001' };
  await createLedger(db, ctx.bookId, { name: 'Bharat Suppliers', under: 'L007', ...place }); // AC0001
  await createLedger(db, ctx.bookId, { name: 'Acme Traders', under: 'A007', ...place }); // AC0002
  await createLedger(db, ctx.bookId, { name: 'Cash', under: 'A003', ...place }); // AC0003
  await createLedger(db, ctx.bookId, { name: 'HDFC Bank', under: 'A002', ...place }); // AC0004
  await createStockItem(db, ctx.bookId, { code: 'IT01', name: 'Basmati Rice', unit: 'Kgs', regType: 'Taxable', gstRate: '18%' });
}); // prettier-ignore

const caught = (p: Promise<unknown>) =>
  p.then(
    () => null,
    (e: unknown) => e,
  );
const rejects = async (p: Promise<unknown>, message: string) => {
  const err = await caught(p);
  expect(err).toBeInstanceOf(UserError);
  expect((err as UserError).message).toBe(message);
};

const buy = (qty: number, date: string, location: string | null = null, billNo = 'PB-0001') =>
  savePurchase(db, ctx, {
    billNo, billDate: date, suppCode: 'AC0001', interState: false,
    lines: [{ itemCode: 'IT01', itemName: 'Basmati Rice', unit: 'Kgs', location, qty, rate: 80, disP: 0, disA: 0, gstRate: 18 }],
  }); // prettier-ignore
const sale = (over: Partial<SaleInput> = {}): SaleInput => ({
  billNo: 'SB-0001', billDate: '2026-05-10', isCash: true, custCode: null, custName: 'Walk-in Ramesh',
  billDiscPct: 0, billDiscAmt: 0, interState: false,
  lines: [{ itemCode: 'IT01', itemName: 'Basmati Rice', unit: 'Kgs', qty: 2, rate: 100, disP: 0, disA: 0, gstRate: 18 }],
  ...over,
}); // prettier-ignore

describe('Sales Invoice', () => {
  test('a walk-in cash sale goes to the chosen Bank account, and reopens with it', async () => {
    await buy(10, '2026-05-01');
    await saveSale(db, ctx, sale({ cashAccount: 'AC0004', narration: 'Paid by card' }));
    const [v] = await listVouchers(db, ctx.bookId, ['SAL']);
    expect(v!.narration).toBe('Paid by card');
    const lines = await voucherLinesOf(db, ctx.bookId, v!.id);
    expect(lines[0]).toMatchObject({ accCode: 'AC0004', dr: 236 });
    const b = await saleBill(db, ctx.bookId, 'SB-0001');
    expect(b).toMatchObject({ custName: 'Walk-in Ramesh', custCode: '', cashAccount: 'AC0004', narration: 'Paid by card' });
    // Only a Cash-in-Hand or Bank account may take a cash sale.
    await rejects(saveSale(db, ctx, sale({ billNo: 'SB-0002', cashAccount: 'AC0002' })), sm.badCashAccount);
  }); // prettier-ignore

  test('stock is checked as on the bill date and in the bill godown', async () => {
    await buy(10, '2026-05-20', 'Shop');
    // Bought on the 20th: none to sell on the 10th.
    await rejects(
      saveSale(db, ctx, sale({ billDate: '2026-05-10' })),
      sm.notEnoughStock('Basmati Rice', 2, 0),
    );
    // In the Shop godown it is there; in the Store godown it isn't.
    const inStore = sale({ billDate: '2026-05-25' });
    inStore.lines = inStore.lines.map((l) => ({ ...l, location: 'Store' }));
    await rejects(saveSale(db, ctx, inStore), sm.notEnoughInGodown('Basmati Rice', 'Store', 2, 0));
    const inShop = sale({ billDate: '2026-05-25' });
    inShop.lines = inShop.lines.map((l) => ({ ...l, location: 'Shop' }));
    expect((await saveSale(db, ctx, inShop)).billNo).toBe('SB-0001');
  });
});

describe('Receipts and payments', () => {
  test('an edited receipt keeps its bill reference, so Outstanding still sees it', async () => {
    await buy(10, '2026-05-01');
    await saveSale(db, ctx, sale({ isCash: false, custCode: 'AC0002', custName: 'Acme Traders' }));
    const r = await saveVoucher(db, ctx, {
      vchrType: 'RCP', date: '2026-05-12', partyCode: 'AC0002',
      lines: [{ accCode: 'AC0003', dr: 100, cr: 0 }, { accCode: 'AC0002', dr: 0, cr: 100 }],
      bills: [{ accCode: 'AC0002', billNo: 'RCP-001', refType: 'On Account', amount: 100 }],
    }); // prettier-ignore
    await updateVoucher(db, ctx, r.id, {
      date: '2026-05-12', partyCode: 'AC0002',
      lines: [{ accCode: 'AC0003', dr: 150, cr: 0 }, { accCode: 'AC0002', dr: 0, cr: 150 }],
      bills: [{ accCode: 'AC0002', billNo: 'RCP-001', refType: 'On Account', amount: 150 }],
    }); // prettier-ignore
    const refs = await db.select().from(schema.billRefs).where(eq(schema.billRefs.voucherId, r.id));
    expect(refs.map((x) => Number(x.amount))).toEqual([150]);
    const open = await outstandingReport(db, ctx.bookId, '2026-06-30');
    expect(open.find((b) => b.billNo === 'SB-0001')!.pending).toBe(236 - 150);
  });
});

describe('Printing', () => {
  test('a journal prints with every line (MDA had no journal print)', async () => {
    await saveVoucher(db, ctx, {
      vchrType: 'JNL', date: '2026-05-12', narration: 'Rent adjustment',
      lines: [{ accCode: 'AC0003', dr: 500, cr: 0 }, { accCode: 'AC0004', dr: 0, cr: 500 }],
    }); // prettier-ignore
    const v = await voucherForPrint(db, ctx.bookId, 'JNL-001', ['JNL'], null);
    expect(v!.lines.map((l) => [l.accName, l.dr, l.cr])).toEqual([
      ['Cash', 500, 0],
      ['HDFC Bank', 0, 500],
    ]);
    expect(v!.narration).toBe('Rent adjustment');
  });
});

describe('Users and login', () => {
  const admin = () => ({ bookId: ctx.bookId, userName: 'admin', role: 'Admin' });

  test('the last active Admin can not be demoted or switched off, nor can you change yourself', async () => {
    const [me] = await listBookUsers(db, ctx.bookId);
    const asAdmin = { userName: 'admin', password: '', role: 'Admin', isActive: true };
    await rejects(updateBookUser(db, admin(), me!.userCode, { ...asAdmin, role: 'Viewer' }), um.notSelfChange);
    const boss = await createBookUser(db, admin(), { userName: 'boss', password: 'pass1', confirmPassword: 'pass1', role: 'Admin', isActive: true });
    // Boss may be switched off while admin remains.
    await updateBookUser(db, admin(), boss.userCode, { userName: 'boss', password: '', role: 'Admin', isActive: false });
    // Now admin is the only active Admin: boss signs in as another admin? No — boss is off.
    const bossActor = { bookId: ctx.bookId, userName: 'boss', role: 'Admin' };
    await rejects(updateBookUser(db, bossActor, me!.userCode, { ...asAdmin, role: 'Manager' }), um.lastAdminChange);
    // Names are unique whatever their case.
    await rejects(
      createBookUser(db, admin(), { userName: 'BOSS', password: 'pass1', confirmPassword: 'pass1', isActive: true }),
      um.exists('BOSS'),
    );
  }); // prettier-ignore

  test('five wrong passwords lock the user name for a while', async () => {
    const tryLogin = (password: string) => bookLogin(db, ACC, { yearId, username: 'admin', password });
    for (let i = 0; i < 4; i++) await rejects(tryLogin('nope'), loginMessages.invalid);
    await rejects(tryLogin('nope'), loginMessages.locked(15));
    // Even the right password waits until the lock ends.
    await rejects(tryLogin('admin'), loginMessages.locked(15));
  });
});

describe('Years', () => {
  test('dates are checked: in order, matching the name, not overlapping another year', async () => {
    const add = (yearName: string, fromDate: string, toDate: string) =>
      createYear(db, ACC, companyId, { yearName, fromDate, toDate });
    await rejects(add('2027-2028', '31/03/2028', '01/04/2027'), yearMessages.fromAfterTo);
    await rejects(add('2027-2028', '01/04/2026', '31/03/2027'), yearMessages.nameMismatch('2027-2028'));
    await rejects(add('2025-2026', '01/04/2025', '30/04/2026'), yearMessages.overlap('2026-2027'));
  });

  test("a new year starts with the company's users, not admin/admin", async () => {
    await createBookUser(db, { bookId: ctx.bookId, userName: 'admin', role: 'Admin' }, {
      userName: 'ravi', password: 'pass1', confirmPassword: 'pass1', role: 'Operator', isActive: true,
    }); // prettier-ignore
    const next = await createYear(db, ACC, companyId, { yearName: '2027-2028', fromDate: '01/04/2027', toDate: '31/03/2028' });
    expect((await listBookUsers(db, next.bookId)).map((u) => [u.userName, u.role])).toEqual([
      ['admin', 'Admin'],
      ['ravi', 'Operator'],
    ]);
  }); // prettier-ignore
});

describe('Numbering', () => {
  test('a series can start from a chosen number, never below one already used', async () => {
    const admin = { bookId: ctx.bookId, userName: 'admin', role: 'Admin' };
    await buy(10, '2026-05-01');
    await updateSeries(db, admin, 'PURBILL', { prefix: 'PB-', width: 4, startAt: 500 });
    const pb = (await listSeries(db, ctx.bookId)).find((s) => s.vchrType === 'PURBILL')!;
    expect(pb.next).toBe('PB-0500');
    await rejects(
      updateSeries(db, admin, 'PURBILL', { prefix: 'PB-', width: 4, startAt: 1 }),
      seriesMessages.startTooLow(2),
    );
  });
});
