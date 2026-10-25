// Sales and Purchase Invoice printing. MDA never built it (its Sale Print button only says it
// "arrives with the report module"), so this is new, added at the user's request (2026-10-25):
// the bill, the company it belongs to and the party's ledger, everything one printed sheet needs.

import { and, eq, schema, type Db } from '@qi/db';
import { purchaseBill } from './purchases.ts';
import { saleBill } from './sales.ts';

const { books, companies, ledgers } = schema;

async function companyOf(db: Db, bookId: string) {
  const [row] = await db
    .select({ company: companies })
    .from(books)
    .innerJoin(companies, eq(companies.id, books.companyId))
    .where(eq(books.id, bookId));
  return row?.company ?? null;
}

async function ledgerOf(db: Db, bookId: string, accCode: string) {
  if (!accCode) return null;
  const [l] = await db
    .select()
    .from(ledgers)
    .where(and(eq(ledgers.bookId, bookId), eq(ledgers.accCode, accCode)));
  return l ?? null;
}

export async function saleForPrint(db: Db, bookId: string, billNo: string) {
  const bill = await saleBill(db, bookId, billNo.trim());
  if (!bill) return null;
  return {
    bill,
    company: await companyOf(db, bookId),
    party: await ledgerOf(db, bookId, bill.custCode),
  };
}

export async function purchaseForPrint(db: Db, bookId: string, billNo: string) {
  const bill = await purchaseBill(db, bookId, billNo.trim());
  if (!bill) return null;
  return {
    bill,
    company: await companyOf(db, bookId),
    party: await ledgerOf(db, bookId, bill.suppCode),
  };
}
