// Financial years. Port of MDA-Inventory lib/company_year_page.dart:111-163, plus the
// book creation MDA does when a year's .db file is first opened (db_service.dart:1023-1204).

import {
  SEED_ADMIN,
  hashPassword,
  parseDate,
  yearCode,
  yearFieldErrors,
  yearMessages,
} from '@qi/core';
import { and, asc, eq, schema, type Db } from '@qi/db';
import { getCompany } from './companies.ts';
import { UserError, assertNoFieldErrors } from './errors.ts';
import { seedDefaultGroups } from './groups.ts';

const { books, bookUsers, financialYears } = schema;

export type FinancialYear = typeof financialYears.$inferSelect;
export type YearInput = { yearName: string; fromDate: string; toDate: string };

/** Years of a company, ordered by name (company_setup_page.dart:63-64). */
export async function listYears(
  db: Db,
  accountId: string,
  companyId: string,
): Promise<FinancialYear[]> {
  if (!(await getCompany(db, accountId, companyId))) return [];
  return db
    .select()
    .from(financialYears)
    .where(eq(financialYears.companyId, companyId))
    .orderBy(asc(financialYears.yearName));
}

export async function getYear(
  db: Db,
  accountId: string,
  yearId: string,
): Promise<FinancialYear | null> {
  const [row] = await db.select().from(financialYears).where(eq(financialYears.id, yearId));
  if (!row || !(await getCompany(db, accountId, row.companyId))) return null;
  return row;
}

/**
 * Adds a year. Its book is created and seeded the first time; if a book for the same company
 * and year code survives from a deleted year, it is re-attached unchanged — MDA reopens the
 * existing .db file in that case.
 */
export async function createYear(
  db: Db,
  accountId: string,
  companyId: string,
  input: YearInput,
): Promise<FinancialYear> {
  const company = await getCompany(db, accountId, companyId);
  if (!company) throw new UserError(yearMessages.selectCompany);
  assertNoFieldErrors(yearFieldErrors(input));

  const yearName = input.yearName.trim();
  const code = yearCode(yearName);
  const fromDate = parseDate(input.fromDate);
  const toDate = parseDate(input.toDate);
  if (!fromDate) throw new UserError(yearMessages.required, { fromDate: yearMessages.required });
  if (!toDate) throw new UserError(yearMessages.required, { toDate: yearMessages.required });

  const adminPassword = await hashPassword(SEED_ADMIN.password);

  return db.transaction(async (tx) => {
    const [clash] = await tx
      .select({ id: financialYears.id })
      .from(financialYears)
      .where(and(eq(financialYears.companyId, companyId), eq(financialYears.yearCode, code)));
    if (clash) throw new UserError(yearMessages.exists(yearName));

    let [book] = await tx
      .select()
      .from(books)
      .where(and(eq(books.companyId, companyId), eq(books.yearCode, code)));
    if (!book) {
      [book] = await tx.insert(books).values({ companyId, yearCode: code }).returning();
      await seedBook(tx as unknown as Db, book!.id, adminPassword);
    }

    const [year] = await tx
      .insert(financialYears)
      .values({ companyId, bookId: book!.id, yearCode: code, yearName, fromDate, toDate })
      .returning();
    return year!;
  });
}

/**
 * Seeds a new book: the admin user and the 28 default groups. The rest MDA also seeds (units,
 * tax ledgers, states, tax rates, voucher series) are added here as their own tables land —
 * see docs/LOGIC-SPEC.md §3.
 */
async function seedBook(db: Db, bookId: string, adminPasswordHash: string): Promise<void> {
  await db.insert(bookUsers).values({
    bookId,
    userCode: SEED_ADMIN.userCode,
    userName: SEED_ADMIN.userName,
    password: adminPasswordHash,
    role: SEED_ADMIN.role,
    isActive: SEED_ADMIN.isActive,
    mustChangePassword: SEED_ADMIN.mustChangePassword,
  });
  await seedDefaultGroups(db, bookId);
}

/**
 * Delete Year: only the year record goes; its book stays, as MDA keeps the .db file
 * (company_year_page.dart:165-188). Adding the same year again re-attaches that book.
 */
export async function deleteYear(db: Db, accountId: string, yearId: string): Promise<void> {
  const year = await getYear(db, accountId, yearId);
  if (!year) return;
  await db.delete(financialYears).where(eq(financialYears.id, year.id));
}
