import { beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { openDatabase, sql, type Db } from '@qi/db';
import {
  UserError,
  createCompany,
  createLedger,
  createYear,
  deleteLedger,
  listLedgers,
  updateLedger,
} from '../src/index.ts';

const ACC = 'acc-1';
let db: Db;
let bookId: string;

beforeAll(async () => {
  ({ db } = await openDatabase());
});
beforeEach(async () => {
  await db.execute(
    sql`TRUNCATE audit_log, ledgers, book_users, account_groups, financial_years, books, companies RESTART IDENTITY CASCADE`,
  );
  const company = await createCompany(db, ACC, { compName: 'Sharma Traders' }, 1000);
  const year = await createYear(db, ACC, company.id, {
    yearName: '2026-2027',
    fromDate: '01/04/2026',
    toDate: '31/03/2027',
  });
  bookId = year.bookId;
});

const rejects = async (p: Promise<unknown>, message: string) => {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(UserError);
  expect((err as UserError).message).toBe(message);
};

const valid = {
  name: 'Petty Cash',
  city: 'Pune',
  state: 'Maharashtra',
  pincode: '411001',
  under: 'A001', // Current Assets — seeded on every new book
};

describe('createLedger', () => {
  test('saves with the required fields, generating an AC code', async () => {
    const l = await createLedger(db, bookId, valid);
    expect(l.accCode).toBe('AC0001');
    expect(l.accName).toBe('Petty Cash');
    expect(l.grpCode).toBe('A001');
    expect(l.opBal).toBe('0.00');
    expect(l.drCr).toBe('Dr');
    expect(l.isActive).toBe(true);
  });

  test('an opening balance and Cr side round-trip', async () => {
    const l = await createLedger(db, bookId, { ...valid, openingBalance: '2500.50', drCr: 'Cr' });
    expect(l.opBal).toBe('2500.50');
    expect(l.drCr).toBe('Cr');
  });

  test('rejects a duplicate ledger name', async () => {
    await createLedger(db, bookId, valid);
    await rejects(createLedger(db, bookId, valid), 'Name is Already Exists..');
  });

  test('requires name, city, state, under group and pincode', async () => {
    await rejects(createLedger(db, bookId, { ...valid, name: '' }), 'Name is required');
    await rejects(createLedger(db, bookId, { ...valid, city: '' }), 'City is required');
    await rejects(createLedger(db, bookId, { ...valid, state: '' }), 'State is required');
    await rejects(createLedger(db, bookId, { ...valid, under: undefined }), 'Required');
    await rejects(createLedger(db, bookId, { ...valid, pincode: '' }), 'Pincode is required');
    await rejects(
      createLedger(db, bookId, { ...valid, pincode: '12345' }),
      'Pincode must be 6 digits',
    );
  });
});

describe('updateLedger', () => {
  test('renames, re-groups, and keeps its code', async () => {
    const l = await createLedger(db, bookId, valid);
    const updated = await updateLedger(db, bookId, l.accCode, {
      ...valid,
      name: 'Office Cash',
      under: 'A003', // Cash-in-Hand
    });
    expect(updated.accCode).toBe(l.accCode);
    expect(updated.accName).toBe('Office Cash');
    expect(updated.grpCode).toBe('A003');
  });

  test('rejects a rename onto an existing ledger name', async () => {
    await createLedger(db, bookId, valid);
    const other = await createLedger(db, bookId, { ...valid, name: 'Temp' });
    await rejects(
      updateLedger(db, bookId, other.accCode, { ...valid, name: 'Petty Cash' }),
      'Name is Already Exists..',
    );
  });
});

describe('deleteLedger', () => {
  test('removes outright when no voucher uses it', async () => {
    const l = await createLedger(db, bookId, valid);
    await deleteLedger(db, bookId, l.accCode);
    expect((await listLedgers(db, bookId)).map((r) => r.accCode)).not.toContain(l.accCode);
  });
});

describe('listLedgers', () => {
  test('joins the group name in, ordered by ledger name', async () => {
    await createLedger(db, bookId, { ...valid, name: 'Zed Traders' });
    await createLedger(db, bookId, { ...valid, name: 'Alpha Traders' });
    // Only the two made here; a new book also has MDA's system ledgers (TAX…, SAL001, PUR001).
    const rows = (await listLedgers(db, bookId)).filter((r) => r.accCode.startsWith('AC'));
    expect(rows.map((r) => r.accName)).toEqual(['Alpha Traders', 'Zed Traders']);
    expect(rows[0]!.grpName).toBe('Current Assets');
  });
});
