// Phase 0 spike (docs/WORKFLOW.md). Runs the SAME Drizzle code against:
//   - PGlite on the filesystem (the planned desktop database)
//   - Postgres 16 in Docker (the planned cloud database), if PG_URL is set
// Each sale = one transaction: number check + header + 4 ledger lines + 3 stock lines +
// series update — the same shape as SaleService.save in MDA-Inventory.
//
//   pnpm --filter @qi/spike-pglite spike            (PGlite only)
//   PG_URL=postgres://... pnpm ... spike            (both)

import { mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import pg from 'pg';

const N = Number(process.env.N ?? 10_000);

const DDL = [
  `DROP TABLE IF EXISTS stock_movements, voucher_ledger_lines, vouchers, voucher_series`,
  `CREATE TABLE voucher_series (vchr_type text PRIMARY KEY, prefix text NOT NULL, width int NOT NULL, last_no int NOT NULL DEFAULT 0)`,
  `CREATE TABLE vouchers (
     id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
     fy_id int NOT NULL, vchr_type text NOT NULL, vchr_no text NOT NULL, vchr_date date NOT NULL,
     party_code text, net_amount numeric(14,2) NOT NULL, status text NOT NULL DEFAULT 'Active',
     UNIQUE (fy_id, vchr_type, vchr_no))`,
  `CREATE TABLE voucher_ledger_lines (
     id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
     voucher_id bigint NOT NULL REFERENCES vouchers(id) ON DELETE CASCADE,
     line_no int NOT NULL, acc_code text NOT NULL,
     dr_amount numeric(14,2) NOT NULL DEFAULT 0, cr_amount numeric(14,2) NOT NULL DEFAULT 0)`,
  `CREATE TABLE stock_movements (
     id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
     voucher_id bigint REFERENCES vouchers(id) ON DELETE CASCADE,
     trn_date date NOT NULL, part_code text NOT NULL,
     in_qty numeric(14,3) NOT NULL DEFAULT 0, out_qty numeric(14,3) NOT NULL DEFAULT 0)`,
  `CREATE INDEX ON voucher_ledger_lines (acc_code)`,
  `CREATE INDEX ON stock_movements (part_code, trn_date)`,
  `INSERT INTO voucher_series VALUES ('SAL', 'SAL-', 3, 0)`,
];

type Db = ReturnType<typeof drizzlePglite> | ReturnType<typeof drizzlePg>;

async function postSale(db: Db, i: number) {
  await db.transaction(async (tx) => {
    const no = `SAL-${String(i).padStart(3, '0')}`;
    const clash = await tx.execute(
      sql`SELECT 1 FROM vouchers WHERE fy_id = 1 AND vchr_type = 'SAL' AND vchr_no = ${no}`,
    );
    if (clash.rows.length) throw new Error(`clash ${no}`);
    const net = 1180 + (i % 97);
    const [hdr] = (
      await tx.execute(sql`
        INSERT INTO vouchers (fy_id, vchr_type, vchr_no, vchr_date, party_code, net_amount)
        VALUES (1, 'SAL', ${no}, DATE '2026-04-01' + (${i} % 365), ${`AC${i % 500}`}, ${net})
        RETURNING id`)
    ).rows as { id: number }[];
    const id = hdr!.id;
    await tx.execute(sql`
      INSERT INTO voucher_ledger_lines (voucher_id, line_no, acc_code, dr_amount, cr_amount) VALUES
        (${id}, 1, ${`AC${i % 500}`}, ${net}, 0),
        (${id}, 2, 'SAL001', 0, ${net - 180}),
        (${id}, 3, 'TAX004', 0, 90),
        (${id}, 4, 'TAX005', 0, 90)`);
    await tx.execute(sql`
      INSERT INTO stock_movements (voucher_id, trn_date, part_code, out_qty) VALUES
        (${id}, DATE '2026-04-01', ${`P${i % 300}`}, 1),
        (${id}, DATE '2026-04-01', ${`P${(i + 1) % 300}`}, 2.5),
        (${id}, DATE '2026-04-01', ${`P${(i + 2) % 300}`}, 0.125)`);
    await tx.execute(sql`UPDATE voucher_series SET last_no = ${i} WHERE vchr_type = 'SAL' AND last_no < ${i}`);
  });
}

async function run(label: string, db: Db) {
  for (const stmt of DDL) await db.execute(sql.raw(stmt));

  const t0 = performance.now();
  for (let i = 1; i <= N; i++) await postSale(db, i);
  const postMs = performance.now() - t0;

  const t1 = performance.now();
  const bal = await db.execute(sql`
    SELECT acc_code, SUM(dr_amount) - SUM(cr_amount) AS bal
    FROM voucher_ledger_lines l JOIN vouchers v ON v.id = l.voucher_id
    WHERE v.status = 'Active' GROUP BY acc_code`);
  const stock = await db.execute(sql`
    SELECT part_code, SUM(in_qty) - SUM(out_qty) AS qty FROM stock_movements GROUP BY part_code`);
  const reportMs = performance.now() - t1;

  const check = await db.execute(sql`SELECT SUM(dr_amount) - SUM(cr_amount) AS diff FROM voucher_ledger_lines`);

  console.log(
    `${label.padEnd(12)} ${N} sales in ${(postMs / 1000).toFixed(1)}s ` +
      `(${(postMs / N).toFixed(2)} ms/sale) | ledger+stock reports ${reportMs.toFixed(0)} ms ` +
      `(${bal.rows.length} ledgers, ${stock.rows.length} items) | Dr-Cr ${JSON.stringify(check.rows[0])}`,
  );
}

const dirSize = (p: string): number =>
  readdirSync(p).reduce((s, f) => {
    const st = statSync(join(p, f));
    return s + (st.isDirectory() ? dirSize(join(p, f)) : st.size);
  }, 0);

const dataDir = join(import.meta.dirname, 'data');
rmSync(dataDir, { recursive: true, force: true });
mkdirSync(dataDir, { recursive: true });

const lite = new PGlite(dataDir);
await run('PGlite', drizzlePglite(lite));
await lite.close();
console.log(`PGlite data on disk: ${(dirSize(dataDir) / 1024 / 1024).toFixed(1)} MB`);

// Reopen: proves the data survived a restart.
const reopened = new PGlite(dataDir);
const count = await reopened.query<{ n: number }>('SELECT count(*)::int AS n FROM vouchers');
console.log(`PGlite after reopen: ${count.rows[0]!.n} vouchers`);
await reopened.close();

if (process.env.PG_URL) {
  const pool = new pg.Pool({ connectionString: process.env.PG_URL });
  await run('Postgres 16', drizzlePg(pool));
  await pool.end();
}
