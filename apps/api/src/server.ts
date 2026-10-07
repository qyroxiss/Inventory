// Cloud / local-dev entry point.
//   DATABASE_URL set   -> Postgres (production on the VPS)
//   otherwise          -> PGlite in ./.data/pglite (local development, no install needed)

import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';
import { createAccountAuth } from '@qi/auth';
import { openDatabase } from '@qi/db';
import { createApp } from './app.ts';

const port = Number(process.env.PORT ?? 3000);
const baseURL = process.env.PUBLIC_URL ?? `http://localhost:${port}`;
const secret = process.env.APP_SECRET ?? 'dev-only-secret-change-me-dev-only-secret';
if (!process.env.APP_SECRET)
  console.warn('APP_SECRET not set - using an insecure development secret.');

let dataDir: string | undefined;
if (!process.env.DATABASE_URL) {
  dataDir = fileURLToPath(new URL('../../../.data/pglite', import.meta.url));
  mkdirSync(dataDir, { recursive: true });
}
const { db, close } = await openDatabase({ url: process.env.DATABASE_URL, dataDir });

// Close the database before exiting. A local PGlite folder left open by a stopped process can't
// be opened again ("Aborted()"), so Ctrl+C and a stop signal shut it down cleanly.
let closing = false;
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    if (closing) return;
    closing = true;
    void close().finally(() => process.exit(0));
  });
}

// LOCAL_ACCOUNT=1 skips the account layer and runs as account 'local', exactly as the desktop
// app will. For local development only, until the account sign-in screen is built.
const localAccount = process.env.LOCAL_ACCOUNT === '1';
if (localAccount && process.env.DATABASE_URL)
  throw new Error('LOCAL_ACCOUNT is for local development only.');

const app = createApp({
  db,
  secret,
  accountAuth: localAccount
    ? undefined
    : createAccountAuth(db, {
        secret,
        baseURL,
        trustedOrigins: (process.env.TRUSTED_ORIGINS ?? 'http://localhost:5173').split(','),
      }),
  secureCookies: baseURL.startsWith('https://'),
});

serve({ fetch: app.fetch, port });
console.log(
  `api listening on ${baseURL} (${process.env.DATABASE_URL ? 'Postgres' : `PGlite at ${dataDir}`})` +
    (localAccount ? ' - account layer off (LOCAL_ACCOUNT=1)' : ''),
);
