import { beforeAll, beforeEach, describe, expect, test } from 'vitest';
import {
  debitNoteDraft,
  journalDraft,
  ledgerMessages,
  paymentDraft,
  postingMessages,
  receiptDraft,
} from '@qi/core';
import { openDatabase, schema, sql, eq, type Db } from '@qi/db';
import {
  UserError,
  bookLogin,
  cancelVoucher,
  createCompany,
  createLedger,
  createYear,
  deleteLedger,
  listLedgers,
  listVouchers,
  nextVoucherNo,
  saveVoucher,
  updateVoucher,
  voucherForPrint,
  voucherLinesOf,
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
    sql`TRUNCATE audit_log, bill_refs, voucher_lines, vouchers, voucher_series, stock_items, misc_list, ledgers, book_users, account_groups, financial_years, books, companies RESTART IDENTITY CASCADE`,
  );
  const company = await createCompany(db, ACC, { compName: 'Sharma Traders', add1: 'MG Road' }, 1000);
  const year = await createYear(db, ACC, company.id, {
    yearName: '2026-2027',
    fromDate: '01/04/2026',
    toDate: '31/03/2027',
  });
  ctx = {
    bookId: year.bookId,
    userName: 'admin',
    fyFrom: '2026-04-01',
    fyTo: '2027-03-31',
    financialYearLabel: '2026-2027',
  };
  // A cash ledger and a party, as a user would create them.
  await createLedger(db, ctx.bookId, { name: 'Cash', under: 'A003', city: 'Pune', state: 'Maharashtra', pincode: '411001' });
  await createLedger(db, ctx.bookId, { name: 'Acme Traders', under: 'A007', city: 'Pune', state: 'Maharashtra', pincode: '411001' });
}); // prettier-ignore

const rejects = async (p: Promise<unknown>, message: string) => {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(UserError);
  expect((err as UserError).message).toBe(message);
};

const receipt = (amount: number, vchrNo: string, date = '2026-05-10') => ({
  ...receiptDraft(false, 'AC0001', 'AC0002', amount, vchrNo),
  vchrNo,
  date,
  refNo: 'CHQ 12',
  narration: 'Part payment',
});

describe('seeds', () => {
  test('a new book has MDA’s system ledgers and voucher series', async () => {
    const names = (await listLedgers(db, ctx.bookId)).map((l) => `${l.accCode} ${l.accName}`);
    expect(names).toEqual(
      expect.arrayContaining([
        'TAX001 Input CGST',
        'TAX007 Round Off',
        'SAL001 Sales A/c',
        'PUR001 Purchase A/c',
      ]),
    );
    const sales = (await listLedgers(db, ctx.bookId)).find((l) => l.accCode === 'SAL001');
    expect(sales?.drCr).toBe('Cr');
    expect(await nextVoucherNo(db, ctx.bookId, 'RCP')).toBe('RCP-001');
    expect(await nextVoucherNo(db, ctx.bookId, 'BPAY')).toBe('BPAY-001');
  });

  test('a book made before vouchers gets them on its next login', async () => {
    await db.delete(schema.voucherSeries);
    await db.delete(schema.ledgers).where(eq(schema.ledgers.accCode, 'SAL001'));
    expect(await nextVoucherNo(db, ctx.bookId, 'RCP')).toBe('RCP001'); // no series: MDA's fallback
    const [year] = await db.select().from(schema.financialYears);
    await bookLogin(db, ACC, { yearId: year!.id, username: 'admin', password: 'admin' });
    expect(await nextVoucherNo(db, ctx.bookId, 'RCP')).toBe('RCP-001');
    expect((await listLedgers(db, ctx.bookId)).some((l) => l.accCode === 'SAL001')).toBe(true);
  });
});

