// One entry point for both databases. Callers get the same Drizzle `Db` type either way.
//   { url }      -> cloud Postgres (node-postgres pool)
//   { dataDir }  -> desktop / local dev PGlite on disk
//   {}           -> in-memory PGlite (tests)

import { chmodSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import { migrate as migratePg } from 'drizzle-orm/node-postgres/migrator';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import pg from 'pg';
import * as schema from './schema.ts';

export type Schema = typeof schema;
export type Db = PgDatabase<PgQueryResultHKT, Schema>;

const migrationsFolder = fileURLToPath(new URL('../migrations', import.meta.url));

export type DbOptions = { url?: string; dataDir?: string };

export async function openDatabase(
  opts: DbOptions = {},
): Promise<{ db: Db; close: () => Promise<void> }> {
  if (opts.url) {
    const pool = new pg.Pool({ connectionString: opts.url });
    const db = drizzlePg(pool, { schema });
    await migratePg(db, { migrationsFolder });
    return { db: db as unknown as Db, close: () => pool.end() };
  }
  // On Windows PGlite's folders end up with the ReadOnly attribute, which it then reads as mode
  // 444 and can't create files in on the next start ("PGlite failed to initialize", or Aborted()
  // on pg_logical). The data is fine; clearing the attribute on every folder is enough. Found
  // 2026-10-25.
  if (opts.dataDir && process.platform === 'win32' && existsSync(opts.dataDir))
    writableFolders(opts.dataDir);
  const client = new PGlite(opts.dataDir);
  const db = drizzlePglite(client, { schema });
  await migratePglite(db, { migrationsFolder });
  return { db: db as unknown as Db, close: () => client.close() };
}

/** Clears the Windows ReadOnly attribute on a folder and every folder inside it. */
function writableFolders(dir: string) {
  chmodSync(dir, 0o755);
  for (const e of readdirSync(dir, { withFileTypes: true }))
    if (e.isDirectory()) writableFolders(join(dir, e.name));
}
