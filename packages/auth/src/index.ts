// @qi/auth — the account login (layer 1, web/mobile only). See docs/ARCHITECTURE.md §3.7.
// The book login (layer 2, MDA's own login) lives in @qi/services/book-auth.

import { schema, type Db } from '@qi/db';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';

export type AccountAuthOptions = {
  /** Secret used to sign account session cookies. */
  secret: string;
  /** Public origin of the API, e.g. https://inventory.example.com */
  baseURL: string;
  trustedOrigins?: string[];
};

export function createAccountAuth(db: Db, opts: AccountAuthOptions) {
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
  });
}

export type AccountAuth = ReturnType<typeof createAccountAuth>;
