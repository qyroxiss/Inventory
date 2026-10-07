// Import from MDA, browser half: reads an MDA-Inventory data folder (MDA_Registry.db plus one
// folder per company holding its year files, e.g. CMDASOF_1786708384851/MDA_Inv2627.db) with
// sql.js and returns the rows as MDA stores them. The server maps them onto our tables
// (packages/services/src/mda-import.ts). Nothing is written back to MDA's files.

import type { MdaImportBody as Payload } from '@qi/contract';
import { importMessages } from '@qi/core';
import type { Database } from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';

type Row = Record<string, unknown>;

/** The year-file tables the import carries today (more as their screens land). */
const BOOK_TABLES = [
  'User',
  'Maacct2',
  'Maacct',
  'Misc_Master',
  'Part_Master',
  'AuditLog',
] as const;

export class MdaFolderError extends Error {}

/** MDA's folder-name rule for a company (db_platform_io.dart `_safeFolder`). */
const safeFolder = (name: string) => name.replace(/[<>:"/\\|?*]/g, '_').trim();

const pathOf = (f: File) => (f.webkitRelativePath || f.name).replace(/\\/g, '/');
const lower = (s: string) => s.toLowerCase();

function rows(db: Database, table: string): Row[] {
  const exists = db.exec(`SELECT 1 FROM sqlite_master WHERE type='table' AND name=?`, [table]);
  if (!exists.length) return [];
  const [res] = db.exec(`SELECT * FROM "${table}"`);
  if (!res) return [];
  return res.values.map((v) => Object.fromEntries(res.columns.map((c, i) => [c, v[i]])));
}

export async function readMdaFolder(files: File[]): Promise<Payload> {
  const registry = files
    .filter((f) => lower(f.name) === 'mda_registry.db')
    .sort((a, b) => pathOf(a).split('/').length - pathOf(b).split('/').length)[0];
  if (!registry) throw new MdaFolderError(importMessages.noRegistry);
  const root = pathOf(registry).split('/').slice(0, -1).join('/');

  // A year file: <root>/<CompCode or company name>/<DbName>.db; when files were picked one by
  // one (no folders), the file name alone, if only one file has it.
  const findYearFile = (compCode: string, compName: string, dbName: string) => {
    for (const folder of [safeFolder(compCode), safeFolder(compName)]) {
      const want = lower([root, folder, `${dbName}.db`].filter(Boolean).join('/'));
      const hit = files.find((f) => lower(pathOf(f)) === want);
      if (hit) return hit;
    }
    const byName = files.filter((f) => lower(f.name) === lower(`${dbName}.db`));
    return byName.length === 1 ? byName[0] : undefined;
  };

  const { default: initSqlJs } = await import('sql.js');
  const SQL = await initSqlJs({ locateFile: () => wasmUrl });
  const open = async (f: File) => new SQL.Database(new Uint8Array(await f.arrayBuffer()));

  const reg = await open(registry);
  try {
    const years = rows(reg, 'Company_Year');
    const out: Payload = { companies: [] };
    for (const company of rows(reg, 'CompanyMaster')) {
      const code = String(company.CompCode ?? '');
      const name = String(company.CompName ?? '');
      const own = years.filter((y) => y.CompCode === code);
      const withBooks = [];
      for (const year of own) {
        const file = findYearFile(code, name, String(year.DbName ?? ''));
        if (!file) {
          withBooks.push({ year, book: null });
          continue;
        }
        const db = await open(file);
        try {
          withBooks.push({
            year,
            book: Object.fromEntries(BOOK_TABLES.map((t) => [t, rows(db, t)])),
          });
        } finally {
          db.close();
        }
      }
      out.companies.push({ company, years: withBooks });
    }
    return out;
  } finally {
    reg.close();
  }
}
