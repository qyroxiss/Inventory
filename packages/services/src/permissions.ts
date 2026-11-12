// Role Permissions (core permissions.ts): the Admin's page settings per role and per user, and
// what a signed-in user may do right now.
//
// A user's access is read from the database on every request, so a change by the Admin (or a
// new role for the user) applies straight away, without signing in again.

import {
  BUILT_IN_ROLES,
  PERMISSION_PAGES,
  cleanPageAccess,
  defaultPageAccess,
  isAdminRole,
  permissionMessages as pm,
  resolvePageAccess,
  roleNameProblem,
  type PageAccess,
} from '@qi/core';
import { and, asc, eq, schema, sql, type Db } from '@qi/db';
import { UserError } from './errors.ts';
import type { Actor } from './tools.ts';

const { auditLog, bookRoles, bookUsers } = schema;

const requireAdmin = (a: Actor) => {
  if (!isAdminRole(a.role)) throw new UserError(pm.adminOnly);
};

const log = (db: Db, a: Actor, action: string, table: string, key: string, details = '') =>
  db.insert(auditLog).values({
    bookId: a.bookId,
    userName: a.userName,
    action,
    tableName: table,
    recordKey: key,
    details,
  });

const isBuiltIn = (name: string) =>
  BUILT_IN_ROLES.some((r) => r.toLowerCase() === name.trim().toLowerCase());

/** The stored row of a role (names compared without case). */
async function roleRow(db: Db, bookId: string, name: string) {
  const [row] = await db
    .select()
    .from(bookRoles)
    .where(
      and(eq(bookRoles.bookId, bookId), sql`lower(${bookRoles.name}) = lower(${name.trim()})`),
    );
  return row ?? null;
}

const usersWithRole = async (db: Db, bookId: string, name: string) => {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(bookUsers)
    .where(
      and(eq(bookUsers.bookId, bookId), sql`lower(${bookUsers.role}) = lower(${name.trim()})`),
    );
  return Number(r?.n ?? 0);
};

// ── What a user may do ─────────────────────────────────────────────────────────

/** The signed-in user's level on every page, from their current role and settings. A user who
 *  no longer exists or was made inactive gets nothing. */
export async function accessFor(db: Db, bookId: string, userName: string): Promise<PageAccess> {
  const [u] = await db
    .select({
      role: bookUsers.role,
      pageAccess: bookUsers.pageAccess,
      isActive: bookUsers.isActive,
    })
    .from(bookUsers)
    .where(and(eq(bookUsers.bookId, bookId), eq(bookUsers.userName, userName)));
  if (!u || !u.isActive) return Object.fromEntries(PERMISSION_PAGES.map((p) => [p, 'hidden']));
  const role = await roleRow(db, bookId, u.role);
  return resolvePageAccess({ role: u.role, rolePages: role?.pageAccess, userPages: u.pageAccess });
}

// ── The Role Permissions page ──────────────────────────────────────────────────

export type RoleInfo = {
  name: string;
  /** MDA's four roles: can't be renamed or deleted. */
  builtIn: boolean;
  /** Admin: always full, can't be changed. */
  locked: boolean;
  /** Its level on every page. */
  pages: PageAccess;
  users: number;
};

export type UserAccessInfo = {
  userCode: string;
  userName: string;
  role: string;
  isActive: boolean;
  /** Only the pages changed for this user. */
  changes: PageAccess;
  /** Their role's pages, before their own changes. */
  rolePages: PageAccess;
  /** What the user ends up with. */
  pages: PageAccess;
};

export type PermissionsView = { roles: RoleInfo[]; users: UserAccessInfo[] };

/** Every role (MDA's four first, then added ones A–Z) and every user, for the Admin. */
export async function listPermissions(db: Db, a: Actor): Promise<PermissionsView> {
  requireAdmin(a);
  const stored = await db
    .select()
    .from(bookRoles)
    .where(eq(bookRoles.bookId, a.bookId))
    .orderBy(asc(bookRoles.name));
  const users = await db
    .select()
    .from(bookUsers)
    .where(eq(bookUsers.bookId, a.bookId))
    .orderBy(asc(bookUsers.userName));
  const storedOf = (name: string) =>
    stored.find((r) => r.name.toLowerCase() === name.toLowerCase())?.pageAccess;
  const count = (name: string) =>
    users.filter((u) => u.role.trim().toLowerCase() === name.toLowerCase()).length;

  const names = [...BUILT_IN_ROLES, ...stored.map((r) => r.name).filter((n) => !isBuiltIn(n))];
  const roles: RoleInfo[] = names.map((name) => ({
    name,
    builtIn: isBuiltIn(name),
    locked: isAdminRole(name),
    pages: resolvePageAccess({ role: name, rolePages: storedOf(name) }),
    users: count(name),
  }));
  return {
    roles,
    users: users.map((u) => ({
      userCode: u.userCode,
      userName: u.userName,
      role: u.role,
      isActive: u.isActive,
      changes: isAdminRole(u.role) ? {} : cleanPageAccess(u.pageAccess),
      rolePages: resolvePageAccess({ role: u.role, rolePages: storedOf(u.role) }),
      pages: resolvePageAccess({
        role: u.role,
        rolePages: storedOf(u.role),
        userPages: u.pageAccess,
      }),
    })),
  };
}

