import { beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { saleTypeMessages, stockItemMessages, stockSubGroupMessages } from '@qi/core';
import { openDatabase, sql, type Db } from '@qi/db';
import {
  UserError,
  createCompany,
  createSaleType,
  createStockGroup,
  createStockItem,
  createStockSubGroup,
  createYear,
  listSaleTypes,
  listStockItems,
  listStockSubGroups,
  removeSaleType,
  removeStockGroup,
  removeStockItem,
  removeStockSubGroup,
  updateSaleType,
  updateStockItem,
  updateStockSubGroup,
} from '../src/index.ts';

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

const rejects = async (p: Promise<unknown>, message: string) => {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(UserError);
  expect((err as UserError).message).toBe(message);
};

describe('Stock Sub Group', () => {
  test('SSG codes, Under required, group name joined in, duplicates refused', async () => {
    await createStockGroup(db, bookId, { name: 'Grocery' });
    await rejects(
      createStockSubGroup(db, bookId, { name: '' }),
      stockSubGroupMessages.nameRequired,
    );
    await rejects(
      createStockSubGroup(db, bookId, { name: 'Chips' }),
      stockSubGroupMessages.underRequired,
    );
    expect(await createStockSubGroup(db, bookId, { name: ' Chips ', under: 'SG0001' })).toEqual({
      code: 'SSG0001',
      name: 'Chips',
    });
    await createStockSubGroup(db, bookId, { name: 'Biscuits', under: 'SG0001' });
    await rejects(
      createStockSubGroup(db, bookId, { name: 'Chips', under: 'SG0001' }),
      stockSubGroupMessages.duplicate,
    );
    await rejects(
      updateStockSubGroup(db, bookId, 'SSG0002', { name: 'Chips', under: 'SG0001' }),
      stockSubGroupMessages.duplicate,
    );
    expect(await listStockSubGroups(db, bookId)).toEqual([
      { code: 'SSG0002', name: 'Biscuits', under: 'SG0001', underName: 'Grocery' },
      { code: 'SSG0001', name: 'Chips', under: 'SG0001', underName: 'Grocery' },
    ]);
  });

  test('a removed group leaves its sub groups pointing at nothing (Q-40)', async () => {
    await createStockGroup(db, bookId, { name: 'Grocery' });
    await createStockSubGroup(db, bookId, { name: 'Chips', under: 'SG0001' });
    await removeStockGroup(db, bookId, 'SG0001');
    expect(await listStockSubGroups(db, bookId)).toEqual([
      { code: 'SSG0001', name: 'Chips', under: 'SG0001', underName: '' },
    ]);
    await removeStockSubGroup(db, bookId, 'SSG0001');
    expect(await listStockSubGroups(db, bookId)).toEqual([]);
  });
});

describe('Sale Type Master', () => {
  test('ST codes, prefix upper-cased, Sale By required, duplicates refused', async () => {
    await rejects(
      createSaleType(db, bookId, { name: ' ', saleBy: 'Counter' }),
      saleTypeMessages.nameRequiredService,
    );
    await rejects(
      createSaleType(db, bookId, { name: 'Cash Sale' }),
      saleTypeMessages.saleByRequiredService,
    );
    expect(
      await createSaleType(db, bookId, { name: 'CASH SALE', prefix: ' cs ', saleBy: 'counter ' }),
    ).toEqual({ code: 'ST001', name: 'CASH SALE', prefix: 'CS', saleBy: 'counter' });
    await createSaleType(db, bookId, { name: 'GST SALE', prefix: 'GS', saleBy: 'SALE' });
    await rejects(
      createSaleType(db, bookId, { name: 'GST SALE', saleBy: 'x' }),
      saleTypeMessages.duplicate('GST SALE'),
    );
    await rejects(
      updateSaleType(db, bookId, 'ST001', { name: 'GST SALE', saleBy: 'x' }),
      saleTypeMessages.duplicate('GST SALE'),
    );
    await updateSaleType(db, bookId, 'ST001', {
      name: 'Counter Sale',
      prefix: 'cs-',
      saleBy: 'Counter',
    });
    expect(await listSaleTypes(db, bookId)).toEqual([
      { code: 'ST001', name: 'Counter Sale', prefix: 'CS-', saleBy: 'Counter' },
      { code: 'ST002', name: 'GST SALE', prefix: 'GS', saleBy: 'SALE' },
    ]);
    await removeSaleType(db, bookId, 'ST002');
    expect((await listSaleTypes(db, bookId)).map((s) => s.code)).toEqual(['ST001']);
  });
});

describe('Stock Item', () => {
  test('save: typed code, sub group name joined in; duplicate code, then name', async () => {
    await createStockGroup(db, bookId, { name: 'Grocery' });
    await createStockSubGroup(db, bookId, { name: 'Chips', under: 'SG0001' });
    await rejects(createStockItem(db, bookId, { code: '', name: 'x' }), stockItemMessages.required);
    expect(
      await createStockItem(db, bookId, {
        code: ' U001 ',
        name: ' UNCLE CHIPPS ',
        printName: 'UNCLE CHIPPS',
        subGrpCode: 'SSG0001',
        unit: 'Pcs',
        regType: 'Taxable',
        gstRate: '18%',
        hsn: '2005',
      }),
    ).toEqual({ code: 'U001', name: 'UNCLE CHIPPS' });
    await rejects(
      createStockItem(db, bookId, { code: 'U001', name: 'Other' }),
      stockItemMessages.duplicateCode('U001'),
    );
    await rejects(
      createStockItem(db, bookId, { code: 'A1', name: 'UNCLE CHIPPS' }),
      stockItemMessages.duplicateName,
    );
    await createStockItem(db, bookId, {
      code: 'A1',
      name: 'CHIPPS',
      unit: 'Pcs',
      regType: 'Exempt',
    });
    expect(await listStockItems(db, bookId)).toEqual([
      { code: 'A1', name: 'CHIPPS', printName: '', subGrpCode: '', subGrpName: '', unit: 'Pcs', regType: 'Exempt', gstRate: '', hsn: '', purRate: 0, saleRate: 0 },
      { code: 'U001', name: 'UNCLE CHIPPS', printName: 'UNCLE CHIPPS', subGrpCode: 'SSG0001', subGrpName: 'Chips', unit: 'Pcs', regType: 'Taxable', gstRate: '18%', hsn: '2005', purRate: 0, saleRate: 0 },
    ]); // prettier-ignore
  });

  test('Purchase Rate and Sale Rate: saved, checked, and kept when an update leaves them out', async () => {
    await createStockItem(db, bookId, { code: 'A1', name: 'CHIPPS', purRate: '80', saleRate: '120.5' });
    expect(await listStockItems(db, bookId)).toMatchObject([{ purRate: 80, saleRate: 120.5 }]);
    const err = await createStockItem(db, bookId, { code: 'A2', name: 'X', purRate: '-1', saleRate: '1.234' })
      .catch((e: unknown) => e as UserError);
    expect((err as UserError).fieldErrors).toEqual({
      purRate: stockItemMessages.invalidRate,
      saleRate: stockItemMessages.invalidRate,
    });
    // An update without the rates (an older client, or an MDA import's rates) keeps them.
    await updateStockItem(db, bookId, 'A1', { code: 'A1', name: 'CHIPPS', unit: 'Kg' });
    expect(await listStockItems(db, bookId)).toMatchObject([{ purRate: 80, saleRate: 120.5 }]);
    // A blank box clears the rate.
    await updateStockItem(db, bookId, 'A1', { code: 'A1', name: 'CHIPPS', purRate: '', saleRate: '99' });
    expect(await listStockItems(db, bookId)).toMatchObject([{ purRate: 0, saleRate: 99 }]);
  }); // prettier-ignore

  test('update keeps the code, checks the name against the others only; remove', async () => {
    await createStockItem(db, bookId, { code: 'A1', name: 'CHIPPS' });
    await createStockItem(db, bookId, { code: 'A2', name: 'NAMKEEN' });
    await rejects(
      updateStockItem(db, bookId, 'A2', { code: 'A2', name: 'CHIPPS' }),
      stockItemMessages.duplicateName,
    );
    expect(
      await updateStockItem(db, bookId, 'A2', { code: 'ZZ', name: 'NAMKEEN', unit: 'Kg' }),
    ).toEqual({
      code: 'A2',
      name: 'NAMKEEN',
    });
    expect((await listStockItems(db, bookId)).find((i) => i.code === 'A2')?.unit).toBe('Kg');
    await removeStockItem(db, bookId, 'A1');
    expect((await listStockItems(db, bookId)).map((i) => i.code)).toEqual(['A2']);
  });
});
