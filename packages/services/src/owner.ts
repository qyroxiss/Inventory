// Owner Panel (added 2026-11-13): every account of the software, for its owner.
// Creating an account and setting its password go through better-auth (@qi/auth).

import { accountStatus, indiaToday, ownerMessages } from '@qi/core';
import { count, desc, eq, max, schema, type Db } from '@qi/db';
import { UserError } from './errors.ts';

const { user, session, companies } = schema;

export type OwnerAccount = {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  lastSignIn: string | null;
  companies: number;
  blocked: boolean;
  validTill: string | null;
  status: 'active' | 'blocked' | 'expired';
  owner: boolean;
};

export async function listAccounts(db: Db, owners: string[]): Promise<OwnerAccount[]> {
  const [users, comps, seen] = await Promise.all([
    db.select().from(user).orderBy(desc(user.createdAt)),
    db
      .select({ id: companies.accountId, n: count() })
      .from(companies)
      .groupBy(companies.accountId),
    db
      .select({ id: session.userId, at: max(session.updatedAt) })
      .from(session)
      .groupBy(session.userId),
  ]);
  const nComp = new Map(comps.map((c) => [c.id, Number(c.n)]));
  const last = new Map(seen.map((s) => [s.id, s.at]));
  const today = indiaToday();
  return users.map((u) => {
    const owner = owners.includes(u.email.toLowerCase());
    const at = last.get(u.id);
    return {
      id: u.id,
      name: u.name,
      email: u.email,
      createdAt: u.createdAt.toISOString(),
      lastSignIn: at ? new Date(at).toISOString() : null,
      companies: nComp.get(u.id) ?? 0,
      blocked: u.blocked,
      validTill: u.validTill,
      status: owner ? 'active' : accountStatus(u, today),
      owner,
    };
  });
}

async function customer(db: Db, owners: string[], id: string) {
  const [u] = await db.select().from(user).where(eq(user.id, id));
  if (!u) throw new UserError(ownerMessages.notFound);
  if (owners.includes(u.email.toLowerCase())) throw new UserError(ownerMessages.ownerLocked);
  return u;
}

export async function emailTaken(db: Db, email: string) {
  const [u] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, email.trim().toLowerCase()));
  return !!u;
}

/** The account must exist (any account, the owner's included). */
export async function requireAccount(db: Db, id: string) {
  const [u] = await db.select({ id: user.id }).from(user).where(eq(user.id, id));
  if (!u) throw new UserError(ownerMessages.notFound);
}

export async function setAccountBlocked(db: Db, owners: string[], id: string, blocked: boolean) {
  await customer(db, owners, id);
  await db.update(user).set({ blocked, updatedAt: new Date() }).where(eq(user.id, id));
}

export async function setAccountValidTill(
  db: Db,
  owners: string[],
  id: string,
  validTill: string | null,
) {
  await customer(db, owners, id);
  await db.update(user).set({ validTill, updatedAt: new Date() }).where(eq(user.id, id));
}
