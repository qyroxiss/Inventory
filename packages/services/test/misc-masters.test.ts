import { beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { miscMasterMessages } from '@qi/core';
import { openDatabase, schema, sql, eq, type Db } from '@qi/db';
import {
  UserError,
  createCompany,
  createLedger,
  createMiscMaster,
  createStockItem,
  createYear,
  listLedgers,
  listMiscMaster,
  removeMiscMaster,
  updateLedger,
  updateMiscMaster,
} from '../src/index.ts';

const unitMessages = miscMasterMessages('unit');
const createUnit = (db: Db, bookId: string, input: { name: string; mobile?: string }) =>
  createMiscMaster(db, bookId, 'unit', input);
const listUnits = (db: Db, bookId: string) => listMiscMaster(db, bookId, 'unit');
const updateUnit = (db: Db, bookId: string, code: string, input: { name: string }) =>
  updateMiscMaster(db, bookId, 'unit', code, input);
const removeUnit = (db: Db, bookId: string, code: string) =>
  removeMiscMaster(db, bookId, 'unit', code);

const ACC = 'acc-1';
let db: Db;
let bookId: string;

beforeAll(async () => {
  ({ db } = await openDatabase());
});
beforeEach(async () => {
  await db.execute(
    sql`TRUNCATE audit_log, stock_items, misc_list, ledgers, book_users, account_groups, financial_years, books, companies RESTART IDENTITY CASCADE`,
  );
  const company = await createCompany(db, ACC, { compName: 'Sharma Traders' }, 1000);
  const year = await createYear(db, ACC, company.id, {
    yearName: '2026-2027',
    fromDate: '01/04/2026',
    toDate: '31/03/2027',
  });
  bookId = year.bookId;
});

const caught = (p: Promise<unknown>) =>
  p.then(
    () => null,
    (e: unknown) => e,
  );
const rejects = async (p: Promise<unknown>, message: string) => {
  const err = await caught(p);
  expect(err).toBeInstanceOf(UserError);
  expect((err as UserError).message).toBe(message);
};

const pnameOf = async (code: string) =>
  (await db.select().from(schema.miscList).where(eq(schema.miscList.miscCode, code)))[0]?.miscPname;

describe('Unit Master', () => {
  test("a new book starts with MDA's 18 units, listed by name", async () => {
    const units = await listUnits(db, bookId);
    expect(units).toHaveLength(18);
    expect(units[0]).toEqual({ code: 'UN015', name: 'Bag', mobile: null });
    expect(await pnameOf('UN001')).toBe('Numbers');
  });

  test('save: next code after the highest, name trimmed, long name = name', async () => {
    expect(await createUnit(db, bookId, { name: '  Tin  ' })).toEqual({
      code: 'UN019',
      name: 'Tin',
      mobile: null,
    });
    expect(await pnameOf('UN019')).toBe('Tin');
    await removeUnit(db, bookId, 'UN005');
    // Highest + 1, not count + 1, so a delete never makes a code repeat.
    expect((await createUnit(db, bookId, { name: 'Can' })).code).toBe('UN020');
  });

  test('save: required, and a duplicate is refused whatever its case', async () => {
    await rejects(createUnit(db, bookId, { name: '  ' }), unitMessages.nameRequired);
    await rejects(createUnit(db, bookId, { name: 'Nos' }), unitMessages.duplicateOnSave);
    await rejects(createUnit(db, bookId, { name: 'NOS' }), unitMessages.duplicateOnSave);
  });

  test('update: renames by code, keeps the long name, and refuses a duplicate', async () => {
    expect(await updateUnit(db, bookId, 'UN001', { name: 'Number' })).toEqual({
      code: 'UN001',
      name: 'Number',
      mobile: null,
    });
    expect(await pnameOf('UN001')).toBe('Numbers');
    await rejects(updateUnit(db, bookId, 'UN002', { name: 'kgs' }), unitMessages.duplicateOnSave);
    // Its own name in another case is fine.
    expect((await updateUnit(db, bookId, 'UN002', { name: 'PCS' })).name).toBe('PCS');
    await rejects(updateUnit(db, bookId, 'UN002', { name: '' }), unitMessages.nameRequired);
  });

  test('remove, but not while a stock item uses it', async () => {
    await removeUnit(db, bookId, 'UN018');
    expect((await listUnits(db, bookId)).map((u) => u.code)).not.toContain('UN018');
    await createStockItem(db, bookId, {
      code: 'IT01',
      name: 'Rice',
      unit: 'Kgs',
      regType: 'Taxable',
      gstRate: '5%',
    });
    await rejects(removeUnit(db, bookId, 'UN003'), unitMessages.inUse('Kgs', 1));
  });
});

describe('Godown', () => {
  test('a new book has no godowns; codes are GD + 3 digits; its own messages', async () => {
    expect(await listMiscMaster(db, bookId, 'godown')).toEqual([]);
    expect(await createMiscMaster(db, bookId, 'godown', { name: 'Main GoDown' })).toEqual({
      code: 'GD001',
      name: 'Main GoDown',
      mobile: null,
    });
    await rejects(
      createMiscMaster(db, bookId, 'godown', { name: 'Main GoDown' }),
      'Godown Name Already Exists..',
    );
    await rejects(createMiscMaster(db, bookId, 'godown', { name: '' }), 'Godown name is required');
    // A unit called the same is fine: each kind is its own list.
    expect((await createMiscMaster(db, bookId, 'unit', { name: 'Main GoDown' })).code).toBe(
      'UN019',
    );
  });

  test('update and remove stay within godowns', async () => {
    await createMiscMaster(db, bookId, 'godown', { name: 'Shop' });
    await updateMiscMaster(db, bookId, 'godown', 'GD001', { name: 'Back Store' });
    await removeMiscMaster(db, bookId, 'godown', 'UN001'); // a unit code: nothing happens
    expect(await listMiscMaster(db, bookId, 'godown')).toEqual([
      { code: 'GD001', name: 'Back Store', mobile: null },
    ]);
    expect(await listUnits(db, bookId)).toHaveLength(18);
    await removeMiscMaster(db, bookId, 'godown', 'GD001');
    expect(await listMiscMaster(db, bookId, 'godown')).toEqual([]);
  });
});

describe('Sales Executive (added 2026-11-14)', () => {
  const debtors = async () =>
    (
      await db.select().from(schema.accountGroups).where(eq(schema.accountGroups.bookId, bookId))
    ).find((g) => g.grpName === 'Sundry Debtors')!.grpCode;
  const party = (under: string, extra: Record<string, unknown> = {}) => ({
    name: 'Gupta Stationers',
    city: 'Lucknow',
    state: 'Uttar Pradesh',
    pincode: '226001',
    under,
    ...extra,
  });

  test('keeps a name and mobile; SE codes; a bad mobile is refused', async () => {
    const se = await createMiscMaster(db, bookId, 'salesExec', {
      name: 'Rakesh',
      mobile: '+91 9876543210',
    });
    expect(se).toEqual({ code: 'SE001', name: 'Rakesh', mobile: '+91 9876543210' });
    const err = await caught(
      createMiscMaster(db, bookId, 'salesExec', { name: 'X', mobile: '+91 12' }),
    );
    expect(err).toBeInstanceOf(UserError);
    expect((err as UserError).fieldErrors?.mobile).toBeTruthy();
    // Units never keep a mobile.
    expect((await createUnit(db, bookId, { name: 'Tin', mobile: '+91 9876543210' })).mobile).toBe(
      null,
    );
  });

  test('a ledger saves its Sales Executive, Country, Aadhar, Reg. Type and Status', async () => {
    const under = await debtors();
    const se = await createMiscMaster(db, bookId, 'salesExec', { name: 'Rakesh' });
    const l = await createLedger(
      db,
      bookId,
      party(under, {
        salesExec: se.code,
        aadhar: '1234 5678 9012',
        regType: 'Composition',
        country: 'India',
      }),
    );
    expect(l).toMatchObject({
      salesExec: 'SE001',
      aadhar: '123456789012',
      regType: 'Composition',
      country: 'India',
      isActive: true,
    });
    await updateLedger(
      db,
      bookId,
      l.accCode,
      party(under, { salesExec: se.code, isActive: false }),
    );
    const back = (await listLedgers(db, bookId)).find((x) => x.accCode === l.accCode);
    expect(back).toMatchObject({ isActive: false, salesExec: 'SE001', aadhar: null });
    // In use by a ledger: can't be removed.
    await rejects(
      removeMiscMaster(db, bookId, 'salesExec', 'SE001'),
      miscMasterMessages('salesExec').inUse('Rakesh', 1),
    );
  });

  test('Aadhar must be 12 digits; a pincode abroad can be any code', async () => {
    const under = await debtors();
    const err = await caught(createLedger(db, bookId, party(under, { aadhar: '1234' })));
    expect((err as UserError).fieldErrors?.aadhar).toBe('Aadhar No. must be 12 digits');
    const abroad = await createLedger(
      db,
      bookId,
      party(under, { name: 'Dubai Traders', country: 'Others', pincode: 'DXB-01' }),
    );
    expect(abroad.pinCode).toBe('DXB-01');
  });
});
