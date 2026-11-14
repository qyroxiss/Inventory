// Book login: MDA's own login, unchanged. Port of MDA-Inventory lib/auth_page.dart:107-232.

import {
  LOGIN_LOCK_MINUTES,
  LOGIN_MAX_TRIES,
  financialYearLabel,
  hashPassword,
  isLegacyPassword,
  loginFieldErrors,
  loginMessages,
  newPasswordErrors,
  partyStateCode,
  verifyPassword,
} from '@qi/core';
import { and, eq, schema, type Db } from '@qi/db';
import { getCompany } from './companies.ts';
import { UserError, assertNoFieldErrors } from './errors.ts';
import { ensureBookSeeds } from './vouchers.ts';
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

// Wrong passwords per book and user name (2026-11-14; MDA allowed unlimited tries: Q-04).
// Kept in memory: a restart clears them, which only ever lets someone in sooner.
const failures = new Map<string, { count: number; lockedUntil: number }>();
const failKey = (bookId: string, userName: string) => `${bookId}|${userName.trim().toLowerCase()}`;

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
  const key = failKey(year.bookId, input.username);
  const f = failures.get(key);
  if (f && f.lockedUntil > Date.now())
    throw new UserError(loginMessages.locked(Math.ceil((f.lockedUntil - Date.now()) / 60_000)));
  if (!row || !(await verifyPassword(input.password, row.password))) {
    const count = (f && f.lockedUntil <= Date.now() && f.lockedUntil > 0 ? 0 : (f?.count ?? 0)) + 1;
    const locked = count >= LOGIN_MAX_TRIES;
    failures.set(key, {
      count: locked ? 0 : count,
      lockedUntil: locked ? Date.now() + LOGIN_LOCK_MINUTES * 60_000 : 0,
    });
    await db.insert(schema.auditLog).values({
      bookId: year.bookId,
      userName: input.username.trim(),
      action: 'LOGIN FAILED',
      tableName: 'User',
      recordKey: input.username.trim(),
      details: locked ? `Locked for ${LOGIN_LOCK_MINUTES} minutes` : `Wrong password (${count})`,
    });
    if (locked) throw new UserError(loginMessages.locked(LOGIN_LOCK_MINUTES));
    throw new UserError(loginMessages.invalid);
  }
  failures.delete(key);

  // Rows from before hashing hold plain text; upgrade now that the password is known.
  if (isLegacyPassword(row.password)) {
    await db
      .update(bookUsers)
      .set({ password: await hashPassword(input.password) })
      .where(eq(bookUsers.id, row.id));
  }

  // Books made before vouchers existed get their series and system ledgers now (MDA's upgrade
  // step when an older year file is opened, db_service.dart:300-306). Nothing changes if present.
  await ensureBookSeeds(db, year.bookId);

  return {
    bookId: year.bookId,
    yearId: year.id,
    companyId: company.id,
    userCode: row.userCode,
    userName: row.userName,
    role: row.role ?? 'User',
    mustChangePassword: row.mustChangePassword,
    companyName: company.compName,
    // Company state: its State field, else the stored code, else the GSTIN prefix
    // (db_service.dart:106-123 used only the last two).
    companyStateCode: partyStateCode(company.stateCode, company.gstin, company.state),
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

/**
 * The signed-in user as the database has them now (added 2026-11-12). The book cookie is signed
 * but never expires, so every request checks it: the user must still exist and be active, and
 * the year and company must still be there under this account. Role, name and the forced
 * password change come from here, never from the cookie. Null means signed out.
 */
export async function liveBookUser(
  db: Db,
  accountId: string,
  session: Pick<BookSession, 'bookId' | 'yearId' | 'userCode'>,
): Promise<{ role: string; userName: string; mustChangePassword: boolean } | null> {
  const { companies, financialYears } = schema;
  const [row] = await db
    .select({
      role: bookUsers.role,
      userName: bookUsers.userName,
      mustChangePassword: bookUsers.mustChangePassword,
    })
    .from(bookUsers)
    .innerJoin(
      financialYears,
      and(eq(financialYears.id, session.yearId), eq(financialYears.bookId, bookUsers.bookId)),
    )
    .innerJoin(
      companies,
      and(eq(companies.id, financialYears.companyId), eq(companies.accountId, accountId)),
    )
    .where(
      and(
        eq(bookUsers.bookId, session.bookId),
        eq(bookUsers.userCode, session.userCode),
        eq(bookUsers.isActive, true),
      ),
    )
    .limit(1);
  return row ?? null;
}
