import { beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { saleMessages as sm, stockJournalMessages as jm } from '@qi/core';
import { eq, openDatabase, schema, sql, type Db } from '@qi/db';
import {
  UserError,
  cancelSale,
  cancelStockJournal,
  createCompany,
  createLedger,
  createSaleType,
  createStockItem,
  createYear,
  listSales,
  listStockJournals,
  listVouchers,
  nextSaleBillNo,
  removeSaleType,
  saleBill,
  saleLookups,
  savePurchase,
  saveSale,
  saveStockJournal,
  stockInHand,
  stockJournalLinesOf,
  updateSale,
  updateStockJournal,
  voucherLinesOf,
  type PostingContext,
  type SaleInput,
} from '../src/index.ts';

const ACC = 'acc-1';
let db: Db;
let ctx: PostingContext;

beforeAll(async () => {
  ({ db } = await openDatabase());
});
beforeEach(async () => {
  await db.execute(
    sql`TRUNCATE audit_log, stock_journal_lines, sale_lines, sales, purchase_lines, purchases, stock_trn, voucher_items, bill_refs, voucher_lines, vouchers, voucher_series, stock_items, misc_list, ledgers, book_users, account_groups, financial_years, books, companies RESTART IDENTITY CASCADE`,
  );
  const company = await createCompany(db, ACC, { compName: 'Sharma Traders', add1: 'MG Road' }, 1000);
  const year = await createYear(db, ACC, company.id, { yearName: '2026-2027', fromDate: '01/04/2026', toDate: '31/03/2027' });
  ctx = { bookId: year.bookId, userName: 'admin', fyFrom: '2026-04-01', fyTo: '2027-03-31', financialYearLabel: '2026-2027' };
  const place = { city: 'Pune', state: 'Maharashtra', pincode: '411001' };
  await createLedger(db, ctx.bookId, { name: 'Bharat Suppliers', under: 'L007', ...place }); // AC0001
  await createLedger(db, ctx.bookId, { name: 'Acme Traders', under: 'A007', address: '12 Market Road', mobile: '9822012345', ...place }); // AC0002
  await createLedger(db, ctx.bookId, { name: 'Cash', under: 'A003', ...place }); // AC0003
  await createStockItem(db, ctx.bookId, { code: 'IT01', name: 'Basmati Rice', unit: 'Kgs', regType: 'Taxable', gstRate: '18%', hsn: '1006' });
  await createStockItem(db, ctx.bookId, { code: 'IT02', name: 'Sugar', unit: 'Kgs', regType: 'Taxable', gstRate: '12%', hsn: '1701' });
  await createSaleType(db, ctx.bookId, { name: 'Counter Sale', prefix: 'CS', saleBy: 'Counter' });
  // 20 kg of rice into stock.
  await savePurchase(db, ctx, {
    billNo: 'PB-0001', billDate: '2026-05-01', suppCode: 'AC0001', interState: false,
    lines: [{ itemCode: 'IT01', itemName: 'Basmati Rice', unit: 'Kgs', qty: 20, rate: 80, disP: 0, disA: 0, gstRate: 18 }],
  });
}); // prettier-ignore

const rejects = async (p: Promise<unknown>, message: string) => {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(UserError);
  expect((err as UserError).message).toBe(message);
};

const bill = (over: Partial<SaleInput> = {}): SaleInput => ({
  billNo: 'CS-0001',
  billDate: '2026-05-10',
  saleType: 'Counter Sale',
  isCash: true,
  custCode: 'AC0002',
  custName: 'Acme Traders',
  billDiscPct: 0,
  billDiscAmt: 0,
  interState: false,
  lines: [
    { itemCode: 'IT01', itemName: 'Basmati Rice', unit: 'Kgs', hsnNo: '1006', qty: 5, rate: 120, disP: 0, disA: 0, gstRate: 18 },
  ],
  ...over,
}); // prettier-ignore

describe('Sales Invoice', () => {
  test('lookups: Sundry Debtors with their address block; sale types', async () => {
    const l = await saleLookups(db, ctx.bookId);
    expect(l.customers.map((c) => [c.name, c.address, c.mobile])).toEqual([
      ['Acme Traders', '12 Market Road', '9822012345'],
    ]);
    expect(l.saleTypes.map((t) => t.name)).toEqual(['Counter Sale']);
  });

  test('bill numbers run per sale-type prefix', async () => {
    expect(await nextSaleBillNo(db, ctx.bookId, 'CS')).toBe('CS-0001');
    expect(await nextSaleBillNo(db, ctx.bookId, '')).toBe('SB-0001');
    await saveSale(db, ctx, bill());
    expect(await nextSaleBillNo(db, ctx.bookId, 'CS')).toBe('CS-0002');
    expect(await nextSaleBillNo(db, ctx.bookId, null)).toBe('SB-0001');
  });

  test('a cash sale posts to the first cash ledger, with no bill reference, and takes stock out', async () => {
    const r = await saveSale(db, ctx, bill({ billDiscAmt: 8 }));
    // 600 + 54 + 54 = 708, less 8 = 700.
    expect(r.net).toBe(700);
    const [v] = await listVouchers(db, ctx.bookId, ['SAL']);
    expect(v).toMatchObject({ vchrNo: 'SAL-001', refNo: 'CS-0001', narration: 'Sale CS-0001' });
    const lines = (await voucherLinesOf(db, ctx.bookId, v!.id)).map((l) => [l.accCode, l.dr, l.cr]);
    expect(lines).toEqual([
      ['AC0003', 700, 0],
      ['SAL002', 8, 0],
      ['SAL001', 0, 600],
      ['TAX004', 0, 54],
      ['TAX005', 0, 54],
    ]);
    expect((await stockInHand(db, ctx.bookId, ['IT01'])).get('IT01')).toBe(15);
    const refs = await db
      .select()
      .from(schema.billRefs)
      .where(eq(schema.billRefs.billNo, 'CS-0001'));
    expect(refs).toEqual([]);
  });

  test('a credit sale books a bill reference against the customer', async () => {
    await saveSale(db, ctx, bill({ isCash: false }));
    const [v] = await listVouchers(db, ctx.bookId, ['SAL']);
    const lines = await voucherLinesOf(db, ctx.bookId, v!.id);
    expect(lines[0]).toMatchObject({ accCode: 'AC0002', dr: 708 });
    const refs = await db
      .select({ refType: schema.billRefs.refType, amount: schema.billRefs.amount })
      .from(schema.billRefs)
      .where(eq(schema.billRefs.billNo, 'CS-0001'));
    expect(refs).toEqual([{ refType: 'New', amount: '708.00' }]);
  });

  test('MDA’s checks, in order', async () => {
    await rejects(saveSale(db, ctx, bill({ custName: ' ' })), sm.customerNameRequired);
    await rejects(saveSale(db, ctx, bill({ isCash: false, custCode: null })), sm.creditNeedsLedger);
    await rejects(saveSale(db, ctx, bill({ lines: [] })), sm.noItems);
    await rejects(
      saveSale(db, ctx, bill({ billDiscAmt: 708 })),
      'Bill value cannot be zero or negative.',
    );
    await rejects(
      saveSale(db, ctx, bill({ lines: [{ ...bill().lines[0]!, qty: 25 }] })),
      'Not enough stock for Basmati Rice: 25.00 needed, 20.00 in hand.',
    );
    await saveSale(db, ctx, bill());
    await rejects(saveSale(db, ctx, bill()), sm.billUsed('CS-0001'));
  });

  test('update keeps the bill, reposts the voucher and re-checks stock without the old lines', async () => {
    await saveSale(db, ctx, bill({ lines: [{ ...bill().lines[0]!, qty: 15 }] }));
    // 15 out already; selling 18 instead is fine because the old 15 come back first.
    await updateSale(db, ctx, bill({ lines: [{ ...bill().lines[0]!, qty: 18 }] }));
    expect((await stockInHand(db, ctx.bookId, ['IT01'])).get('IT01')).toBe(2);
    const vs = await listVouchers(db, ctx.bookId, ['SAL'], true);
    expect(vs.map((v) => v.vchrNo)).toEqual(['SAL-002']);
    const b = await saleBill(db, ctx.bookId, 'CS-0001');
    expect(b!.lines[0]!.qty).toBe(18);
  });

  test('cancel returns the goods, keeps the bill listed, and stops the sale type being removed', async () => {
    await saveSale(db, ctx, bill());
    await cancelSale(db, ctx, 'CS-0001');
    expect((await stockInHand(db, ctx.bookId, ['IT01'])).get('IT01')).toBe(20);
    expect((await listSales(db, ctx.bookId))[0]).toMatchObject({
      status: 'Cancelled',
      itemCount: 1,
    });
    await rejects(updateSale(db, ctx, bill()), sm.cancelledEdit);
    await rejects(
      removeSaleType(db, ctx.bookId, 'ST001'),
      '"Counter Sale" is used on 1 bill(s) and cannot be removed',
    );
  });
});

describe('Stock Journal', () => {
  const journal = (outQty = 4) => ({
    date: '2026-05-12',
    narration: 'Packing',
    lines: [
      { side: 'out' as const, itemCode: 'IT01', itemName: 'Basmati Rice', unit: 'Kgs', godown: 'Main Store', qty: outQty, rate: 80 },
      { side: 'in' as const, itemCode: 'IT02', itemName: 'Sugar', unit: 'Kgs', godown: 'Main Store', qty: 2, rate: 150 },
    ],
  }); // prettier-ignore

  test('moves stock out of the source and into the destination, with no ledger lines', async () => {
    const r = await saveStockJournal(db, ctx, journal());
    expect(r.vchrNo).toBe('STJ-001');
    const have = await stockInHand(db, ctx.bookId, ['IT01', 'IT02']);
    expect([have.get('IT01'), have.get('IT02')]).toEqual([16, 2]);
    const [row] = await listStockJournals(db, ctx.bookId);
    expect(row).toMatchObject({ vchrNo: 'STJ-001', lineCount: 2, value: 300, status: 'Active' });
    expect(await voucherLinesOf(db, ctx.bookId, row!.id)).toEqual([]);
  });

  test('the source is checked against stock in hand', async () => {
    await rejects(
      saveStockJournal(db, ctx, journal(30)),
      'Not enough stock for Basmati Rice: 30.00 needed, 20.00 in hand.',
    );
    await rejects(saveStockJournal(db, ctx, { ...journal(), lines: [] }), jm.noItems);
  });

  test('update replaces the lines; cancel reverses the stock but keeps the lines to view', async () => {
    await saveStockJournal(db, ctx, journal());
    const [row] = await listStockJournals(db, ctx.bookId);
    await updateStockJournal(db, ctx, row!.id, journal(20));
    expect((await stockInHand(db, ctx.bookId, ['IT01'])).get('IT01')).toBe(0);
    await cancelStockJournal(db, ctx, row!.id);
    const have = await stockInHand(db, ctx.bookId, ['IT01', 'IT02']);
    expect([have.get('IT01'), have.get('IT02')]).toEqual([20, 0]);
    expect((await stockJournalLinesOf(db, ctx.bookId, row!.id)).length).toBe(2);
    await rejects(updateStockJournal(db, ctx, row!.id, journal()), jm.cancelledEdit);
  });
});