describe('posting', () => {
  test('save: header, lines, bill reference, series, audit; the next number moves on', async () => {
    const saved = await saveVoucher(db, ctx, receipt(1500.5, 'RCP-001'));
    expect(saved.vchrNo).toBe('RCP-001');
    expect(await nextVoucherNo(db, ctx.bookId, 'RCP')).toBe('RCP-002');
    expect(await voucherLinesOf(db, ctx.bookId, saved.id)).toEqual([
      { lineNo: 1, accCode: 'AC0001', accName: 'Cash', dr: 1500.5, cr: 0, narration: null },
      { lineNo: 2, accCode: 'AC0002', accName: 'Acme Traders', dr: 0, cr: 1500.5, narration: null },
    ]);
    const [ref] = await db.select().from(schema.billRefs);
    expect(ref).toMatchObject({ accCode: 'AC0002', billNo: 'RCP-001', refType: 'On Account', amount: '1500.50' });
    const [row] = await listVouchers(db, ctx.bookId, ['RCP', 'BNK']);
    expect(row).toMatchObject({ vchrNo: 'RCP-001', vchrDate: '2026-05-10', partyName: 'Acme Traders', drName: 'Cash', crName: 'Acme Traders', netAmount: 1500.5, status: 'Active' });
    const log = await db.select().from(schema.auditLog);
    expect(log.map((l) => `${l.action} ${l.recordKey} ${l.details}`)).toContain('CREATE RCP/RCP-001 Net 1500.50');
  }); // prettier-ignore

  test('the posting gate, with MDA’s messages', async () => {
    await rejects(saveVoucher(db, ctx, receipt(100, 'RCP-001', '2027-04-01')), postingMessages.outsideYear('2026-2027'));
    await rejects(saveVoucher(db, ctx, receipt(0, 'RCP-001')), postingMessages.zero);
    await rejects(
      saveVoucher(db, ctx, { vchrType: 'JNL', date: '2026-05-10', lines: [{ accCode: 'AC0001', dr: 10, cr: 0 }, { accCode: 'AC0002', dr: 0, cr: 9 }] }),
      postingMessages.unbalanced(1),
    );
    await rejects(
      saveVoucher(db, ctx, { vchrType: 'JNL', date: '2026-05-10', lines: [{ accCode: 'AC0001', dr: 5, cr: 5 }] }),
      postingMessages.bothSides('AC0001'),
    );
    await rejects(saveVoucher(db, ctx, { vchrType: 'JNL', date: '2026-05-10', lines: [] }), postingMessages.noLines);
    await rejects(
      saveVoucher(db, ctx, { vchrType: 'JNL', date: '2026-05-10', lines: [{ accCode: '', dr: 5, cr: 0 }, { accCode: 'AC0002', dr: 0, cr: 5 }] }),
      postingMessages.lineNoLedger,
    );
  }); // prettier-ignore

  test('a number already taken is refused, as MDA says (Q-44)', async () => {
    await saveVoucher(db, ctx, receipt(100, 'RCP-001'));
    await rejects(saveVoucher(db, ctx, receipt(200, 'RCP-001')), postingMessages.numberUsed('RCP-001'));
    // Each type counts on its own.
    const pay = await saveVoucher(db, ctx, { ...paymentDraft(false, 'AC0001', 'AC0002', 50, 'PAY-001'), vchrNo: 'PAY-001', date: '2026-05-11' });
    expect(pay.vchrNo).toBe('PAY-001');
  }); // prettier-ignore

  test('update keeps number and identity, replaces lines, and drops the bill reference (Q-43)', async () => {
    const saved = await saveVoucher(db, ctx, receipt(100, 'RCP-001'));
    const { lines, partyCode } = receiptDraft(false, 'AC0001', 'AC0002', 250, 'RCP-001');
    expect(await updateVoucher(db, ctx, saved.id, { date: '2026-06-01', lines, partyCode, narration: 'Full' })).toEqual({ id: saved.id, vchrNo: 'RCP-001' });
    const [row] = await listVouchers(db, ctx.bookId, ['RCP']);
    expect(row).toMatchObject({ vchrNo: 'RCP-001', vchrDate: '2026-06-01', netAmount: 250, narration: 'Full' });
    expect(await db.select().from(schema.billRefs)).toEqual([]);
  }); // prettier-ignore

  test('cancel keeps the voucher, marked; it can’t be edited; lists show it only when asked', async () => {
    const saved = await saveVoucher(db, ctx, receipt(100, 'RCP-001'));
    await cancelVoucher(db, ctx, saved.id);
    await cancelVoucher(db, ctx, saved.id); // twice: nothing more
    expect(await listVouchers(db, ctx.bookId, ['RCP'])).toEqual([]);
    expect((await listVouchers(db, ctx.bookId, ['RCP'], true))[0]?.status).toBe('Cancelled');
    expect(await voucherLinesOf(db, ctx.bookId, saved.id)).toHaveLength(2);
    const { lines } = receiptDraft(false, 'AC0001', 'AC0002', 5, 'RCP-001');
    await rejects(updateVoucher(db, ctx, saved.id, { date: '2026-05-10', lines }), postingMessages.cancelledEdit);
    // Its number stays used.
    expect(await nextVoucherNo(db, ctx.bookId, 'RCP')).toBe('RCP-002');
  }); // prettier-ignore

  test('notes and journals: balanced lines, reason on the party line, list newest first', async () => {
    await saveVoucher(db, ctx, { ...journalDraft([{ accCode: 'AC0001', debit: true, amount: 70 }, { accCode: 'AC0002', debit: false, amount: 70 }]), vchrNo: 'JNL-001', date: '2026-05-01' });
    const dn = debitNoteDraft('AC0002', 'Short Supply', [{ accCode: 'PUR001', amount: 40 }, { accCode: 'TAX001', amount: 2.5 }], 'DRN-001');
    const saved = await saveVoucher(db, ctx, { ...dn, vchrNo: 'DRN-001', date: '2026-05-02' });
    const lines = await voucherLinesOf(db, ctx.bookId, saved.id);
    expect(lines.map((l) => [l.accCode, l.dr, l.cr, l.narration])).toEqual([
      ['AC0002', 42.5, 0, 'Short Supply'],
      ['PUR001', 0, 40, null],
      ['TAX001', 0, 2.5, null],
    ]);
    await saveVoucher(db, ctx, receipt(10, 'RCP-001', '2026-05-03'));
    expect((await listVouchers(db, ctx.bookId, ['JNL', 'DRN', 'RCP'])).map((v) => v.vchrNo)).toEqual(['RCP-001', 'DRN-001', 'JNL-001']);
  }); // prettier-ignore

  test('Ledger Creation refuses to delete a ledger used in a voucher, cancelled or not', async () => {
    const saved = await saveVoucher(db, ctx, receipt(100, 'RCP-001'));
    await cancelVoucher(db, ctx, saved.id);
    await rejects(
      deleteLedger(db, ctx.bookId, 'AC0002'),
      ledgerMessages.removeBlocked('Acme Traders', 1),
    );
  });

  test('print lookup: the receipt by number with its party and the company', async () => {
    await saveVoucher(db, ctx, receipt(1500.5, 'RCP-001'));
    const p = await voucherForPrint(db, ctx.bookId, 'RCP-001', ['RCP', 'BNK'], 'cr');
    expect(p).toMatchObject({ vchrNo: 'RCP-001', amount: 1500.5, refNo: 'CHQ 12', drName: 'Cash', status: 'Active' });
    expect(p?.party?.accName).toBe('Acme Traders');
    expect(p?.company?.compName).toBe('Sharma Traders');
    expect(await voucherForPrint(db, ctx.bookId, 'RCP-009', ['RCP', 'BNK'], 'cr')).toBeNull();
  }); // prettier-ignore
});