/** Saves a role's level on every page. The Admin role can't be changed. */
export async function saveRolePages(
  db: Db,
  a: Actor,
  name: string,
  pages: PageAccess,
): Promise<void> {
  requireAdmin(a);
  if (isAdminRole(name)) throw new UserError(pm.adminFixed);
  const row = await roleRow(db, a.bookId, name);
  if (!row && !isBuiltIn(name)) throw new UserError(pm.roleNotFound(name.trim()));
  const clean = cleanPageAccess(pages);
  if (row) {
    await db.update(bookRoles).set({ pageAccess: clean }).where(eq(bookRoles.id, row.id));
  } else {
    const builtIn = BUILT_IN_ROLES.find((r) => r.toLowerCase() === name.trim().toLowerCase())!;
    await db.insert(bookRoles).values({ bookId: a.bookId, name: builtIn, pageAccess: clean });
  }
  await log(db, a, 'UPDATE', 'Role', row?.name ?? name.trim(), 'Page permissions');
}

/** Adds a role, starting from another role's pages (or a Manager's). */
export async function createRole(
  db: Db,
  a: Actor,
  input: { name: string; copyFrom?: string },
): Promise<void> {
  requireAdmin(a);
  const name = input.name.trim();
  const existing = [
    ...BUILT_IN_ROLES,
    ...(
      await db.select({ n: bookRoles.name }).from(bookRoles).where(eq(bookRoles.bookId, a.bookId))
    ).map((r) => r.n),
  ];
  const problem = roleNameProblem(name, existing);
  if (problem) throw new UserError(problem, { name: problem });
  let pages: PageAccess = defaultPageAccess('Manager');
  if (input.copyFrom) {
    const from = await roleRow(db, a.bookId, input.copyFrom);
    pages = resolvePageAccess({ role: input.copyFrom, rolePages: from?.pageAccess });
  }
  await db.insert(bookRoles).values({ bookId: a.bookId, name, pageAccess: cleanPageAccess(pages) });
  await log(db, a, 'CREATE', 'Role', name, input.copyFrom ? `Copied from ${input.copyFrom}` : '');
}

/** Renames an added role; its users move with it. */
export async function renameRole(db: Db, a: Actor, from: string, to: string): Promise<void> {
  requireAdmin(a);
  if (isBuiltIn(from)) throw new UserError(pm.builtInFixed(from.trim()));
  const row = await roleRow(db, a.bookId, from);
  if (!row) throw new UserError(pm.roleNotFound(from.trim()));
  const name = to.trim();
  const others = [
    ...BUILT_IN_ROLES,
    ...(
      await db.select({ n: bookRoles.name }).from(bookRoles).where(eq(bookRoles.bookId, a.bookId))
    )
      .map((r) => r.n)
      .filter((n) => n !== row.name),
  ];
  const problem = roleNameProblem(name, others);
  if (problem) throw new UserError(problem, { name: problem });
  await db.transaction(async (raw) => {
    const tx = raw as unknown as Db;
    await tx.update(bookRoles).set({ name }).where(eq(bookRoles.id, row.id));
    await tx
      .update(bookUsers)
      .set({ role: name })
      .where(
        and(eq(bookUsers.bookId, a.bookId), sql`lower(${bookUsers.role}) = lower(${row.name})`),
      );
  });
  await log(db, a, 'UPDATE', 'Role', name, `Renamed from ${row.name}`);
}

/** Deletes an added role. Refused while any user has it. */
export async function deleteRole(db: Db, a: Actor, name: string): Promise<void> {
  requireAdmin(a);
  if (isBuiltIn(name)) throw new UserError(pm.builtInFixed(name.trim()));
  const row = await roleRow(db, a.bookId, name);
  if (!row) return;
  const n = await usersWithRole(db, a.bookId, row.name);
  if (n > 0) throw new UserError(pm.roleInUse(row.name, n));
  await db.delete(bookRoles).where(eq(bookRoles.id, row.id));
  await log(db, a, 'DELETE', 'Role', row.name);
}

/** Saves the pages changed for one user (only those that differ from their role). An empty
 *  set puts the user back on their role's pages. Admins can't be changed. */
export async function saveUserPages(
  db: Db,
  a: Actor,
  userCode: string,
  changes: PageAccess,
): Promise<void> {
  requireAdmin(a);
  const [u] = await db
    .select()
    .from(bookUsers)
    .where(and(eq(bookUsers.bookId, a.bookId), eq(bookUsers.userCode, userCode)));
  if (!u) throw new UserError(pm.userNotFound);
  if (isAdminRole(u.role)) throw new UserError(pm.adminFixed);
  const role = await roleRow(db, a.bookId, u.role);
  const base = resolvePageAccess({ role: u.role, rolePages: role?.pageAccess });
  // Keep only real differences, so a later change to the role still reaches this user.
  const clean = Object.fromEntries(
    Object.entries(cleanPageAccess(changes)).filter(([p, level]) => base[p] !== level),
  );
  await db.update(bookUsers).set({ pageAccess: clean }).where(eq(bookUsers.id, u.id));
  const n = Object.keys(clean).length;
  await log(
    db,
    a,
    'UPDATE',
    'User',
    u.userName,
    n ? `Page permissions: ${n} changed from role` : 'Page permissions: as role',
  );
}

/** Role names for User Management's role list: MDA's four, then added ones. */
export async function roleNames(db: Db, bookId: string): Promise<string[]> {
  const stored = await db
    .select({ n: bookRoles.name })
    .from(bookRoles)
    .where(eq(bookRoles.bookId, bookId))
    .orderBy(asc(bookRoles.name));
  return [...BUILT_IN_ROLES, ...stored.map((r) => r.n).filter((n) => !isBuiltIn(n))];
}
