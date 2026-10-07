// Tools (docs/design/TOOLS.md): User Management (user_management_page.dart), Company Settings'
// voucher numbering, and the Logs viewer. Backup and restore are in backup.ts.
//
// User Management as in MDA:
//   - Only an Admin can save, update or delete.
//   - A new user's role starts as 'User' (Q-02); the password is stored hashed.
//   - A blank password on update keeps the current one; a new one clears "must change".
//   - You can't delete yourself or the last active Admin. Update has neither check, and no
//     duplicate check beyond the database's own (Q-54).
//   - Every change is written to the audit log.

import {
  NEW_USER_ROLE,
  PURCHASE_BILL_SERIES,
  SALE_BILL_SERIES,
  hashPassword,
  isAdminRole,
  seriesMessages as sm,
  seriesProblem,
  userCode,
  userFieldErrors,
  userMessages as um,
} from '@qi/core';
import { and, asc, desc, eq, gte, lte, ne, schema, sql, type Db } from '@qi/db';
import { UserError, assertNoFieldErrors } from './errors.ts';
import { nextPurchaseBillNo } from './purchases.ts';
import { nextSaleBillNo } from './sales.ts';
import { nextVoucherNo } from './vouchers.ts';

const { auditLog, bookUsers, voucherSeries } = schema;

/** Who is acting, from the book session. */
export type Actor = { bookId: string; userName: string; role: string };

async function log(db: Db, a: Actor, action: string, table: string, key: string, details = '') {
  await db
    .insert(auditLog)
    .values({
      bookId: a.bookId,
      userName: a.userName,
      action,
      tableName: table,
      recordKey: key,
      details,
    });
}

const requireAdmin = (a: Actor, message: string = um.adminOnly) => {
  if (!isAdminRole(a.role)) throw new UserError(message);
};

// ── Users ──────────────────────────────────────────────────────────────────────

export type BookUserRow = { userCode: string; userName: string; role: string; isActive: boolean };

export async function listBookUsers(db: Db, bookId: string): Promise<BookUserRow[]> {
  return db
    .select({
      userCode: bookUsers.userCode,
      userName: bookUsers.userName,
      role: bookUsers.role,
      isActive: bookUsers.isActive,
    })
    .from(bookUsers)
    .where(eq(bookUsers.bookId, bookId))
    .orderBy(asc(bookUsers.userName));
}

export type UserInput = {
  userName: string;
  password: string;
  confirmPassword?: string;
  role?: string;
  isActive: boolean;
};

const isUnique = (err: unknown) =>
  /unique|duplicate/i.test(
    String((err as Error)?.message ?? err) + String((err as { cause?: unknown })?.cause ?? ''),
  );

export async function createBookUser(db: Db, a: Actor, input: UserInput): Promise<BookUserRow> {
  assertNoFieldErrors(userFieldErrors({ ...input, editing: false }));
  requireAdmin(a);
  const name = input.userName.trim();
  const role = input.role || NEW_USER_ROLE;
  const row = {
    bookId: a.bookId,
    userCode: userCode(name, Date.now()),
    userName: name,
    password: await hashPassword(input.password),
    role,
    isActive: input.isActive,
  };
  try {
    await db.insert(bookUsers).values(row);
  } catch (err) {
    if (isUnique(err)) throw new UserError(um.exists(name));
    throw err;
  }
  await log(db, a, 'CREATE', 'User', name, `Role ${role}`);
  return { userCode: row.userCode, userName: name, role, isActive: input.isActive };
}

export async function updateBookUser(
  db: Db,
  a: Actor,
  code: string,
  input: UserInput,
): Promise<BookUserRow> {
  assertNoFieldErrors(userFieldErrors({ ...input, editing: true }));
  requireAdmin(a);
  const name = input.userName.trim();
  const role = input.role || NEW_USER_ROLE;
  const data: Partial<typeof bookUsers.$inferInsert> = {
    userName: name,
    role,
    isActive: input.isActive,
  };
  if (input.password) {
    data.password = await hashPassword(input.password);
    data.mustChangePassword = false;
  }
  try {
    await db
      .update(bookUsers)
      .set(data)
      .where(and(eq(bookUsers.bookId, a.bookId), eq(bookUsers.userCode, code)));
  } catch (err) {
    // MDA shows the database's own error here.
    if (isUnique(err)) throw new UserError(`Error: ${um.exists(name)}`);
    throw err;
  }
  await log(db, a, 'UPDATE', 'User', name, `Role ${role}`);
  return { userCode: code, userName: name, role, isActive: input.isActive };
}

