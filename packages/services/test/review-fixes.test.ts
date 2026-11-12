// Fixes from the 2026-11-12 review, each on the hand-checked book of reports.test.ts.
import { beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { postingMessages, saleMessages } from '@qi/core';
import { openDatabase, sql, type Db } from '@qi/db';
import {
  UserError,
  createCompany,
  createLedger,
  createStockItem,
  createYear,
  ledgerStatementsReport,
  nextVoucherNo,
  outstandingReport,
  saveReturn,
  saveSale,
  saveVoucher,
  trialBalanceReport,
  updateSale,
  updateSeries,
  type PostingContext,
} from '../src/index.ts';

const ACC = 'acc-1';
let db: Db;
let ctx: PostingContext;
let companyId: string;

beforeAll(async () => {
  ({ db } = await openDatabase());
});

beforeEach(async () => {
  await db.execute(
    sql`TRUNCATE audit_log, stock_journal_lines, return_lines, returns, sale_lines, sales, purchase_lines, purchases, stock_trn, voucher_items, bill_refs, voucher_lines, vouchers, voucher_series, stock_items, misc_list, ledgers, book_roles, book_users, account_groups, financial_years, books, companies RESTART IDENTITY CASCADE`,
  );
  const company = await createCompany(db, ACC, { compName: 'Sharma Traders', add1: 'MG Road' }, 1000);
  companyId = company.id;
  const y = await createYear(db, ACC, company.id, { yearName: '2026-2027', fromDate: '01/04/2026', toDate: '31/03/2027' });
  ctx = { bookId: y.bookId, userName: 'admin', fyFrom: '2026-04-01', fyTo: '2027-03-31', financialYearLabel: '2026-2027' };
  const place = { city: 'Pune', state: 'Maharashtra', pincode: '411001' };
  await createLedger(db, ctx.bookId, { name: 'Bharat Suppliers', under: 'L007', ...place }); // AC0001
  await createLedger(db, ctx.bookId, { name: 'Acme Traders', under: 'A007', ...place }); // AC0002
  await createLedger(db, ctx.bookId, { name: 'Cash', under: 'A003', openingBalance: '10000', drCr: 'Dr', ...place }); // AC0003
  await createLedger(db, ctx.bookId, { name: 'Owner Capital', under: 'L002', openingBalance: '10500', drCr: 'Cr', ...place }); // AC0004
  await createLedger(db, ctx.bookId, { name: 'Rent', under: 'E002', ...place }); // AC0005
  await createStockItem(db, ctx.bookId, { code: 'IT01', name: 'Basmati Rice', unit: 'Kgs', regType: 'Taxable', gstRate: '18%' });
  await db.execute(sql`update stock_items set pur_rate = 50, op_qty = 100, op_value = 500 where part_code = 'IT01'`);
}); // prettier-ignore

const sale = (over: Record<string, unknown> = {}) => ({
  billNo: 'SB-0001', billDate: '2026-05-10', saleType: null, isCash: false, custCode: 'AC0002', custName: 'Acme Traders',
  billDiscPct: 0, billDiscAmt: 0, interState: false,
  lines: [{ itemCode: 'IT01', itemName: 'Basmati Rice', unit: 'Kgs', qty: 3, rate: 28.48, disP: 0, disA: 0, gstRate: 18 }],
  ...over,
}); // prettier-ignore

const rejects = async (p: Promise<unknown>, message: string | RegExp) => {
  const err = await p.then(() => null, (e: unknown) => e);
  expect(err).toBeInstanceOf(UserError);
  expect((err as UserError).message).toMatch(message);
}; // prettier-ignore

describe('review fixes 2026-11-12', () => {
  test('Trial Balance shows opening stock as a Debit row, so the sides agree', async () => {
    const tb = await trialBalanceReport(db, ctx.bookId, '2026-04-01');
    expect(tb.rows[0]).toMatchObject({ accName: 'Opening Stock', debit: 500 });
    expect(tb.difference).toBe(0); // Cash 10,000 + stock 500 = Capital 10,500
  });

  test('a Credit Note to a customer lowers their dues; it is not a new bill', async () => {
    await saveSale(db, ctx, sale()); // net 101 (3 × 28.48 + 18%)
    await saveVoucher(db, ctx, {
      vchrType: 'CRN', date: '2026-05-12', partyCode: 'AC0002', narration: 'Short supply',
      lines: [{ accCode: 'AC0005', dr: 1, cr: 0 }, { accCode: 'AC0002', dr: 0, cr: 1 }],
      bills: [{ accCode: 'AC0002', billNo: 'CRN-001', refType: 'New', amount: 1 }],
    }); // prettier-ignore
    const open = await outstandingReport(db, ctx.bookId, '2026-06-01');
    expect(open.filter((b) => b.accCode === 'AC0002').map((b) => [b.billNo, b.pending])).toEqual([['SB-0001', 100]]);
  }); // prettier-ignore

  test('a series prefix with digits keeps counting from its own number', async () => {
    await updateSeries(db, { bookId: ctx.bookId, userName: 'admin', role: 'Admin' }, 'JNL', { prefix: 'J26-', width: 3 });
    const line = (accCode: string, dr: number, cr: number) => ({ accCode, dr, cr });
    await saveVoucher(db, ctx, { vchrType: 'JNL', date: '2026-05-15', lines: [line('AC0005', 10, 0), line('AC0003', 0, 10)] });
    expect(await nextVoucherNo(db, ctx.bookId, 'JNL')).toBe('J26-002');
  }); // prettier-ignore

  test('a ledger code that is not in this book is refused', async () => {
    await rejects(
      saveVoucher(db, ctx, { vchrType: 'JNL', date: '2026-05-15', lines: [{ accCode: 'AC0005', dr: 10, cr: 0 }, { accCode: 'XYZ', dr: 0, cr: 10 }] }),
      postingMessages.unknownLedger('XYZ'),
    );
    await rejects(saveSale(db, ctx, sale({ custCode: 'NOPE' })), postingMessages.unknownLedger('NOPE'));
  }); // prettier-ignore

  test('Accounting Vouchers refuse a bill’s voucher type', async () => {
    await rejects(saveVoucher(db, ctx, { vchrType: 'SAL', date: '2026-05-15', lines: [] }), postingMessages.typeNotAccounting('SAL'));
  }); // prettier-ignore

  test('a negative GST rate or discount is refused', async () => {
    const neg = sale({ lines: [{ itemCode: 'IT01', itemName: 'Basmati Rice', unit: 'Kgs', qty: 1, rate: 100, disP: 0, disA: 0, gstRate: -18 }] });
    await rejects(saveSale(db, ctx, neg), saleMessages.lineNegative('Basmati Rice'));
    await rejects(saveSale(db, ctx, sale({ billDiscAmt: -50 })), saleMessages.billDiscNegative);
  }); // prettier-ignore

  test('returning a bill in parts never credits more than the bill', async () => {
    await saveSale(db, ctx, sale());
    let total = 0;
    for (const d of ['2026-05-20', '2026-05-21', '2026-05-22']) {
      const r = await saveReturn(db, ctx, 'SRT', { returnNo: '', returnDate: d, againstBillNo: 'SB-0001', lines: [{ srcLineNo: 1, qty: 1 }] });
      total += r.net;
    }
    expect(total).toBe(101);
  }); // prettier-ignore

  test('a bill with returns can’t change the returned line’s rate or its party', async () => {
    await saveSale(db, ctx, sale());
    await saveReturn(db, ctx, 'SRT', { returnNo: '', returnDate: '2026-05-20', againstBillNo: 'SB-0001', lines: [{ srcLineNo: 1, qty: 1 }] });
    const cheaper = sale({ lines: [{ itemCode: 'IT01', itemName: 'Basmati Rice', unit: 'Kgs', qty: 3, rate: 10, disP: 0, disA: 0, gstRate: 18 }] });
    await rejects(updateSale(db, ctx, cheaper), /rate, discount and GST rate can't change/);
    await rejects(updateSale(db, ctx, sale({ custCode: 'AC0001', custName: 'Bharat Suppliers' })), /party and inter-state setting can't change/);
  }); // prettier-ignore

  test('a carried-forward year’s Trial Balance opens with no difference', async () => {
    await saveSale(db, ctx, sale());
    const y2 = await createYear(db, ACC, companyId, { yearName: '2027-2028', fromDate: '01/04/2027', toDate: '31/03/2028', copyFromPrevious: true });
    const tb = await trialBalanceReport(db, y2.bookId, '2027-04-01');
    expect(tb.difference).toBe(0);
  }); // prettier-ignore

  test('Ledger Statement for several ledgers: all parties, all in use, or the ones picked', async () => {
    await saveSale(db, ctx, sale());
    const p = { from: '2026-04-01', to: '2027-03-31' };
    const parties = await ledgerStatementsReport(db, ctx.bookId, { parties: true }, p);
    // Acme has a bill; Bharat (a creditor) has neither opening nor entries, so it's left out.
    expect(parties.map((s) => s.ledger.accName)).toEqual(['Acme Traders']);
    expect(parties[0]!.closing).toBe(101);
    const all = (await ledgerStatementsReport(db, ctx.bookId, {}, p)).map((s) => s.ledger.accName);
    expect(all).toEqual(expect.arrayContaining(['Acme Traders', 'Cash', 'Owner Capital']));
    expect(all).not.toContain('Rent');
    const picked = await ledgerStatementsReport(db, ctx.bookId, { accs: ['AC0005', 'AC0003'] }, p);
    expect(picked.map((s) => s.ledger.accName)).toEqual(['Cash', 'Rent']);
  });
});
