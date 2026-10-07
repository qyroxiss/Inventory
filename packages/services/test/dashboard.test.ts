import { beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { openDatabase, sql, type Db } from '@qi/db';
import {
  cancelSale,
  createCompany,
  createLedger,
  createStockItem,
  createYear,
  getDashboard,
  savePurchase,
  saveSale,
  saveVoucher,
  type PostingContext,
} from '../src/index.ts';

const ACC = 'acc-1';
let db: Db;
let ctx: PostingContext;

beforeAll(async () => {
  ({ db } = await openDatabase());
});

// The reports book: Cash 10,000 opening; purchase 20 kg @ 80 + 18% = 1,888 on credit (1 May);
// cash sale 5 kg @ 120 + 18% = 708 (10 May); a second cash sale 2 kg = 283.20, rounded off to
// 283 (15 May, "today"); rent 500 paid in cash (15 May). Stock 13 kg @ 80 = 1,040.
// Cash = 10,000 + 708 + 283 - 500 = 10,491; today's movement +283 - 500 = -217.
beforeEach(async () => {
  await db.execute(
    sql`TRUNCATE audit_log, stock_journal_lines, sale_lines, sales, purchase_lines, purchases, stock_trn, voucher_items, bill_refs, voucher_lines, vouchers, voucher_series, stock_items, misc_list, ledgers, book_users, account_groups, financial_years, books, companies RESTART IDENTITY CASCADE`,
  );
  const company = await createCompany(db, ACC, { compName: 'Sharma Traders', add1: 'MG Road' }, 1000);
  const y = await createYear(db, ACC, company.id, { yearName: '2026-2027', fromDate: '01/04/2026', toDate: '31/03/2027' });
  ctx = { bookId: y.bookId, userName: 'admin', fyFrom: '2026-04-01', fyTo: '2027-03-31', financialYearLabel: '2026-2027' };
  const place = { city: 'Pune', state: 'Maharashtra', pincode: '411001' };
  await createLedger(db, ctx.bookId, { name: 'Bharat Suppliers', under: 'L007', ...place }); // AC0001
  await createLedger(db, ctx.bookId, { name: 'Acme Traders', under: 'A007', ...place }); // AC0002
  await createLedger(db, ctx.bookId, { name: 'Cash', under: 'A003', openingBalance: '10000', drCr: 'Dr', ...place }); // AC0003
  await createLedger(db, ctx.bookId, { name: 'Rent', under: 'E002', ...place }); // AC0004
  await createStockItem(db, ctx.bookId, { code: 'IT01', name: 'Basmati Rice', unit: 'Kgs', regType: 'Taxable', gstRate: '18%' });
  await db.execute(sql`update stock_items set pur_rate = 80 where part_code = 'IT01'`);
  await savePurchase(db, ctx, {
    billNo: 'PB-0001', billDate: '2026-05-01', suppCode: 'AC0001', interState: false,
    lines: [{ itemCode: 'IT01', itemName: 'Basmati Rice', unit: 'Kgs', qty: 20, rate: 80, disP: 0, disA: 0, gstRate: 18 }],
  });
  const sale = (billNo: string, billDate: string, qty: number) => saveSale(db, ctx, {
    billNo, billDate, saleType: null, isCash: true, custCode: 'AC0002', custName: 'Acme Traders',
    billDiscPct: 0, billDiscAmt: 0, interState: false,
    lines: [{ itemCode: 'IT01', itemName: 'Basmati Rice', unit: 'Kgs', qty, rate: 120, disP: 0, disA: 0, gstRate: 18 }],
  });
  await sale('SB-0001', '2026-05-10', 5);
  await sale('SB-0002', '2026-05-15', 2);
  await saveVoucher(db, ctx, {
    vchrType: 'JNL', date: '2026-05-15', narration: 'Rent for May',
    lines: [{ accCode: 'AC0004', dr: 500, cr: 0 }, { accCode: 'AC0003', dr: 0, cr: 500 }],
  });
}); // prettier-ignore

// 15 May 2026, 12:00 in India.
const NOW = new Date('2026-05-15T06:30:00Z');

describe('Dashboard', () => {
  test('stock value at the purchase rate, against an opening of 0', async () => {
    const d = await getDashboard(db, ctx, NOW);
    expect(d.stockValue).toBe(1040);
    expect(d.stockOpening).toBe(0);
  });

  test("today's and yesterday's sales, and the 7-day window ending today", async () => {
    const d = await getDashboard(db, ctx, NOW);
    expect(d.todaySales).toBe(283);
    expect(d.yesterdaySales).toBe(0);
    expect(d.weekLabels).toEqual(['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri']);
    expect(d.weekValues).toEqual([0, 708, 0, 0, 0, 0, 283]);
  });

  test("cash balance and today's movement", async () => {
    const d = await getDashboard(db, ctx, NOW);
    expect(d.cashBalance).toBe(10491);
    expect(d.cashToday).toBe(-217);
  });

  test('pending bills: the credit purchase is open and overdue (0 credit days)', async () => {
    const d = await getDashboard(db, ctx, NOW);
    expect(d).toMatchObject({ pendingBills: 1, overdueBills: 1 });
    // Credit days push the due date past today.
    await db.execute(sql`update ledgers set credit_days = 30 where acc_code = 'AC0001'`);
    expect(await getDashboard(db, ctx, NOW)).toMatchObject({ pendingBills: 1, overdueBills: 0 });
  });

  test('a payment against the supplier settles the bill', async () => {
    await saveVoucher(db, ctx, {
      vchrType: 'JNL', date: '2026-05-15', narration: 'Paid Bharat',
      lines: [{ accCode: 'AC0001', dr: 1888, cr: 0 }, { accCode: 'AC0003', dr: 0, cr: 1888 }],
    }); // prettier-ignore
    await db.execute(
      sql`insert into bill_refs (id, voucher_id, acc_code, bill_no, ref_type, bill_date, amount)
          select gen_random_uuid(), id, 'AC0001', 'PB-0001', 'Against', '2026-05-15', 1888 from vouchers where narration = 'Paid Bharat'`,
    );
    expect(await getDashboard(db, ctx, NOW)).toMatchObject({ pendingBills: 0, overdueBills: 0 });
  });

  test('recent transactions: newest first, party, direction and time', async () => {
    // Entered at 09:00 India time on their own dates; the rent at 11:00.
    await db.execute(
      sql`update vouchers set created_at = ((vchr_date + time '09:00') at time zone 'Asia/Kolkata')`,
    );
    await db.execute(
      sql`update vouchers set created_at = ((vchr_date + time '11:00') at time zone 'Asia/Kolkata') where vchr_type = 'JNL'`,
    );
    const d = await getDashboard(db, ctx, NOW);
    expect(d.recent.map((r) => [r.type, r.party, r.amount, r.isIn])).toEqual([
      ['Journal Voucher', '—', 500, true],
      ['Sales Invoice', 'Acme Traders', 283, true],
      ['Sales Invoice', 'Acme Traders', 708, true],
      ['Purchase Invoice', 'Bharat Suppliers', 1888, false],
    ]);
    expect(d.recent.map((r) => r.when)).toEqual(['1h ago', '3h ago', '5 days ago', '01-05-2026']);
  });

  test('a cancelled sale drops out of every figure', async () => {
    await cancelSale(db, ctx, 'SB-0002');
    const d = await getDashboard(db, ctx, NOW);
    expect(d.todaySales).toBe(0);
    expect(d.stockValue).toBe(1200);
    expect(d.cashBalance).toBe(10208);
    expect(d.recent).toHaveLength(3);
  });
});