export async function deleteBookUser(db: Db, a: Actor, code: string): Promise<void> {
  requireAdmin(a);
  const [u] = await db
    .select()
    .from(bookUsers)
    .where(and(eq(bookUsers.bookId, a.bookId), eq(bookUsers.userCode, code)));
  if (!u) return;
  if (u.userName === a.userName) throw new UserError(um.notSelf);
  // Losing the last Admin would lock everyone out of user management.
  if (isAdminRole(u.role)) {
    const [r] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(bookUsers)
      .where(
        and(
          eq(bookUsers.bookId, a.bookId),
          sql`lower(${bookUsers.role}) = 'admin'`,
          eq(bookUsers.isActive, true),
        ),
      );
    if (Number(r?.n ?? 0) <= 1) throw new UserError(um.lastAdmin);
  }
  await db
    .delete(bookUsers)
    .where(and(eq(bookUsers.bookId, a.bookId), eq(bookUsers.userCode, code)));
  await log(db, a, 'DELETE', 'User', u.userName);
}

// ── Company Settings: voucher numbering ────────────────────────────────────────

export type SeriesRow = {
  vchrType: string;
  vchrName: string;
  prefix: string;
  width: number;
  lastNo: number;
  next: string;
};

const nextOf = (db: Db, bookId: string, type: string) =>
  type === PURCHASE_BILL_SERIES.type
    ? nextPurchaseBillNo(db, bookId)
    : type === SALE_BILL_SERIES.type
      ? nextSaleBillNo(db, bookId, null)
      : nextVoucherNo(db, bookId, type);

/** Every number series with the number it will give next. */
export async function listSeries(db: Db, bookId: string): Promise<SeriesRow[]> {
  const rows = await db
    .select()
    .from(voucherSeries)
    .where(eq(voucherSeries.bookId, bookId))
    .orderBy(asc(voucherSeries.id));
  return Promise.all(
    rows.map(async (r) => ({
      vchrType: r.vchrType,
      vchrName: r.vchrName ?? r.vchrType,
      prefix: r.prefix ?? '',
      width: r.width,
      lastNo: r.lastNo,
      next: await nextOf(db, bookId, r.vchrType),
    })),
  );
}

/** Changes a series' prefix and width (Admin only). Numbers already used keep their form; the
 *  next one is counted under the new prefix. */
export async function updateSeries(
  db: Db,
  a: Actor,
  type: string,
  input: { prefix: string; width: number },
): Promise<void> {
  requireAdmin(a, sm.adminOnly);
  const problem = seriesProblem(input.prefix, input.width);
  if (problem) throw new UserError(problem, { prefix: problem });
  const prefix = input.prefix.trim().toUpperCase();
  await db
    .update(voucherSeries)
    .set({ prefix, width: input.width })
    .where(and(eq(voucherSeries.bookId, a.bookId), eq(voucherSeries.vchrType, type)));
  await log(db, a, 'UPDATE', 'VchrSeries', type, `Prefix ${prefix}, width ${input.width}`);
}

// ── Logs ───────────────────────────────────────────────────────────────────────

export type LogRow = {
  id: number;
  logAt: string;
  userName: string;
  action: string;
  tableName: string;
  recordKey: string;
  details: string;
};

/** The audit log, newest first, for a period and optionally one user or action. */
export async function listAuditLog(
  db: Db,
  bookId: string,
  q: { from: string; to: string; user?: string; action?: string },
): Promise<LogRow[]> {
  // Days are counted in India time, as MDA writes its stamps.
  const day = sql`(${auditLog.logAt} at time zone 'Asia/Kolkata')::date`;
  const where = [eq(auditLog.bookId, bookId), gte(day, q.from), lte(day, q.to)];
  if (q.user) where.push(eq(auditLog.userName, q.user));
  if (q.action) where.push(eq(auditLog.action, q.action));
  const rows = await db
    .select()
    .from(auditLog)
    .where(and(...where))
    .orderBy(desc(auditLog.logAt), desc(auditLog.id))
    .limit(2000);
  return rows.map((r) => ({
    id: r.id,
    logAt: r.logAt.toISOString(),
    userName: r.userName ?? '',
    action: r.action ?? '',
    tableName: r.tableName ?? '',
    recordKey: r.recordKey ?? '',
    details: r.details ?? '',
  }));
}

/** The users and actions the log holds, for its filters. */
export async function auditLogFilters(db: Db, bookId: string) {
  const users = await db
    .selectDistinct({ v: auditLog.userName })
    .from(auditLog)
    .where(and(eq(auditLog.bookId, bookId), ne(auditLog.userName, '')));
  const actions = await db
    .selectDistinct({ v: auditLog.action })
    .from(auditLog)
    .where(eq(auditLog.bookId, bookId));
  const clean = (rows: { v: string | null }[]) =>
    rows
      .map((r) => r.v ?? '')
      .filter(Boolean)
      .sort();
  return { users: clean(users), actions: clean(actions) };
}
