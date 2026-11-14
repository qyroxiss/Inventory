import { beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { returnMessages as rm, saleTotals } from '@qi/core';
import { and, eq, openDatabase, schema, sql, type Db } from '@qi/db';
import {
  UserError,
  billForReturn,
  cancelPurchase,
  cancelReturn,
  createCompany,
  createLedger,
  createStockItem,
  createYear,
  gstr3bReport,
  hsnReport,
  itcReport,
  listReturns,
  outstandingReport,
  returnDoc,
  savePurchase,
  saveReturn,
  saveSale,
  stockInHand,
  updateReturn,
  updatePurchase,
  updateSale,
  cancelSale,
  type PostingContext,
} from '../src/index.ts';

const ACC = 'acc-1';
let db: Db;
let ctx: PostingContext;

beforeAll(async () => {
  ({ db } = await openDatabase());
});
beforeEach(async () => {
  await db.execute(
    sql`TRUNCATE audit_log, return_lines, returns, stock_journal_lines, sale_lines, sales, purchase_lines, purchases, stock_trn, voucher_items, bill_refs, voucher_lines, vouchers, voucher_series, stock_items, misc_list, ledgers, book_users, account_groups, financial_years, books, companies RESTART IDENTITY CASCADE`,
  );
  const company = await createCompany(db, ACC, { compName: 'Sharma Traders', add1: 'MG Road' }, 1000);
  const year = await createYear(db, ACC, company.id, { yearName: '2026-2027', fromDate: '01/04/2026', toDate: '31/03/2027' });
  ctx = { bookId: year.bookId, userName: 'admin', fyFrom: '2026-04-01', fyTo: '2027-03-31', financialYearLabel: '2026-2027' };
  const place = { city: 'Pune', state: 'Maharashtra', pincode: '411001' };
  await createLedger(db, ctx.bookId, { name: 'Bharat Suppliers', under: 'L007', ...place }); // AC0001
  await createLedger(db, ctx.bookId, { name: 'Acme Traders', under: 'A007', ...place }); // AC0002
  await createLedger(db, ctx.bookId, { name: 'Cash', under: 'A003', ...place }); // AC0003
  await createStockItem(db, ctx.bookId, { code: 'IT01', name: 'Basmati Rice', unit: 'Kgs', regType: 'Taxable', gstRate: '18%', hsn: '1006' });
  // 20 kg of rice @ 80 + 18%: taxable 1600, CGST 144, SGST 144, net 1888.
  await savePurchase(db, ctx, {
    billNo: 'PB-0001', billDate: '2026-05-01', suppCode: 'AC0001', interState: false,
    lines: [{ itemCode: 'IT01', itemName: 'Basmati Rice', unit: 'Kgs', hsnNo: '1006', qty: 20, rate: 80, disP: 0, disA: 0, gstRate: 18 }],
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

/** The voucher's ledger lines as [code, dr, cr]. */
async function postingOf(kind: 'PRT' | 'SRT', no: string) {
  const [v] = await db
    .select()
    .from(schema.vouchers)
    .where(and(eq(schema.vouchers.vchrType, kind), eq(schema.vouchers.vchrNo, no)));
  const lines = await db
    .select()
    .from(schema.voucherLines)
    .where(eq(schema.voucherLines.voucherId, v!.id))
    .orderBy(schema.voucherLines.lineNo);
  return { v: v!, lines: lines.map((l) => [l.accCode, Number(l.drAmount), Number(l.crAmount)]) };
}

const rice = async () => (await stockInHand(db, ctx.bookId, ['IT01'])).get('IT01');

describe('Purchase Return', () => {
  const ret = (qty: number, over = {}) => ({
    returnNo: '',
    returnDate: '2026-05-05',
    againstBillNo: 'PB-0001',
    lines: [{ srcLineNo: 1, qty }],
    ...over,
  });

  test('posts the purchase turned round, sends the goods out and cuts what is owed', async () => {
    const r = await saveReturn(db, ctx, 'PRT', ret(5));
    expect(r).toEqual({ returnNo: 'PRT-001', net: 472 });
    const { v, lines } = await postingOf('PRT', 'PRT-001');
    expect(lines).toEqual([
      ['AC0001', 472, 0],
      ['PUR003', 0, 400],
      ['TAX001', 0, 36],
      ['TAX002', 0, 36],
    ]);
    expect(v.refNo).toBe('PB-0001');
    // The Purchase Return ledger is made on first use.
    const [l] = await db.select().from(schema.ledgers).where(eq(schema.ledgers.accCode, 'PUR003'));
    expect(l!.accName).toBe('Purchase Return');
    expect(await rice()).toBe(15);
    const open = await outstandingReport(db, ctx.bookId, '2026-06-30');
    expect(open.find((b) => b.billNo === 'PB-0001')!.pending).toBe(1888 - 472);
    expect((await listReturns(db, ctx.bookId, 'PRT'))[0]).toMatchObject({
      returnNo: 'PRT-001', againstBillNo: 'PB-0001', partyName: 'Bharat Suppliers', itemCount: 1, netAmount: 472,
    }); // prettier-ignore
  });

  test('never more than what is left on the bill', async () => {
    await saveReturn(db, ctx, 'PRT', ret(5));
    await rejects(saveReturn(db, ctx, 'PRT', ret(16)), rm.tooMuch('Basmati Rice', 15));
    await saveReturn(db, ctx, 'PRT', ret(15));
    const b = await billForReturn(db, ctx.bookId, 'PRT', 'PB-0001');
    expect(b!.lines[0]).toMatchObject({ qty: 20, returned: 20, left: 0 });
  });

  test('update keeps the number; cancel puts the goods and the balance back', async () => {
    await saveReturn(db, ctx, 'PRT', ret(5));
    // Editing PRT-001 may use its own 5 again.
    await updateReturn(db, ctx, 'PRT', ret(3, { returnNo: 'PRT-001' }));
    expect(await rice()).toBe(17);
    expect((await returnDoc(db, ctx.bookId, 'PRT', 'PRT-001'))!.lines[0]!.qty).toBe(3);
    expect((await billForReturn(db, ctx.bookId, 'PRT', 'PB-0001'))!.lines[0]!.left).toBe(17);

    await cancelReturn(db, ctx, 'PRT', 'PRT-001');
    expect(await rice()).toBe(20);
    expect((await postingOf('PRT', 'PRT-001')).v.status).toBe('Cancelled');
    expect((await billForReturn(db, ctx.bookId, 'PRT', 'PB-0001'))!.lines[0]!.left).toBe(20);
    await rejects(updateReturn(db, ctx, 'PRT', ret(1, { returnNo: 'PRT-001' })), rm.cancelledEdit);
  });

  test('refused: nothing returned, before the bill, against a cancelled bill', async () => {
    await rejects(saveReturn(db, ctx, 'PRT', ret(0)), rm.nothingReturned);
    await rejects(saveReturn(db, ctx, 'PRT', ret(1, { returnDate: '2026-04-30' })), rm.beforeBill);
    await cancelPurchase(db, ctx, 'PB-0001');
    await rejects(saveReturn(db, ctx, 'PRT', ret(1)), rm.billCancelled);
  });

  test('ITC register shows the credit given back; GSTR-3B is net of it', async () => {
    await saveReturn(db, ctx, 'PRT', ret(5));
    const g = { bookId: ctx.bookId, companyStateCode: '27' };
    const p = { from: '2026-04-01', to: '2027-03-31' };
    const rows = await itcReport(db, g, p);
    expect(rows.map((r) => [r.billNo, r.taxable, r.itc])).toEqual([
      ['PB-0001', 1600, 288],
      ['PRT-001', -400, -72],
    ]);
    const hsn = await hsnReport(db, g, { ...p, side: 'in' });
    expect(hsn[0]).toMatchObject({ hsn: '1006', qty: 15, taxable: 1200 });
  });
});

describe('Sales Return', () => {
  // 5 kg of rice @ 120 + 18% on credit, less 10% on the bill before tax: 600 - 60 = 540 taxed.
  const sell = (isCash: boolean) =>
    saveSale(db, ctx, {
      billNo: 'SB-0001', billDate: '2026-05-10', isCash, custCode: 'AC0002', custName: 'Acme Traders',
      billDiscPct: 10, billDiscAmt: 0, interState: false,
      lines: [{ itemCode: 'IT01', itemName: 'Basmati Rice', unit: 'Kgs', hsnNo: '1006', qty: 5, rate: 120, disP: 0, disA: 0, gstRate: 18 }],
    }); // prettier-ignore
  const ret = { returnNo: '', returnDate: '2026-05-12', againstBillNo: 'SB-0001', lines: [{ srcLineNo: 1, qty: 2 }] };

  test('posts the sale turned round with its share of the bill discount; goods come back', async () => {
    await sell(false);
    const r = await saveReturn(db, ctx, 'SRT', ret);
    // 2 kg: 240, less 10% (24) → 216 taxed, + 19.44 + 19.44 → 254.88, rounded to 255.
    expect(r).toEqual({ returnNo: 'SRT-001', net: 255 });
    const { lines } = await postingOf('SRT', 'SRT-001');
    expect(lines).toEqual([
      ['SAL003', 240, 0],
      ['TAX004', 19.44, 0],
      ['TAX005', 19.44, 0],
      ['TAX007', 0.12, 0],
      ['SAL002', 0, 24],
      ['AC0002', 0, 255],
    ]);
    expect(await rice()).toBe(20 - 5 + 2);
    // Printed as a Credit Note: the lines as entered plus the discount give the same total.
    const doc = (await returnDoc(db, ctx.bookId, 'SRT', 'SRT-001'))!;
    expect(saleTotals(doc.lines, 0, doc.billDisc)).toMatchObject({ billDisc: 24, cgst: 19.44, net: 255 });
    const open = await outstandingReport(db, ctx.bookId, '2026-06-30');
    const due = open.find((b) => b.billNo === 'SB-0001')!;
    expect(due.pending).toBe(due.amount - 255);

    // GSTR-3B outward supplies and the HSN summary are net of the return.
    const g = { bookId: ctx.bookId, companyStateCode: '27' };
    const p = { from: '2026-04-01', to: '2027-03-31' };
    // Sold 540 taxed (48.60 + 48.60), returned 216 (19.44 + 19.44).
    expect((await gstr3bReport(db, g, p)).outward).toMatchObject({ taxable: 324, cgst: 29.16, sgst: 29.16 });
    expect((await hsnReport(db, g, { ...p, side: 'out' }))[0]).toMatchObject({ qty: 3, taxable: 324 });
  });

  test('a cash sale is refunded from the Cash ledger, with no bill reference', async () => {
    await sell(true);
    await saveReturn(db, ctx, 'SRT', ret);
    const { v, lines } = await postingOf('SRT', 'SRT-001');
    const credited = lines.find((l) => Number(l[2]) === 255)!;
    // The sale was debited to the first Cash-in-Hand ledger; the refund comes out of it.
    const [saleV] = await db.select().from(schema.vouchers).where(eq(schema.vouchers.vchrType, 'SAL'));
    const [saleDr] = await db
      .select()
      .from(schema.voucherLines)
      .where(eq(schema.voucherLines.voucherId, saleV!.id))
      .orderBy(schema.voucherLines.lineNo);
    expect(credited[0]).toBe(saleDr!.accCode);
    const refs = await db.select().from(schema.billRefs).where(eq(schema.billRefs.voucherId, v.id));
    expect(refs).toEqual([]);
  });
});

// 2026-11-11 audit: a bill with returns against it can't be cancelled, or edited out from under them.
describe('Bills that have returns', () => {
  const purchaseLine = (qty: number, itemCode = 'IT01') => ({ itemCode, itemName: 'Basmati Rice', unit: 'Kgs', hsnNo: '1006', qty, rate: 80, disP: 0, disA: 0, gstRate: 18 });
  const purchase = (qty: number) => ({ billNo: 'PB-0001', billDate: '2026-05-01', suppCode: 'AC0001', interState: false, lines: [purchaseLine(qty)] });
  const prt = (qty: number) => ({ returnNo: '', returnDate: '2026-05-05', againstBillNo: 'PB-0001', lines: [{ srcLineNo: 1, qty }] });
  const errorOf = (p: Promise<unknown>) => p.then(() => null, (e: unknown) => e as Error);

  test('a purchase with a return cannot be cancelled until the return is', async () => {
    await saveReturn(db, ctx, 'PRT', prt(5));
    const e = await errorOf(cancelPurchase(db, ctx, 'PB-0001'));
    expect(e).toBeInstanceOf(UserError);
    expect(e!.message).toContain('PRT-001');
    expect(await rice()).toBe(15);
    await cancelReturn(db, ctx, 'PRT', 'PRT-001');
    await cancelPurchase(db, ctx, 'PB-0001');
    expect(await rice()).toBe(0);
  });

  test('a purchase update cannot cut a line below what was returned', async () => {
    await saveReturn(db, ctx, 'PRT', prt(8));
    const e = await errorOf(updatePurchase(db, ctx, purchase(2)));
    expect(e).toBeInstanceOf(UserError);
    expect(e!.message).toContain('8 returned on PRT-001');
    await updatePurchase(db, ctx, purchase(8)); // exactly what was returned is fine
    expect(await rice()).toBe(0);
  });

  test('a sale with a return cannot be cancelled, nor its returned line removed', async () => {
    await saveSale(db, ctx, {
      billNo: 'SB-0001', billDate: '2026-05-10', isCash: false, custCode: 'AC0002', custName: 'Acme Traders',
      billDiscPct: 0, billDiscAmt: 0, interState: false,
      lines: [{ itemCode: 'IT01', itemName: 'Basmati Rice', unit: 'Kgs', hsnNo: '1006', qty: 4, rate: 120, disP: 0, disA: 0, gstRate: 18 }],
    });
    await saveReturn(db, ctx, 'SRT', { returnNo: '', returnDate: '2026-05-12', againstBillNo: 'SB-0001', lines: [{ srcLineNo: 1, qty: 4 }] });
    expect(await errorOf(cancelSale(db, ctx, 'SB-0001'))).toBeInstanceOf(UserError);
    expect(await rice()).toBe(20);
    const e = await errorOf(updateSale(db, ctx, {
      billNo: 'SB-0001', billDate: '2026-05-10', isCash: false, custCode: 'AC0002', custName: 'Acme Traders',
      billDiscPct: 0, billDiscAmt: 0, interState: false,
      lines: [{ itemCode: 'IT01', itemName: 'Basmati Rice', unit: 'Kgs', hsnNo: '1006', qty: 3, rate: 120, disP: 0, disA: 0, gstRate: 18 }],
    }));
    expect(e).toBeInstanceOf(UserError);
  });
}); // prettier-ignore
