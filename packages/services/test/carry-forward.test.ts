import { beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { openDatabase, sql, type Db } from '@qi/db';
import {
  PL_LEDGER_NAME,
  UserError,
  balanceSheetReport,
  carryMessages,
  createBookUser,
  createCompany,
  createLedger,
  createRole,
  createStockItem,
  createYear,
  listLedgers,
  listPermissions,
  nextVoucherNo,
  profitLossReport,
  refreshOpenings,
  savePurchase,
  saveSale,
  saveVoucher,
  trialBalanceReport,
  type PostingContext,
} from '../src/index.ts';

const ACC = 'acc-1';
let db: Db;
let ctx: PostingContext;
let companyId: string;

beforeAll(async () => {
  ({ db } = await openDatabase());
});

// The hand-checked book of reports.test.ts, closed on 31-03-2027:
//   Capital 10,000 Cr; Cash 10,208 Dr; Bharat Suppliers 1,888 Cr; net output tax 180 Dr;
//   stock 15 kg @ 80 = 1,200; net loss 300. Balance Sheet total 11,408.
beforeEach(async () => {
  await db.execute(
    sql`TRUNCATE audit_log, stock_journal_lines, sale_lines, sales, purchase_lines, purchases, stock_trn, voucher_items, bill_refs, voucher_lines, vouchers, voucher_series, stock_items, misc_list, ledgers, book_roles, book_users, account_groups, financial_years, books, companies RESTART IDENTITY CASCADE`,
  );
  const company = await createCompany(db, ACC, { compName: 'Sharma Traders', add1: 'MG Road' }, 1000);
  companyId = company.id;
  const y = await createYear(db, ACC, company.id, { yearName: '2026-2027', fromDate: '01/04/2026', toDate: '31/03/2027' });
  ctx = { bookId: y.bookId, userName: 'admin', fyFrom: '2026-04-01', fyTo: '2027-03-31', financialYearLabel: '2026-2027' };
  const place = { city: 'Pune', state: 'Maharashtra', pincode: '411001' };
  await createLedger(db, ctx.bookId, { name: 'Bharat Suppliers', under: 'L007', ...place }); // AC0001
  await createLedger(db, ctx.bookId, { name: 'Acme Traders', under: 'A007', ...place }); // AC0002
  await createLedger(db, ctx.bookId, { name: 'Cash', under: 'A003', openingBalance: '10000', drCr: 'Dr', ...place }); // AC0003
  await createLedger(db, ctx.bookId, { name: 'Owner Capital', under: 'L002', openingBalance: '10000', drCr: 'Cr', ...place }); // AC0004
  await createLedger(db, ctx.bookId, { name: 'Rent', under: 'E002', ...place }); // AC0005
  await createStockItem(db, ctx.bookId, { code: 'IT01', name: 'Basmati Rice', unit: 'Kgs', regType: 'Taxable', gstRate: '18%' });
  await db.execute(sql`update stock_items set pur_rate = 80 where part_code = 'IT01'`);
  await savePurchase(db, ctx, {
    billNo: 'PB-0001', billDate: '2026-05-01', suppCode: 'AC0001', interState: false,
    lines: [{ itemCode: 'IT01', itemName: 'Basmati Rice', unit: 'Kgs', qty: 20, rate: 80, disP: 0, disA: 0, gstRate: 18 }],
  });
  await saveSale(db, ctx, {
    billNo: 'SB-0001', billDate: '2026-05-10', saleType: null, isCash: true, custCode: 'AC0002', custName: 'Acme Traders',
    billDiscPct: 0, billDiscAmt: 0, interState: false,
    lines: [{ itemCode: 'IT01', itemName: 'Basmati Rice', unit: 'Kgs', qty: 5, rate: 120, disP: 0, disA: 0, gstRate: 18 }],
  });
  await saveVoucher(db, ctx, {
    vchrType: 'JNL', date: '2026-05-15', narration: 'Rent for May',
    lines: [{ accCode: 'AC0005', dr: 500, cr: 0 }, { accCode: 'AC0003', dr: 0, cr: 500 }],
  });
}); // prettier-ignore

const nextYear = (copyFromPrevious = true) =>
  createYear(db, ACC, companyId, {
    yearName: '2027-2028',
    fromDate: '01/04/2027',
    toDate: '31/03/2028',
    copyFromPrevious,
  });

const opening = async (bookId: string, name: string) => {
  const l = (await listLedgers(db, bookId)).find((x) => x.accName === name)!;
  return `${Number(l.opBal)} ${l.drCr}`;
};

describe('Year-end carry-forward', () => {
  test('the old year closes as reports.test.ts says', async () => {
    const bs = await balanceSheetReport(db, ctx.bookId, '2027-03-31');
    expect([bs.total, bs.profit, bs.closingStock, bs.difference]).toEqual([11408, -300, 1200, 0]);
  });

  test('masters are copied; balance-sheet ledgers open at their closing balance', async () => {
    const y2 = await nextYear();
    const names = (await listLedgers(db, y2.bookId)).map((l) => l.accName);
    expect(names).toEqual(expect.arrayContaining(['Bharat Suppliers', 'Acme Traders', 'Cash', 'Owner Capital', 'Rent']));
    expect(await opening(y2.bookId, 'Cash')).toBe('10208 Dr');
    expect(await opening(y2.bookId, 'Owner Capital')).toBe('10000 Cr');
    expect(await opening(y2.bookId, 'Bharat Suppliers')).toBe('1888 Cr');
    // Income and expenses start the year at nil; the loss sits in the Profit & Loss A/c.
    expect(await opening(y2.bookId, 'Rent')).toBe('0 Dr');
    expect(await opening(y2.bookId, PL_LEDGER_NAME)).toBe('300 Dr');
  }); // prettier-ignore

  test('stock opens with last year’s closing quantity and value', async () => {
    const y2 = await nextYear();
    const [row] = (
      (await db.execute(
        sql`SELECT op_qty::float AS q, op_value::float AS v FROM stock_items WHERE book_id = ${y2.bookId} AND part_code = 'IT01'`,
      )) as unknown as { rows: { q: number; v: number }[] }
    ).rows;
    expect(row).toEqual({ q: 15, v: 1200 });
  });

  test('the new year’s Balance Sheet opens equal to the old one’s, with no difference', async () => {
    const y2 = await nextYear();
    const bs = await balanceSheetReport(db, y2.bookId, '2027-04-01');
    expect([bs.total, bs.profit, bs.closingStock, bs.difference]).toEqual([11408, 0, 1200, 0]);
    const pl = await profitLossReport(db, y2.bookId, '2027-04-01');
    expect(pl.pl.net).toBe(0);
    const tb = await trialBalanceReport(db, y2.bookId, '2027-04-01');
    expect(tb).toBeTruthy();
  });

  test('users, roles and numbering come along; numbers restart at 1', async () => {
    const admin = { bookId: ctx.bookId, userName: 'admin', role: 'Admin' };
    await createBookUser(db, admin, { userName: 'ravi', password: 'pass1', confirmPassword: 'pass1', role: 'Operator', isActive: true });
    await createRole(db, admin, { name: 'Cashier' });
    const y2 = await nextYear();
    const v = await listPermissions(db, { bookId: y2.bookId, userName: 'admin', role: 'Admin' });
    expect(v.users.map((u) => u.userName)).toEqual(['admin', 'ravi']);
    expect(v.roles.map((r) => r.name)).toContain('Cashier');
    expect(await nextVoucherNo(db, y2.bookId, 'JNL')).toBe('JNL-001');
  }); // prettier-ignore

  test('without the tick, the new year starts fresh as before', async () => {
    const y2 = await nextYear(false);
    const names = (await listLedgers(db, y2.bookId)).map((l) => l.accName);
    expect(names).not.toContain('Cash');
  });

  test('Refresh Opening Balances picks up entries made late in the old year', async () => {
    const y2 = await nextYear();
    await saveVoucher(db, ctx, {
      vchrType: 'JNL', date: '2027-03-30', narration: 'Rent for March',
      lines: [{ accCode: 'AC0005', dr: 100, cr: 0 }, { accCode: 'AC0003', dr: 0, cr: 100 }],
    }); // prettier-ignore
    expect(await opening(y2.bookId, 'Cash')).toBe('10208 Dr');
    const r = await refreshOpenings(db, {
      bookId: y2.bookId,
      userName: 'admin',
      role: 'Admin',
      yearId: y2.id,
    });
    expect(r.fromYear).toBe('2026-2027');
    expect(r.profit).toBe(-400);
    expect(await opening(y2.bookId, 'Cash')).toBe('10108 Dr');
    expect(await opening(y2.bookId, PL_LEDGER_NAME)).toBe('400 Dr');
    const bs = await balanceSheetReport(db, y2.bookId, '2027-04-01');
    expect(bs.difference).toBe(0);
  });

  test('Refresh: Admin only, and only when there is an earlier year', async () => {
    const y2 = await nextYear();
    const tryIt = (p: Promise<unknown>) => p.then(() => null, (e: unknown) => e as UserError);
    const op = await tryIt(refreshOpenings(db, { bookId: y2.bookId, userName: 'ravi', role: 'Operator', yearId: y2.id }));
    expect(op?.message).toBe(carryMessages.adminOnly);
    const [first] = (await db.execute(sql`SELECT id FROM financial_years WHERE year_code <> ${'2728'} ORDER BY from_date LIMIT 1`) as unknown as { rows: { id: string }[] }).rows;
    const none = await tryIt(refreshOpenings(db, { bookId: ctx.bookId, userName: 'admin', role: 'Admin', yearId: first!.id }));
    expect(none?.message).toBe(carryMessages.noPrevious);
  }); // prettier-ignore
});
