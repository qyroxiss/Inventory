// @qi/auth — the account login (layer 1, web/mobile only). See docs/ARCHITECTURE.md §3.7.
// The book login (layer 2, MDA's own login) lives in @qi/services/book-auth.
//
// Owner Panel (added 2026-11-13): public sign-up is closed. Only an owner email (OWNER_EMAILS)
// may sign itself up; every other account is created by the owner from the Owner Panel. A
// blocked or expired account can't sign in.

import { accountStatus, indiaToday, isoToDmy, ownerMessages } from '@qi/core';
import { eq, schema, type Db } from '@qi/db';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { APIError, createAuthMiddleware } from 'better-auth/api';

export type AccountAuthOptions = {
  /** Secret used to sign account session cookies. */
  secret: string;
  /** Public origin of the API, e.g. https://inventory.example.com */
  baseURL: string;
  trustedOrigins?: string[];
  /** The software owner's emails (lower case). Only these may sign themselves up. */
  ownerEmails?: string[];
};

/** Why an account may not sign in now, or null when it may. */
export async function accountBlockedMessage(db: Db, by: { email?: string; id?: string }) {
  const [u] = await db
    .select({ blocked: schema.user.blocked, validTill: schema.user.validTill })
    .from(schema.user)
    .where(by.id ? eq(schema.user.id, by.id) : eq(schema.user.email, (by.email ?? '').toLowerCase()));
  if (!u) return null;
  const status = accountStatus(u, indiaToday());
  if (status === 'blocked') return ownerMessages.blocked;
  if (status === 'expired') return ownerMessages.expired(isoToDmy(u.validTill!));
  return null;
}

export function createAccountAuth(db: Db, opts: AccountAuthOptions) {
  const owners = new Set((opts.ownerEmails ?? []).map((e) => e.toLowerCase()));
  return betterAuth({
    secret: opts.secret,
    baseURL: opts.baseURL,
    basePath: '/api/auth',
    trustedOrigins: opts.trustedOrigins ?? [],
    database: drizzleAdapter(db, {
      provider: 'pg',
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
      },
    }),
    emailAndPassword: { enabled: true },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        const email = String((ctx.body as { email?: unknown } | undefined)?.email ?? '')
          .trim()
          .toLowerCase();
        // Sign-up from a browser: owners only. The Owner Panel creates accounts from the
        // server itself (no request), which is let through.
        if (ctx.path === '/sign-up/email' && ctx.request && !owners.has(email))
          throw new APIError('FORBIDDEN', { message: ownerMessages.signUpClosed });
        if (ctx.path === '/sign-in/email') {
          const why = await accountBlockedMessage(db, { email });
          if (why) throw new APIError('FORBIDDEN', { message: why });
        }
      }),
    },
  });
}

export type AccountAuth = ReturnType<typeof createAccountAuth>;

/** Owner Panel: a new email-and-password account. Returns its id. */
export async function createCustomerAccount(
  auth: AccountAuth,
  v: { name: string; email: string; password: string },
) {
  const res = await auth.api.signUpEmail({
    body: { name: v.name.trim(), email: v.email.trim().toLowerCase(), password: v.password },
  });
  // Sign-up signs the new account in; the owner isn't that account, so drop the session.
  const ctx = await auth.$context;
  await ctx.internalAdapter.deleteUserSessions(res.user.id);
  return res.user.id;
}

/** Owner Panel: a new password; the account is signed out everywhere. */
export async function setAccountPassword(auth: AccountAuth, userId: string, password: string) {
  const ctx = await auth.$context;
  await ctx.internalAdapter.updatePassword(userId, await ctx.password.hash(password));
  await ctx.internalAdapter.deleteUserSessions(userId);
}

/** Signs an account out everywhere (on blocking it). */
export async function endAccountSessions(auth: AccountAuth, userId: string) {
  const ctx = await auth.$context;
  await ctx.internalAdapter.deleteUserSessions(userId);
}

/** The password length better-auth accepts. */
export async function passwordLimits(auth: AccountAuth) {
  return (await auth.$context).password.config;
}
