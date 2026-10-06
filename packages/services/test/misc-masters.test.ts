import { beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { miscMasterMessages } from '@qi/core';
import { openDatabase, schema, sql, eq, type Db } from '@qi/db';
import {
  UserError,
  createCompany,
  createMiscMaster,
  createYear,
  listMiscMaster,
  removeMiscMaster,
  updateMiscMaster,
} from '../src/index.ts';

const unitMessages = miscMasterMessages('unit');
const createUnit = (db: Db, bookId: string, input: { name: string }) =>
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
    sql`TRUNCATE audit_log, misc_list, ledgers, book_users, account_groups, financial_years, books, companies RESTART IDENTITY CASCADE`,
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

const pnameOf = async (code: string) =>
  (await db.select().from(schema.miscList).where(eq(schema.miscList.miscCode, code)))[0]?.miscPname;

describe('Unit Master', () => {
  test('a new book starts with MDA’s 18 units, listed by name', async () => {
    const units = await listUnits(db, bookId);
    expect(units).toHaveLength(18);
    expect(units[0]).toEqual({ code: 'UN015', name: 'Bag' });
    expect(await pnameOf('UN001')).toBe('Numbers');
  });

  test('save: next code after the highest, name trimmed, long name = name', async () => {
    expect(await createUnit(db, bookId, { name: '  Tin  ' })).toEqual({
      code: 'UN019',
      name: 'Tin',
    });
    expect(await pnameOf('UN019')).toBe('Tin');
    await removeUnit(db, bookId, 'UN005');
    // Highest + 1, not count + 1, so a delete never makes a code repeat.
    expect((await createUnit(db, bookId, { name: 'Can' })).code).toBe('UN020');
  });

  test('save: required, and an exact duplicate is refused — case-sensitively, as in MDA', async () => {
    await rejects(createUnit(db, bookId, { name: '  ' }), unitMessages.nameRequired);
    await rejects(createUnit(db, bookId, { name: 'Nos' }), unitMessages.duplicateOnSave);
    expect((await createUnit(db, bookId, { name: 'NOS' })).name).toBe('NOS');
  });

  test('update: renames by code, overwrites the long name, and allows duplicates (Q-37, Q-38)', async () => {
    expect(await updateUnit(db, bookId, 'UN001', { name: 'Number' })).toEqual({
      code: 'UN001',
      name: 'Number',
    });
    expect(await pnameOf('UN001')).toBe('Number');
    await updateUnit(db, bookId, 'UN002', { name: 'Kgs' });
    expect((await listUnits(db, bookId)).filter((u) => u.name === 'Kgs')).toHaveLength(2);
    await rejects(updateUnit(db, bookId, 'UN002', { name: '' }), unitMessages.nameRequired);
  });

  test('remove', async () => {
    await removeUnit(db, bookId, 'UN018');
    expect((await listUnits(db, bookId)).map((u) => u.code)).not.toContain('UN018');
  });
});

describe('Godown', () => {
  test('a new book has no godowns; codes are GD + 3 digits; its own messages', async () => {
    expect(await listMiscMaster(db, bookId, 'godown')).toEqual([]);
    expect(await createMiscMaster(db, bookId, 'godown', { name: 'Main GoDown' })).toEqual({
      code: 'GD001',
      name: 'Main GoDown',
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
      { code: 'GD001', name: 'Back Store' },
    ]);
    expect(await listUnits(db, bookId)).toHaveLength(18);
    await removeMiscMaster(db, bookId, 'godown', 'GD001');
    expect(await listMiscMaster(db, bookId, 'godown')).toEqual([]);
  });
});
