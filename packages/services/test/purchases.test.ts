import { beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { purchaseMessages as pm } from '@qi/core';
import { and, eq, openDatabase, schema, sql, type Db } from '@qi/db';
import {
  UserError,
  cancelPurchase,
  createCompany,
  createLedger,
  createMiscMaster,
  createStockItem,
  createYear,
  listPurchases,
  listVouchers,
  nextPurchaseBillNo,
  purchaseBill,
  purchaseLookups,
  savePurchase,
  updatePurchase,
  voucherLinesOf,
  type PostingContext,
  type PurchaseInput,
} from '../src/index.ts';

const ACC = 'acc-1';
let db: Db;
let ctx: PostingContext;

beforeAll(async () => {
  ({ db } = await openDatabase());
});
beforeEach(async () => {
  await db.execute(
    sql`TRUNCATE audit_log, purchase_lines, purchases, stock_trn, voucher_items, bill_refs, voucher_lines, vouchers, voucher_series, stock_items, misc_list, ledgers, book_users, account_groups, financial_years, books, companies RESTART IDENTITY CASCADE`,
  );
  const company = await createCompany(db, ACC, { compName: 'Sharma Traders', add1: 'MG Road' }, 1000);
  const year = await createYear(db, ACC, company.id, { yearName: '2026-2027', fromDate: '01/04/2026', toDate: '31/03/2027' });
  ctx = { bookId: year.bookId, userName: 'admin', fyFrom: '2026-04-01', fyTo: '2027-03-31', financialYearLabel: '2026-2027' };
  const place = { city: 'Pune', state: 'Maharashtra', pincode: '411001' };
  await createLedger(db, ctx.bookId, { name: 'Bharat Suppliers', under: 'L007', ...place }); // AC0001
  await createLedger(db, ctx.bookId, { name: 'Acme Traders', under: 'A007', ...place }); // AC0002
  await createStockItem(db, ctx.bookId, { code: 'IT01', name: 'Basmati Rice', unit: 'Kgs', regType: 'Taxable', gstRate: '18%', hsn: '1006' });
  await createStockItem(db, ctx.bookId, { code: 'IT02', name: 'Sugar', unit: 'Kgs', regType: 'Taxable', gstRate: '12%', hsn: '1701' });
  await createMiscMaster(db, ctx.bookId, 'godown', { name: 'Main Store' });
}); // prettier-ignore

const rejects = async (p: Promise<unknown>, message: string) => {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(UserError);
  expect((err as UserError).message).toBe(message);
};

const bill = (over: Partial<PurchaseInput> = {}): PurchaseInput => ({
  billNo: 'PB-0001',
  billDate: '2026-05-10',
  suppCode: 'AC0001',
  suppInvNo: 'INV-77',
  suppInvDate: '08/05/2026',
  narration: '',
  interState: false,
  lines: [
    { itemCode: 'IT01', itemName: 'Basmati Rice', unit: 'Kgs', hsnNo: '1006', location: 'Main Store', qty: 10, rate: 100, disP: 5, disA: 0, gstRate: 18 },
    { itemCode: 'IT02', itemName: 'Sugar', unit: 'Kgs', hsnNo: '1701', location: null, qty: 3, rate: 33.33, disP: 0, disA: 0, gstRate: 12 },
  ],
  ...over,
}); // prettier-ignore

const stockOf = async (part: string) => {
  const [r] = await db
    .select({
      q: sql<string>`coalesce(sum(${schema.stockTrn.inQty} - ${schema.stockTrn.outQty}), 0)`,
    })
    .from(schema.stockTrn)
    .where(and(eq(schema.stockTrn.bookId, ctx.bookId), eq(schema.stockTrn.partCode, part)));
  return Number(r!.q);
};

describe('lookups and numbering', () => {
  test('suppliers are Sundry Creditors (and groups under it); items and godowns by name', async () => {
    const l = await purchaseLookups(db, ctx.bookId);
    expect(l.suppliers.map((s) => s.name)).toEqual(['Bharat Suppliers']);
    expect(l.items.map((i) => [i.code, i.gstRate])).toEqual([
      ['IT01', 18],
      ['IT02', 12],
    ]);
    expect(l.godowns.map((g) => g.name)).toEqual(['Main Store']);
  });
  test('bill numbers start at PB-0001 and follow the highest bill', async () => {
    expect(await nextPurchaseBillNo(db, ctx.bookId)).toBe('PB-0001');
    await savePurchase(db, ctx, bill());
    expect(await nextPurchaseBillNo(db, ctx.bookId)).toBe('PB-0002');
  });
});

describe('save', () => {
  test('writes the bill, a balanced PUR voucher, stock inward and the supplier’s bill reference', async () => {
    const r = await savePurchase(db, ctx, bill());
    expect(r).toEqual({ billNo: 'PB-0001', net: 1233 });

    const [v] = await listVouchers(db, ctx.bookId, ['PUR']);
    expect(v).toMatchObject({ vchrNo: 'PUR-001', refNo: 'PB-0001', netAmount: 1233, partyCode: 'AC0001' });
    // The narration stays empty: MDA's "Purchase <bill>" fallback never applies (Q-49).
    expect(v!.narration).toBe('');
    const lines = await voucherLinesOf(db, ctx.bookId, v!.id);
    expect(lines.map((l) => [l.accCode, l.dr, l.cr])).toEqual([
      ['PUR001', 1049.99, 0],
      ['TAX001', 91.5, 0],
      ['TAX002', 91.5, 0],
      ['TAX007', 0.01, 0],
      ['AC0001', 0, 1233],
    ]);
    expect(await stockOf('IT01')).toBe(10);
    expect(await stockOf('IT02')).toBe(3);
    const refs = await db.select().from(schema.billRefs).where(eq(schema.billRefs.voucherId, v!.id));
    expect(refs.map((b) => [b.accCode, b.billNo, b.refType, b.amount])).toEqual([['AC0001', 'PB-0001', 'New', '1233.00']]);

    const read = await purchaseBill(db, ctx.bookId, 'PB-0001');
    expect(read).toMatchObject({ suppName: 'Bharat Suppliers', suppInvNo: 'INV-77', isInterState: false });
    expect(read!.lines.map((l) => [l.itemCode, l.disA, l.amount, l.cgstP, l.location])).toEqual([
      ['IT01', 50, 950, 9, 'Main Store'],
      ['IT02', 0, 99.99, 6, null],
    ]);
    expect(await listPurchases(db, ctx.bookId)).toMatchObject([
      { billNo: 'PB-0001', suppName: 'Bharat Suppliers', itemCount: 2, netAmount: 1233, status: 'Active' },
    ]);
  }); // prettier-ignore

  test('inter-state posts Input IGST', async () => {
    await savePurchase(db, ctx, bill({ interState: true }));
    const [v] = await listVouchers(db, ctx.bookId, ['PUR']);
    const codes = (await voucherLinesOf(db, ctx.bookId, v!.id)).map((l) => l.accCode);
    expect(codes).toContain('TAX003');
    expect(codes).not.toContain('TAX001');
  });

  test('refuses a taken bill number, a date outside the year, and a bill with no items', async () => {
    await savePurchase(db, ctx, bill());
    await rejects(savePurchase(db, ctx, bill()), pm.billUsed('PB-0001'));
    await rejects(
      savePurchase(db, ctx, bill({ billNo: 'PB-0002', billDate: '2027-04-02' })),
      pm.outsideYear('2026-2027'),
    );
    await rejects(savePurchase(db, ctx, bill({ billNo: 'PB-0002', lines: [] })), pm.noItems);
  });

  test('recreates a missing system ledger before posting', async () => {
    await db
      .delete(schema.ledgers)
      .where(and(eq(schema.ledgers.bookId, ctx.bookId), eq(schema.ledgers.accCode, 'TAX007')));
    await savePurchase(db, ctx, bill());
    const [l] = await db
      .select()
      .from(schema.ledgers)
      .where(and(eq(schema.ledgers.bookId, ctx.bookId), eq(schema.ledgers.accCode, 'TAX007')));
    expect(l).toMatchObject({ accName: 'Round Off', grpCode: 'E002' });
  });
});

describe('update and cancel', () => {
  test('update keeps the bill number but reposts under a new PUR number (Q-07)', async () => {
    await savePurchase(db, ctx, bill());
    await updatePurchase(db, ctx, bill({ lines: [bill().lines[0]!] }));
    const vs = await listVouchers(db, ctx.bookId, ['PUR'], true);
    expect(vs.map((v) => v.vchrNo)).toEqual(['PUR-002']);
    expect(vs[0]!.netAmount).toBe(1121);
    expect(await stockOf('IT02')).toBe(0);
    expect((await purchaseBill(db, ctx.bookId, 'PB-0001'))!.lines).toHaveLength(1);
  });

  test('cancel keeps the bill and its ledger lines, and removes its stock', async () => {
    await savePurchase(db, ctx, bill());
    await cancelPurchase(db, ctx, 'PB-0001');
    expect((await listPurchases(db, ctx.bookId))[0]!.status).toBe('Cancelled');
    const [v] = await listVouchers(db, ctx.bookId, ['PUR'], true);
    expect(v!.status).toBe('Cancelled');
    expect(await voucherLinesOf(db, ctx.bookId, v!.id)).toHaveLength(5);
    expect(await stockOf('IT01')).toBe(0);
    await rejects(updatePurchase(db, ctx, bill()), pm.cancelledEdit);
    // The number stays used.
    expect(await nextPurchaseBillNo(db, ctx.bookId)).toBe('PB-0002');
  });

  test('update and cancel of an unknown bill', async () => {
    await rejects(updatePurchase(db, ctx, bill({ billNo: 'PB-0099' })), pm.notFound);
    await rejects(cancelPurchase(db, ctx, 'PB-0099'), pm.notFound);
  });
});
