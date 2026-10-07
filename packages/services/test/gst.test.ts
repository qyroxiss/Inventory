import { beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { openDatabase, sql, type Db } from '@qi/db';
import {
  createCompany,
  createLedger,
  createStockItem,
  createYear,
  gstAudit,
  gstr1Report,
  gstr3bReport,
  hsnReport,
  itcReport,
  savePurchase,
  saveSale,
  saveVoucher,
  type GstContext,
  type PostingContext,
} from '../src/index.ts';

const ACC = 'acc-1';
let db: Db;
let ctx: PostingContext;
let gst: GstContext;
const may = { from: '2026-05-01', to: '2026-05-31' };

beforeAll(async () => {
  ({ db } = await openDatabase());
});

// Company in Maharashtra (27). Buys 20 kg rice @ 100 + 18% from a registered Pune supplier, and
// 10 kg sugar @ 50 + 12% from an unregistered one. Sells 5 kg rice @ 150 to a registered
// Karnataka customer (IGST) and 2 kg @ 150 to a walk-in buyer in the state (CGST + SGST).
beforeEach(async () => {
  await db.execute(
    sql`TRUNCATE audit_log, stock_journal_lines, sale_lines, sales, purchase_lines, purchases, stock_trn, voucher_items, bill_refs, voucher_lines, vouchers, voucher_series, stock_items, misc_list, ledgers, book_users, account_groups, financial_years, books, companies RESTART IDENTITY CASCADE`,
  );
  const company = await createCompany(db, ACC, { compName: 'Sharma Traders', add1: 'MG Road', gstin: '27ABCDE1234F1Z0' }, 1000);
  const y = await createYear(db, ACC, company.id, { yearName: '2026-2027', fromDate: '01/04/2026', toDate: '31/03/2027' });
  ctx = { bookId: y.bookId, userName: 'admin', fyFrom: '2026-04-01', fyTo: '2027-03-31', financialYearLabel: '2026-2027' };
  gst = { bookId: y.bookId, companyStateCode: '27' };
  const place = { city: 'Pune', state: 'Maharashtra', pincode: '411001' };
  await createLedger(db, ctx.bookId, { name: 'Pune Wholesale', under: 'L007', gstin: '27AAAAA1111A1ZW', ...place }); // AC0001
  await createLedger(db, ctx.bookId, { name: 'Local Farmer', under: 'L007', ...place }); // AC0002
  await createLedger(db, ctx.bookId, { name: 'Karnataka Stores', under: 'A007', gstin: '29ABCDE1234F1ZW', ...place }); // AC0003
  await createLedger(db, ctx.bookId, { name: 'Walk-in', under: 'A007', ...place }); // AC0004
  await createStockItem(db, ctx.bookId, { code: 'IT01', name: 'Basmati Rice', unit: 'Kgs', regType: 'Taxable', gstRate: '18%', hsn: '1006' });
  await createStockItem(db, ctx.bookId, { code: 'IT02', name: 'Sugar', unit: 'Kgs', regType: 'Taxable', gstRate: '12%' });
  await savePurchase(db, ctx, {
    billNo: 'PB-0001', billDate: '2026-05-02', suppCode: 'AC0001', suppInvNo: 'PW-77', interState: false,
    lines: [{ itemCode: 'IT01', itemName: 'Basmati Rice', unit: 'Kgs', hsnNo: '1006', qty: 20, rate: 100, disP: 0, disA: 0, gstRate: 18 }],
  });
  await savePurchase(db, ctx, {
    billNo: 'PB-0002', billDate: '2026-05-03', suppCode: 'AC0002', interState: false,
    lines: [{ itemCode: 'IT02', itemName: 'Sugar', unit: 'Kgs', qty: 10, rate: 50, disP: 0, disA: 0, gstRate: 12 }],
  });
  const sale = { saleType: null, isCash: false, billDiscPct: 0, billDiscAmt: 0 };
  await saveSale(db, ctx, {
    ...sale, billNo: 'SB-0001', billDate: '2026-05-10', custCode: 'AC0003', custName: 'Karnataka Stores',
    gstNo: '29ABCDE1234F1ZW', stateCode: '29', interState: true,
    lines: [{ itemCode: 'IT01', itemName: 'Basmati Rice', unit: 'Kgs', hsnNo: '1006', qty: 5, rate: 150, disP: 0, disA: 0, gstRate: 18 }],
  });
  await saveSale(db, ctx, {
    ...sale, billNo: 'SB-0002', billDate: '2026-05-11', custCode: 'AC0004', custName: 'Walk-in', interState: false,
    lines: [{ itemCode: 'IT01', itemName: 'Basmati Rice', unit: 'Kgs', hsnNo: '1006', qty: 2, rate: 150, disP: 0, disA: 0, gstRate: 18 }],
  });
}); // prettier-ignore

describe('GST Reports', () => {
  test('GSTR-1: the Karnataka bill is B2B (IGST), the walk-in bill B2C Small', async () => {
    const r = await gstr1Report(db, gst, may);
    expect(r.b2b.map((x) => [x.billNo, x.gstin, x.pos, x.taxable, x.igst])).toEqual([
      ['SB-0001', '29ABCDE1234F1ZW', '29-Karnataka', 750, 135],
    ]);
    expect(r.b2cl).toEqual([]);
    expect(r.b2cs).toEqual([
      { pos: '27-Maharashtra', rate: 18, type: 'Intra', taxable: 300, igst: 0, cgst: 27, sgst: 27 },
    ]);
    expect(r.hsn.map((h) => [h.hsn, h.qty, h.taxable])).toEqual([['1006', 7, 1050]]);
    // A month with no sales.
    expect((await gstr1Report(db, gst, { from: '2026-06-01', to: '2026-06-30' })).b2b).toEqual([]);
  });

  test('ITC register: only the registered supplier’s tax is eligible', async () => {
    const rows = await itcReport(db, gst, may);
    expect(rows.map((r) => [r.billNo, r.supplier, r.eligible, r.itc])).toEqual([
      ['PB-0001', 'Pune Wholesale', true, 360],
      ['PB-0002', 'Local Farmer', false, 60],
    ]);
  });

  test('GSTR-3B: output 189 against eligible credit 360', async () => {
    const r = await gstr3bReport(db, gst, may);
    expect(r.outward).toEqual({ taxable: 1050, igst: 135, cgst: 27, sgst: 27 });
    expect(r.itc).toEqual({ igst: 0, cgst: 180, sgst: 180 });
    // CGST credit 180: 27 to CGST, 135 to IGST. SGST credit 180: 27 to SGST.
    expect(r.paidByItc).toEqual({ igst: 135, cgst: 27, sgst: 27 });
    expect(r.cash).toEqual({ igst: 0, cgst: 0, sgst: 0 });
    expect(r.carryForward).toEqual({ igst: 0, cgst: 18, sgst: 153 });
  });

  test('HSN summary of purchases', async () => {
    const rows = await hsnReport(db, gst, { ...may, side: 'in' });
    expect(rows.map((h) => [h.hsn, h.rate, h.taxable])).toEqual([
      ['', 12, 500],
      ['1006', 18, 2000],
    ]);
  });

  test('GST Audit: unregistered ITC, a missing HSN, and a journal to a tax ledger', async () => {
    await saveVoucher(db, ctx, {
      vchrType: 'JNL', date: '2026-05-20',
      lines: [{ accCode: 'TAX004', dr: 10, cr: 0 }, { accCode: 'TAX007', dr: 0, cr: 10 }],
    }); // prettier-ignore
    const found = await gstAudit(db, gst, may);
    expect(found.map((f) => [f.level, f.area, f.text])).toEqual([
      [
        'warning',
        'Input tax credit',
        'PB-0002: input tax taken on a purchase from Local Farmer, who has no valid GSTIN.',
      ],
      ['warning', 'HSN code', 'Sugar has no HSN code.'],
      ['warning', 'Tax ledger', 'Output CGST moved 17.00 in the books, but the bills total 27.00.'],
    ]);
  });
});
