import { beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { openDatabase, sql, type Db } from '@qi/db';
import { addMiscIfNew, createCompany, createYear, listMisc } from '../src/index.ts';

const ACC = 'acc-1';
let db: Db;
let bookId: string;

beforeAll(async () => {
  ({ db } = await openDatabase());
});
beforeEach(async () => {
  await db.execute(
    sql`TRUNCATE audit_log, misc_list, book_users, account_groups, financial_years, books, companies RESTART IDENTITY CASCADE`,
  );
  const company = await createCompany(db, ACC, { compName: 'Sharma Traders' }, 1000);
  const year = await createYear(db, ACC, company.id, {
    yearName: '2026-2027',
    fromDate: '01/04/2026',
    toDate: '31/03/2027',
  });
  bookId = year.bookId;
});

describe('addMiscIfNew', () => {
  test('adds a new name and returns it as typed', async () => {
    const stored = await addMiscIfNew(db, bookId, 'City', 'CT', 'Pune');
    expect(stored).toBe('Pune');
    expect(await listMisc(db, bookId, 'City')).toEqual(['Pune']);
  });

  test('an existing entry wins, case-insensitively — no duplicate is created', async () => {
    await addMiscIfNew(db, bookId, 'City', 'CT', 'Pune');
    const stored = await addMiscIfNew(db, bookId, 'City', 'CT', 'pune');
    expect(stored).toBe('Pune');
    expect(await listMisc(db, bookId, 'City')).toEqual(['Pune']);
  });

  test('keeps separate lists per type', async () => {
    await addMiscIfNew(db, bookId, 'City', 'CT', 'Pune');
    expect(await listMisc(db, bookId, 'Unit')).not.toContain('Pune');
    expect(await listMisc(db, bookId, 'City')).toEqual(['Pune']);
  });

  test('empty input adds nothing', async () => {
    expect(await addMiscIfNew(db, bookId, 'City', 'CT', '  ')).toBe('');
    expect(await listMisc(db, bookId, 'City')).toEqual([]);
  });
});
