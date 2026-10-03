// Vercel entry point (the "api" service in /vercel.json). Vercel runs this file as a function
// and needs the Hono app as the default export. Local development still uses src/server.ts.
//
// Environment (set in the Vercel project):
//   DATABASE_URL     Postgres (added by the Neon integration)
//   APP_SECRET       random secret for sessions and the book cookie
//   PUBLIC_URL       optional; defaults to the project's production address
//   TRUSTED_ORIGINS  optional; defaults to the production, branch and deployment addresses

import { createAccountAuth } from '@qi/auth';
import { openDatabase } from '@qi/db';
import { Hono } from 'hono';
import { createApp } from './app.ts';

const https = (host: string | undefined) => (host ? `https://${host}` : undefined);

function build() {
  const url = process.env.DATABASE_URL;
  const secret = process.env.APP_SECRET;
  if (!url) throw new Error('DATABASE_URL is not set.');
  if (!secret) throw new Error('APP_SECRET is not set.');

  const vercelHosts = [
    https(process.env.VERCEL_PROJECT_PRODUCTION_URL),
    https(process.env.VERCEL_BRANCH_URL),
    https(process.env.VERCEL_URL),
  ].filter((o): o is string => !!o);
  const baseURL = process.env.PUBLIC_URL ?? vercelHosts[0] ?? 'http://localhost:3000';
  const trustedOrigins = process.env.TRUSTED_ORIGINS?.split(',') ?? [baseURL, ...vercelHosts];

  return openDatabase({ url }).then(({ db }) =>
    createApp({
      db,
      secret,
      accountAuth: createAccountAuth(db, { secret, baseURL, trustedOrigins }),
      secureCookies: baseURL.startsWith('https://'),
    }),
  );
}

// Opened on the first request and reused while the function instance stays warm.
let app: ReturnType<typeof build> | undefined;

const entry = new Hono();
entry.all('*', async (c) => {
  app ??= build().catch((e: unknown) => {
    app = undefined;
    throw e;
  });
  return (await app).fetch(c.req.raw);
});

export default entry;
