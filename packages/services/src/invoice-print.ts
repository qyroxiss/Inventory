// Sales and Purchase Invoice printing. MDA never built it (its Sale Print button only says it
// "arrives with the report module"), so this is new, added at the user's request (2026-10-25):
// the bill, the company it belongs to and the party's ledger, everything one printed sheet needs.

import { and, eq, inArray, schema, type Db } from '@qi/db';
import type { ReturnKind } from '@qi/core';
import { purchaseBill } from './purchases.ts';
import { returnDoc } from './returns.ts';
import { saleBill } from './sales.ts';

const { books, companies, ledgers, stockItems } = schema;

/** Each item's Print Name, where it has one: the bill prints it in place of the item name
 *  (the Stock Item field was saved but never used; 2026-11-14). */
async function printNamesOf(db: Db, bookId: string, codes: string[]) {
  if (!codes.length) return {};
  const rows = await db
    .select({ code: stockItems.partCode, printName: stockItems.printName })
    .from(stockItems)
    .where(and(eq(stockItems.bookId, bookId), inArray(stockItems.partCode, codes)));
  return Object.fromEntries(
    rows.filter((r) => (r.printName ?? '').trim()).map((r) => [r.code, r.printName!.trim()]),
  ) as Record<string, string>;
}

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
    printNames: await printNamesOf(
      db,
      bookId,
      bill.lines.map((l) => l.itemCode),
    ),
  };
}

export async function purchaseForPrint(db: Db, bookId: string, billNo: string) {
  const bill = await purchaseBill(db, bookId, billNo.trim());
  if (!bill) return null;
  return {
    bill,
    company: await companyOf(db, bookId),
    party: await ledgerOf(db, bookId, bill.suppCode),
    printNames: await printNamesOf(
      db,
      bookId,
      bill.lines.map((l) => l.itemCode),
    ),
  };
}

/** A return printed as a Debit Note (purchase return) or Credit Note (sales return): the return,
 *  the company, the party's ledger and, for a sales return, the customer's address from the
 *  original bill. */
export async function returnForPrint(db: Db, bookId: string, kind: ReturnKind, returnNo: string) {
  const doc = await returnDoc(db, bookId, kind, returnNo);
  if (!doc) return null;
  const sale = kind === 'SRT' ? await saleBill(db, bookId, doc.againstBillNo) : null;
  return {
    doc,
    company: await companyOf(db, bookId),
    party: await ledgerOf(db, bookId, doc.partyCode),
    printNames: await printNamesOf(
      db,
      bookId,
      doc.lines.map((l) => l.itemCode),
    ),
    customer: sale
      ? {
          address: sale.address,
          area: sale.area,
          city: sale.city,
          mobile: sale.mobile,
          gstNo: sale.gstNo,
        }
      : null,
  };
}
