import { beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { openDatabase, sql, type Db } from '@qi/db';
import {
  balanceSheetReport,
  cancelSale,
  createCompany,
  createLedger,
  createStockItem,
  createYear,
  dayBook,
  profitLossReport,
  salesRegister,
  savePurchase,
  saveSale,
  saveVoucher,
  stockSummary,
  type PostingContext,
} from '../src/index.ts';

const ACC = 'acc-1';
let db: Db;
let ctx: PostingContext;
const year = { from: '2026-04-01', to: '2027-03-31' };

beforeAll(async () => {
  ({ db } = await openDatabase());
});

// A hand-checked book:
//   Capital 10,000 (Cr opening), Cash 10,000 (Dr opening).
//   Purchase 20 kg rice @ 80 + 18% = 1,888 from Bharat (credit).
//   Cash sale 5 kg @ 120 + 18% = 708.
//   Rent 500 paid in cash (journal).
// Stock: 15 kg left @ purchase rate 80 = 1,200 closing; opening stock 0.
// Trading: Dr Purchases 1,600; Cr Sales 600 + Closing 1,200 → gross profit 200.
// P&L: Dr Rent 500; Cr gross profit 200 → net loss 300.
beforeEach(async () => {
  await db.execute(
    sql`TRUNCATE audit_log, stock_journal_lines, sale_lines, sales, purchase_lines, purchases, stock_trn, voucher_items, bill_refs, voucher_lines, vouchers, voucher_series, stock_items, misc_list, ledgers, book_users, account_groups, financial_years, books, companies RESTART IDENTITY CASCADE`,
  );
  const company = await createCompany(db, ACC, { compName: 'Sharma Traders', add1: 'MG Road' }, 1000);
  const y = await createYear(db, ACC, company.id, { yearName: '2026-2027', fromDate: '01/04/2026', toDate: '31/03/2027' });
  ctx = { bookId: y.bookId, userName: 'admin', fyFrom: year.from, fyTo: year.to, financialYearLabel: '2026-2027' };
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

describe('Reports', () => {
  test('Stock Summary: opening, in, out, closing and value at the purchase rate', async () => {
    const [r] = await stockSummary(db, ctx.bookId, year);
    expect(r).toMatchObject({
      opening: 0,
      inward: 20,
      outward: 5,
      closing: 15,
      rate: 80,
      value: 1200,
    });
    // A period after the purchase starts with it already in stock.
    const [later] = await stockSummary(db, ctx.bookId, { from: '2026-05-05', to: year.to });
    expect(later).toMatchObject({ opening: 20, inward: 0, outward: 5, closing: 15 });
  });

  test('Day Book: vouchers in the period, with their Dr/Cr totals', async () => {
    const rows = await dayBook(db, ctx.bookId, year);
    expect(rows.map((r) => [r.date, r.vchrNo, r.typeName, r.particulars, r.debit])).toEqual([
      ['2026-05-01', 'PUR-001', 'Purchase Invoice', 'Bharat Suppliers', 1888],
      ['2026-05-10', 'SAL-001', 'Sales Invoice', 'Acme Traders', 708],
      ['2026-05-15', 'JNL-001', 'Journal Voucher', 'Rent', 500],
    ]);
    expect(await dayBook(db, ctx.bookId, { from: '2026-05-11', to: '2026-05-31' })).toHaveLength(1);
  });

  test('Sales Register: bills with their tax split; cancelled ones only when asked', async () => {
    const [r] = await salesRegister(db, ctx.bookId, year);
    expect(r).toMatchObject({
      billNo: 'SB-0001',
      taxable: 600,
      cgst: 54,
      sgst: 54,
      igst: 0,
      net: 708,
    });
    await cancelSale(db, ctx, 'SB-0001');
    expect(await salesRegister(db, ctx.bookId, year)).toEqual([]);
    expect((await salesRegister(db, ctx.bookId, { ...year, cancelled: true }))[0]!.status).toBe(
      'Cancelled',
    );
  });

  test('Profit & Loss: gross profit 200, net loss 300', async () => {
    const pl = await profitLossReport(db, ctx.bookId, year.to);
    expect(pl.trading.openingStock).toBe(0);
    expect(pl.trading.closingStock).toBe(1200);
    expect(pl.trading.debit.map((g) => [g.grpName, g.amount])).toEqual([
      ['Purchase Accounts', 1600],
    ]);
    expect(pl.trading.credit.map((g) => [g.grpName, g.amount])).toEqual([['Sales Accounts', 600]]);
    expect(pl.trading.gross).toBe(200);
    expect(pl.pl.debit.map((g) => [g.grpName, g.amount])).toEqual([['Indirect Expenses', 500]]);
    expect(pl.pl.net).toBe(-300);
  });

  test('Balance Sheet agrees with no difference', async () => {
    const bs = await balanceSheetReport(db, ctx.bookId, year.to);
    // Liabilities: Capital 10,000 + Creditors 1,888 + net output tax (108 − 288 = −180) − loss 300.
    // Assets: Cash 10,000 + 708 − 500 = 10,208 + closing stock 1,200.
    expect(bs.liabilities.map((g) => [g.grpName, g.amount])).toEqual([
      ['Capital Account', 10000],
      ['Current Liabilities', 1708],
    ]);
    expect(bs.assets.map((g) => [g.grpName, g.amount])).toEqual([['Current Assets', 10208]]);
    expect(bs.profit).toBe(-300);
    expect(bs.closingStock).toBe(1200);
    expect(bs.difference).toBe(0);
    expect(bs.total).toBe(11408);
  });

  test('an item with no rates is valued at its last purchase price, as on the date', async () => {
    await db.execute(sql`update stock_items set pur_rate = 0, sale_rate = 0`);
    // A later, dearer purchase: 10 kg @ 90 on 1 June.
    await savePurchase(db, ctx, {
      billNo: 'PB-0002', billDate: '2026-06-01', suppCode: 'AC0001', interState: false,
      lines: [{ itemCode: 'IT01', itemName: 'Basmati Rice', unit: 'Kgs', qty: 10, rate: 90, disP: 0, disA: 0, gstRate: 18 }],
    }); // prettier-ignore
    const [may] = await stockSummary(db, ctx.bookId, { from: year.from, to: '2026-05-31' });
    expect(may).toMatchObject({ closing: 15, rate: 80, value: 1200 });
    const [june] = await stockSummary(db, ctx.bookId, year);
    expect(june).toMatchObject({ closing: 25, rate: 90, value: 2250 });
    expect((await profitLossReport(db, ctx.bookId, year.to)).trading.closingStock).toBe(2250);
    // An item's own rate still comes first (MDA's rule).
    await db.execute(sql`update stock_items set sale_rate = 120`);
    expect((await stockSummary(db, ctx.bookId, year))[0]).toMatchObject({ rate: 120 });
  });
});
