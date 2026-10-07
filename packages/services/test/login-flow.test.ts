import { beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { contactMessages } from '@qi/core';
import { eq, openDatabase, schema, sql, type Db } from '@qi/db';
import {
  UserError,
  bookLogin,
  changeBookPassword,
  createCompany,
  createYear,
  deleteCompany,
  deleteYear,
  updateCompany,
  listBookIndex,
  listCompanies,
  listYears,
} from '../src/index.ts';

const ACC = 'acc-1';
let db: Db;

// One in-memory database per file (booting + migrating takes ~3 s); emptied before each test.
beforeAll(async () => {
  ({ db } = await openDatabase());
});
beforeEach(async () => {
  await db.execute(
    sql`TRUNCATE audit_log, book_users, financial_years, books, companies RESTART IDENTITY CASCADE`,
  );
});

const rejects = async (p: Promise<unknown>, message: string) => {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(UserError);
  expect((err as UserError).message).toBe(message);
};

async function companyWithYear() {
  const company = await createCompany(
    db,
    ACC,
    { compName: 'Sharma Traders', gstin: '27AAPFU0939F1ZV' },
    1000,
  );
  const year = await createYear(db, ACC, company.id, {
    yearName: '2026-2027',
    fromDate: '01/04/2026',
    toDate: '31/03/2027',
  });
  return { company, year };
}

describe('companies', () => {
  test('create stores MDA code, upper-cased statutory fields and GSTIN state code', async () => {
    const c = await createCompany(
      db,
      ACC,
      { compName: '  Sharma Traders ', gstin: '27aapfu0939f1zv' },
      42,
    );
    expect(c).toMatchObject({
      compCode: 'CSHARMA_42',
      compName: 'Sharma Traders',
      gstin: '27AAPFU0939F1ZV',
      stateCode: '27',
      state: 'Not Applicable',
      country: 'India',
      finYrFrom: '1-Apr-26',
    });
  });

  test('validation: name required, GSTIN checked when entered', async () => {
    await rejects(createCompany(db, ACC, { compName: ' ' }), 'Required');
    await rejects(
      createCompany(db, ACC, { compName: 'X', gstin: '27AAPFU0939F1ZX' }),
      'Invalid GSTIN check digit',
    );
  });

  test('contact and bank numbers are checked when entered, and saved as given', async () => {
    await rejects(
      createCompany(db, ACC, { compName: 'X', bankIfsc: 'SBIN1001234' }),
      contactMessages.ifsc,
    );
    await rejects(
      createCompany(db, ACC, { compName: 'X', mobile: '+91 12345' }),
      contactMessages.mobileIndia,
    );
    await rejects(
      createCompany(db, ACC, { compName: 'X', bankAcNo: '12AB' }),
      contactMessages.bankAcNo,
    );
    const c = await createCompany(db, ACC, {
      compName: 'X', phone: '022 2345 6789', mobile: '+971 501234567', fax: '022-2345-6790',
      cin: 'U12345MH2020PTC123456', bankAcNo: '123456789012', bankIfsc: 'sbin0001234',
    }); // prettier-ignore
    expect(c).toMatchObject({ mobile: '+971 501234567', bankIfsc: 'SBIN0001234' });
  });

  test('list is per account, ordered by name', async () => {
    await createCompany(db, ACC, { compName: 'Zeta' });
    await createCompany(db, ACC, { compName: 'Alpha' });
    await createCompany(db, 'other', { compName: 'Hidden' });
    expect((await listCompanies(db, ACC)).map((c) => c.compName)).toEqual(['Alpha', 'Zeta']);
  });
});

describe('company update and delete', () => {
  test('update rewrites the form fields, keeps the code, re-derives the state code', async () => {
    const c = await createCompany(db, ACC, { compName: 'Sharma', gstin: '27AAPFU0939F1ZV' }, 7);
    const u = await updateCompany(db, ACC, c.id, {
      compName: ' Sharma Traders ',
      state: 'Gujarat',
    });
    expect(u).toMatchObject({
      compCode: 'CSHARMA_7',
      compName: 'Sharma Traders',
      state: 'Gujarat',
      gstin: '',
      stateCode: '',
    });
    await rejects(updateCompany(db, ACC, c.id, { compName: '' }), 'Required');
    await rejects(updateCompany(db, 'other', c.id, { compName: 'X' }), 'No companies found');
  });

  test('delete removes the company and its years but keeps the books; other accounts cannot', async () => {
    const { company, year } = await companyWithYear();
    await deleteCompany(db, 'other', company.id);
    expect(await listCompanies(db, ACC)).toHaveLength(1);

    await deleteCompany(db, ACC, company.id);
    expect(await listCompanies(db, ACC)).toEqual([]);
    expect(await db.select().from(schema.financialYears)).toEqual([]);
    const books = await db.select().from(schema.books).where(eq(schema.books.id, year.bookId));
    expect(books).toHaveLength(1);
  });

  test('deleteYear removes only the year record, only for its own account', async () => {
    const { company, year } = await companyWithYear();
    await deleteYear(db, 'other', year.id);
    expect(await listYears(db, ACC, company.id)).toHaveLength(1);
    await deleteYear(db, ACC, year.id);
    expect(await listYears(db, ACC, company.id)).toEqual([]);
    expect(await db.select().from(schema.books)).toHaveLength(1);
  });
});

describe('book index', () => {
  test('every company of the account with its years, both in MDA order', async () => {
    const zeta = await createCompany(db, ACC, { compName: 'Zeta' });
    const alpha = await createCompany(db, ACC, { compName: 'Alpha' });
    await createCompany(db, 'other', { compName: 'Hidden' });
    for (const [c, y] of [
      [zeta, '2026-2027'],
      [zeta, '2025-2026'],
      [alpha, '2026-2027'],
    ] as const) {
      const a = Number(y.slice(0, 4));
      await createYear(db, ACC, c.id, {
        yearName: y,
        fromDate: `01/04/${a}`,
        toDate: `31/03/${a + 1}`,
      });
    }
    const index = await listBookIndex(db, ACC);
    expect(index.map((c) => [c.compName, c.years.map((y) => y.yearName)])).toEqual([
      ['Alpha', ['2026-2027']],
      ['Zeta', ['2025-2026', '2026-2027']],
    ]);
    expect(index[0]!.years[0]).toMatchObject({ fromDate: '2026-04-01', toDate: '2027-03-31' });
    expect(await listBookIndex(db, 'nobody')).toEqual([]);
  });
});

describe('financial years', () => {
  test('create parses dd/MM/yyyy and derives the year code', async () => {
    const { year } = await companyWithYear();
    expect(year).toMatchObject({
      yearCode: '2627',
      yearName: '2026-2027',
      fromDate: '2026-04-01',
      toDate: '2027-03-31',
    });
  });

  test('duplicate year message', async () => {
    const { company } = await companyWithYear();
    await rejects(
      createYear(db, ACC, company.id, {
        yearName: '2026-2027',
        fromDate: '01/04/2026',
        toDate: '31/03/2027',
      }),
      'Year "2026-2027" already exists for this company',
    );
  });

  test('form messages and unknown company', async () => {
    const { company } = await companyWithYear();
    await rejects(
      createYear(db, ACC, company.id, { yearName: '2026-27', fromDate: 'a', toDate: 'b' }),
      'Format: YYYY-YYYY',
    );
    await rejects(
      createYear(db, 'other', company.id, {
        yearName: '2027-2028',
        fromDate: '01/04/2027',
        toDate: '31/03/2028',
      }),
      'Please select a company first',
    );
  });

  test('each new book gets admin/admin with a forced change', async () => {
    const { year } = await companyWithYear();
    const users = await db
      .select()
      .from(schema.bookUsers)
      .where(eq(schema.bookUsers.bookId, year.bookId));
    expect(users).toHaveLength(1);
    expect(users[0]).toMatchObject({
      userCode: 'ADMIN001',
      userName: 'admin',
      role: 'Admin',
      mustChangePassword: true,
    });
    expect(users[0]!.password).toMatch(/^pbkdf2\$20000\$/);
  });

  test('deleting a year keeps its book; re-adding re-attaches without re-seeding (MDA keeps the .db file)', async () => {
    const { company, year } = await companyWithYear();
    await changeBookPassword(
      db,
      { bookId: year.bookId, userCode: 'ADMIN001' },
      { newPassword: 'secret1', confirmPassword: 'secret1' },
    );
    await db.delete(schema.financialYears).where(eq(schema.financialYears.id, year.id));
    expect(await listYears(db, ACC, company.id)).toEqual([]);

    const again = await createYear(db, ACC, company.id, {
      yearName: '2026-2027',
      fromDate: '01/04/2026',
      toDate: '31/03/2027',
    });
    expect(again.bookId).toBe(year.bookId);
    const s = await bookLogin(db, ACC, {
      yearId: again.id,
      username: 'admin',
      password: 'secret1',
    });
    expect(s.mustChangePassword).toBe(false);
  });
});

describe('book login (auth_page.dart)', () => {
  test('admin/admin logs in and must change password', async () => {
    const { year } = await companyWithYear();
    const s = await bookLogin(db, ACC, { yearId: year.id, username: ' admin ', password: 'admin' });
    expect(s).toMatchObject({
      userName: 'admin',
      role: 'Admin',
      mustChangePassword: true,
      companyName: 'Sharma Traders',
      companyStateCode: '27',
      financialYearLabel: '2026-2027 (01/04/2026 to 31/03/2027)',
    });
  });

  test('wrong password, unknown user, inactive user and blank fields', async () => {
    const { year } = await companyWithYear();
    await rejects(
      bookLogin(db, ACC, { yearId: year.id, username: 'admin', password: 'nope' }),
      'Invalid username or password',
    );
    await rejects(
      bookLogin(db, ACC, { yearId: year.id, username: 'ghost', password: 'admin' }),
      'Invalid username or password',
    );
    await rejects(
      bookLogin(db, ACC, { yearId: year.id, username: 'admin', password: ' admin' }),
      'Invalid username or password',
    );
    await rejects(bookLogin(db, ACC, { yearId: year.id, username: '', password: '' }), 'Required');
    await db.update(schema.bookUsers).set({ isActive: false });
    await rejects(
      bookLogin(db, ACC, { yearId: year.id, username: 'admin', password: 'admin' }),
      'Invalid username or password',
    );
  });

  test('user names are case-sensitive, as in MDA', async () => {
    const { year } = await companyWithYear();
    await rejects(
      bookLogin(db, ACC, { yearId: year.id, username: 'Admin', password: 'admin' }),
      'Invalid username or password',
    );
  });

  test('another account cannot log into this book', async () => {
    const { year } = await companyWithYear();
    await rejects(
      bookLogin(db, 'other', { yearId: year.id, username: 'admin', password: 'admin' }),
      'Invalid username or password',
    );
  });

  test('legacy plain-text password works once and is re-hashed', async () => {
    const { year } = await companyWithYear();
    await db.update(schema.bookUsers).set({ password: 'oldpass' });
    await bookLogin(db, ACC, { yearId: year.id, username: 'admin', password: 'oldpass' });
    const [u] = await db.select().from(schema.bookUsers);
    expect(u!.password).toMatch(/^pbkdf2\$/);
    await bookLogin(db, ACC, { yearId: year.id, username: 'admin', password: 'oldpass' });
  });

  test('forced change: rules, then the new password works and the old one does not', async () => {
    const { year } = await companyWithYear();
    const s = await bookLogin(db, ACC, { yearId: year.id, username: 'admin', password: 'admin' });
    await rejects(
      changeBookPassword(db, s, { newPassword: 'abc', confirmPassword: 'abc' }),
      'Use at least 6 characters',
    );
    await rejects(
      changeBookPassword(db, s, { newPassword: 'secret1', confirmPassword: 'x' }),
      'Passwords do not match',
    );
    await changeBookPassword(db, s, { newPassword: 'secret1', confirmPassword: 'secret1' });

    const again = await bookLogin(db, ACC, {
      yearId: year.id,
      username: 'admin',
      password: 'secret1',
    });
    expect(again.mustChangePassword).toBe(false);
    await rejects(
      bookLogin(db, ACC, { yearId: year.id, username: 'admin', password: 'admin' }),
      'Invalid username or password',
    );
  });
});
