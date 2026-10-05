import { beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { hashPassword } from '@qi/core';
import { openDatabase, schema, sql, eq, type Db } from '@qi/db';
import {
  UserError,
  bookLogin,
  importMda,
  listAllGroups,
  listBookIndex,
  listLedgers,
  type MdaImport,
} from '../src/index.ts';

const ACC = 'acc-1';
let db: Db;
let data: MdaImport;

beforeAll(async () => {
  ({ db } = await openDatabase());
});
beforeEach(async () => {
  await db.execute(
    sql`TRUNCATE audit_log, misc_list, ledgers, book_users, account_groups, financial_years, books, companies RESTART IDENTITY CASCADE`,
  );
  // Rows as MDA's SQLite files hold them (MDA column names, 0/1 booleans, REAL balances).
  data = {
    companies: [
      {
        company: {
          CompCode: 'CMDASOF_1786708384851',
          CompName: 'MDA Softwares Limited',
          Add1: '27,IInd Floor\nNaveen Market\nKanpur',
          State: 'Uttar Pradesh',
          Country: 'India',
          PinCode: '208001',
          FinYrFrom: '1-Apr-26',
          CreatedAt: '2026-08-14T17:23:04.851589',
        },
        years: [
          {
            year: {
              YearCode: '2627',
              YearName: '2026-2027',
              FromDate: '01/04/2026',
              ToDate: '31/03/2027',
              DbName: 'MDA_Inv2627',
            },
            book: {
              User: [
                {
                  UserCode: 'ADMIN001',
                  UserName: 'admin',
                  Password: await hashPassword('secret9'),
                  Role: 'Admin',
                  IsActive: 1,
                  MustChangePwd: 0,
                },
              ],
              Maacct2: [
                { GrpCode: 'A001', GrpName: 'Current Assets', GrpType: 'Assets', ParentGrp: 'Parent', IsLedger: 'No', SortOrder: 1, Clr: '1' },
                { GrpCode: 'A007', GrpName: 'Sundry Debtors', GrpType: 'Assets', ParentGrp: 'A001', IsLedger: 'No', SortOrder: 6, Clr: '1' },
                { GrpCode: 'E004', GrpName: 'Test', GrpType: 'Expenses', ParentGrp: 'Parent', IsLedger: 'No', SortOrder: null, Clr: null },
              ], // prettier-ignore
              Maacct: [
                { AccCode: 'AC0002', AccName: 'VISHALMOTORS', GrpCode: 'A007', OpBal: 1250.5, DrCr: 'Dr', City: 'Unnao', IsActive: 1, CreatedAt: '2026-08-15T09:56:43.947417' },
              ], // prettier-ignore
              Misc_Master: [
                { Misc_Code: 'UN001', Misc_Name: 'Nos', Misc_Pname: 'Numbers', Misc_Type: 'Unit' },
              ],
              AuditLog: [
                { LogId: 1, LogAt: '2026-08-14T20:40:50.897551', UserName: 'admin', Action: 'CREATE', TableName: 'PurcMaster', RecordKey: 'PB-0001', Details: 'Net 105000.00, 1 item(s)' },
              ], // prettier-ignore
            },
          },
        ],
      },
    ],
  };
});

describe('importMda', () => {
  test('copies the company, year and book, and MDA’s own password signs in', async () => {
    const result = await importMda(db, ACC, data);
    expect(result).toEqual({
      imported: [{ compName: 'MDA Softwares Limited', years: 1 }],
      skipped: [],
    });

    const [company] = await listBookIndex(db, ACC);
    expect(company!.compName).toBe('MDA Softwares Limited');
    const [stored] = await db.select().from(schema.companies);
    expect(stored).toMatchObject({
      compCode: 'CMDASOF_1786708384851',
      add1: '27,IInd Floor\nNaveen Market\nKanpur',
    });
    const year = company!.years[0]!;
    expect(year).toMatchObject({
      yearName: '2026-2027',
      fromDate: '2026-04-01',
      toDate: '2027-03-31',
    });

    const session = await bookLogin(db, ACC, {
      yearId: year.id,
      username: 'admin',
      password: 'secret9',
    });
    expect(session.mustChangePassword).toBe(false);

    // MDA's rows only — not our 28 default groups.
    expect((await listAllGroups(db, session.bookId)).map((g) => g.grpName)).toEqual([
      'Current Assets',
      'Sundry Debtors',
      'Test',
    ]);
    const [ledger] = await listLedgers(db, session.bookId);
    expect(ledger).toMatchObject({
      accCode: 'AC0002',
      accName: 'VISHALMOTORS',
      opBal: '1250.50',
      city: 'Unnao',
    });

    const [misc] = await db
      .select()
      .from(schema.miscList)
      .where(eq(schema.miscList.bookId, session.bookId));
    expect(misc).toMatchObject({
      miscCode: 'UN001',
      miscName: 'Nos',
      miscPname: 'Numbers',
      miscType: 'Unit',
    });
    const [log] = await db
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.bookId, session.bookId));
    expect(log!.logAt.toISOString()).toBe('2026-08-14T15:10:50.897Z'); // IST → UTC
  });

  test('a company already in the account is skipped, so importing twice changes nothing', async () => {
    await importMda(db, ACC, data);
    expect(await importMda(db, ACC, data)).toEqual({
      imported: [],
      skipped: ['MDA Softwares Limited'],
    });
    expect(await listBookIndex(db, ACC)).toHaveLength(1);
  });

  test('a year whose file is missing gets a fresh book, as MDA creates one', async () => {
    data.companies[0]!.years[0]!.book = null;
    await importMda(db, ACC, data);
    const year = (await listBookIndex(db, ACC))[0]!.years[0]!;
    const session = await bookLogin(db, ACC, {
      yearId: year.id,
      username: 'admin',
      password: 'admin',
    });
    expect(session.mustChangePassword).toBe(true);
    expect(await listAllGroups(db, session.bookId)).toHaveLength(28);
  });

  test('nothing to import', async () => {
    await expect(importMda(db, ACC, { companies: [] })).rejects.toThrow(UserError);
  });
});
