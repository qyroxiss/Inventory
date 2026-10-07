import { beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { stockGroupMessages as msg } from '@qi/core';
import { openDatabase, schema, sql, eq, type Db } from '@qi/db';
import {
  UserError,
  createCompany,
  createMiscMaster,
  createStockGroup,
  createYear,
  listMiscMaster,
  listStockGroups,
  removeStockGroup,
  updateStockGroup,
} from '../src/index.ts';

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

describe('Stock Group', () => {
  test('save: SG + 4 digits, fields trimmed, GST/HSN in Gen1/Gen2, dated', async () => {
    expect(await listStockGroups(db, bookId)).toEqual([]);
    expect(
      await createStockGroup(db, bookId, { name: ' Grocery ', gstRate: ' 5 ', hsn: 'G00001 ' }),
    ).toEqual({ code: 'SG0001', name: 'Grocery', gstRate: '5', hsn: 'G00001' });
    const [row] = await db
      .select()
      .from(schema.miscList)
      .where(eq(schema.miscList.miscCode, 'SG0001'));
    expect(row).toMatchObject({ miscType: 'StockGroup', miscGen1: '5', miscGen2: 'G00001' });
    expect(row!.miscDate).toBeTruthy();
    expect((await createStockGroup(db, bookId, { name: 'Dairy' })).code).toBe('SG0002');
    expect((await listStockGroups(db, bookId)).map((g) => g.name)).toEqual(['Dairy', 'Grocery']);
  });

  test('required, and duplicates refused on Save and on Update (case-sensitive)', async () => {
    await rejects(createStockGroup(db, bookId, { name: ' ' }), msg.nameRequired);
    await createStockGroup(db, bookId, { name: 'Grocery' });
    await createStockGroup(db, bookId, { name: 'Dairy' });
    await rejects(createStockGroup(db, bookId, { name: 'Grocery' }), msg.duplicate);
    expect((await createStockGroup(db, bookId, { name: 'GROCERY' })).code).toBe('SG0003');
    await rejects(updateStockGroup(db, bookId, 'SG0002', { name: 'Grocery' }), msg.duplicate);
    // Its own name is fine.
    expect(
      await updateStockGroup(db, bookId, 'SG0002', { name: 'Dairy', gstRate: '12%', hsn: '0401' }),
    ).toEqual({ code: 'SG0002', name: 'Dairy', gstRate: '12%', hsn: '0401' });
  });

  test('a unit of the same name does not clash; remove deletes only the group', async () => {
    await createMiscMaster(db, bookId, 'unit', { name: 'Grocery' });
    await createStockGroup(db, bookId, { name: 'Grocery' });
    await removeStockGroup(db, bookId, 'SG0001');
    expect(await listStockGroups(db, bookId)).toEqual([]);
    expect((await listMiscMaster(db, bookId, 'unit')).map((u) => u.name)).toContain('Grocery');
  });
});
