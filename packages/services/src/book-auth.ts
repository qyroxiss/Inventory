// Book login: MDA's own login, unchanged. Port of MDA-Inventory lib/auth_page.dart:107-232.

import {
  financialYearLabel,
  hashPassword,
  isLegacyPassword,
  loginFieldErrors,
  loginMessages,
  newPasswordErrors,
  verifyPassword,
} from '@qi/core';
import { and, eq, schema, type Db } from '@qi/db';
import { getCompany } from './companies.ts';
import { UserError, assertNoFieldErrors } from './errors.ts';
import { getYear } from './years.ts';

const { bookUsers } = schema;

/** What MDA keeps in DbService after a successful login. */
export type BookSession = {
  bookId: string;
  yearId: string;
  companyId: string;
  userCode: string;
  userName: string;
  role: string;
  mustChangePassword: boolean;
  companyName: string;
  companyStateCode: string;
  yearName: string;
  fyFrom: string;
  fyTo: string;
  financialYearLabel: string;
};

export async function bookLogin(
  db: Db,
  accountId: string,
  input: { yearId: string; username: string; password: string },
): Promise<BookSession> {
  assertNoFieldErrors(loginFieldErrors(input));
  const year = await getYear(db, accountId, input.yearId);
  if (!year) throw new UserError(loginMessages.invalid);
  const company = (await getCompany(db, accountId, year.companyId))!;

  // Fetch by username only — the stored value is a salted hash (auth_page.dart:184-191).
  const [row] = await db
    .select()
    .from(bookUsers)
    .where(
      and(
        eq(bookUsers.bookId, year.bookId),
        eq(bookUsers.userName, input.username.trim()),
        eq(bookUsers.isActive, true),
      ),
    )
    .limit(1);
  if (!row || !(await verifyPassword(input.password, row.password))) {
    throw new UserError(loginMessages.invalid);
  }

  // Rows from before hashing hold plain text; upgrade now that the password is known.
  if (isLegacyPassword(row.password)) {
    await db
      .update(bookUsers)
      .set({ password: await hashPassword(input.password) })
      .where(eq(bookUsers.id, row.id));
  }

  // Company state code: stored value, else the GSTIN prefix (db_service.dart:106-123).
  const stored = (company.stateCode ?? '').trim();
  const gstin = (company.gstin ?? '').trim();

  return {
    bookId: year.bookId,
    yearId: year.id,
    companyId: company.id,
    userCode: row.userCode,
    userName: row.userName,
    role: row.role ?? 'User',
    mustChangePassword: row.mustChangePassword,
    companyName: company.compName,
    companyStateCode: stored || (gstin.length >= 2 ? gstin.substring(0, 2) : ''),
    yearName: year.yearName,
    fyFrom: year.fromDate,
    fyTo: year.toDate,
    financialYearLabel: financialYearLabel(year.yearName, year.fromDate, year.toDate),
  };
}

/** The forced password change (auth_page.dart:107-177). Clears the must-change flag. */
export async function changeBookPassword(
  db: Db,
  session: Pick<BookSession, 'bookId' | 'userCode'>,
  input: { newPassword: string; confirmPassword: string },
): Promise<void> {
  assertNoFieldErrors(newPasswordErrors(input));
  await db
    .update(bookUsers)
    .set({ password: await hashPassword(input.newPassword), mustChangePassword: false })
    .where(and(eq(bookUsers.bookId, session.bookId), eq(bookUsers.userCode, session.userCode)));
}
