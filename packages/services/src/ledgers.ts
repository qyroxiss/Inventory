// Ledger Creation. Port of MDA-Inventory lib/ledger_creation_page.dart (docs/LOGIC-SPEC.md §7).
// Reads/writes `ledgers` (Maacct), resolving `under` against `account_groups` (Maacct2) — every
// group AND sub group, not just top-level ones, exactly as MDA's own Under Group list does.

import {
  type DrCr,
  ledgerFieldErrors,
  ledgerMessages,
  LEDGER_CODE_PREFIX,
  LEDGER_CODE_WIDTH,
  nextCode,
} from '@qi/core';
import { and, asc, eq, ne, schema, type Db } from '@qi/db';
import { UserError, assertNoFieldErrors } from './errors.ts';
import { ledgerVoucherLineCount } from './vouchers.ts';

const { ledgers, accountGroups } = schema;

export type Ledger = typeof ledgers.$inferSelect;
export type LedgerWithGroup = Ledger & { grpName: string | null };
export type LedgerInput = {
  name: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  mobile?: string;
  email?: string;
  pan?: string;
  under?: string;
  gstin?: string;
  openingBalance?: string;
  drCr?: DrCr;
};

/** Case-sensitive, exact match — same as MDA's `WHERE AccName = ?` (ledger_creation_page.dart:201-213). */
async function nameClash(
  db: Db,
  bookId: string,
  name: string,
  excludeCode?: string,
): Promise<boolean> {
  const clauses = [eq(ledgers.bookId, bookId), eq(ledgers.accName, name)];
  if (excludeCode) clauses.push(ne(ledgers.accCode, excludeCode));
  const [clash] = await db
    .select({ id: ledgers.id })
    .from(ledgers)
    .where(and(...clauses));
  return !!clash;
}

/** The View dialog's list: every ledger with its group's name joined in, by ledger name
 * (ledger_creation_page.dart:530-535). */
export async function listLedgers(db: Db, bookId: string): Promise<LedgerWithGroup[]> {
  const rows = await db
    .select({ ledger: ledgers, grpName: accountGroups.grpName })
    .from(ledgers)
    .leftJoin(
      accountGroups,
      and(eq(accountGroups.bookId, bookId), eq(accountGroups.grpCode, ledgers.grpCode)),
    )
    .where(eq(ledgers.bookId, bookId))
    .orderBy(asc(ledgers.accName));
  return rows.map((r) => ({ ...r.ledger, grpName: r.grpName ?? null }));
}

export async function createLedger(db: Db, bookId: string, input: LedgerInput): Promise<Ledger> {
  assertNoFieldErrors(
    ledgerFieldErrors({
      name: input.name,
      city: input.city,
      state: input.state,
      under: input.under,
      pincode: input.pincode,
    }),
  );
  const name = input.name.trim();

  if (await nameClash(db, bookId, name)) {
    throw new UserError(ledgerMessages.duplicate, { name: ledgerMessages.duplicate });
  }

  const existing = await db
    .select({ accCode: ledgers.accCode })
    .from(ledgers)
    .where(eq(ledgers.bookId, bookId));
  const code = nextCode(
    existing.map((r) => r.accCode),
    LEDGER_CODE_PREFIX,
    LEDGER_CODE_WIDTH,
  );

  const [row] = await db
    .insert(ledgers)
    .values({
      bookId,
      accCode: code,
      accName: name,
      grpCode: input.under!,
      opBal: input.openingBalance?.trim() || '0',
      drCr: input.drCr ?? 'Dr',
      add1: input.address?.trim() || null,
      city: input.city?.trim() || null,
      state: input.state?.trim() || null,
      pinCode: input.pincode?.trim() || null,
      mobile: input.mobile?.trim() || null,
      email: input.email?.trim() || null,
      gstin: input.gstin?.trim() || null,
      pan: input.pan?.trim() || null,
    })
    .returning();
  return row!;
}

/** Update: everything except AccCode — MDA keeps the existing code on Update (line 264). */
export async function updateLedger(
  db: Db,
  bookId: string,
  accCode: string,
  input: LedgerInput,
): Promise<Ledger> {
  assertNoFieldErrors(
    ledgerFieldErrors({
      name: input.name,
      city: input.city,
      state: input.state,
      under: input.under,
      pincode: input.pincode,
    }),
  );
  const name = input.name.trim();

  if (await nameClash(db, bookId, name, accCode)) {
    throw new UserError(ledgerMessages.duplicate, { name: ledgerMessages.duplicate });
  }

  const [row] = await db
    .update(ledgers)
    .set({
      accName: name,
      grpCode: input.under!,
      opBal: input.openingBalance?.trim() || '0',
      drCr: input.drCr ?? 'Dr',
      add1: input.address?.trim() || null,
      city: input.city?.trim() || null,
      state: input.state?.trim() || null,
      pinCode: input.pincode?.trim() || null,
      mobile: input.mobile?.trim() || null,
      email: input.email?.trim() || null,
      gstin: input.gstin?.trim() || null,
      pan: input.pan?.trim() || null,
    })
    .where(and(eq(ledgers.bookId, bookId), eq(ledgers.accCode, accCode)))
    .returning();
  if (!row) throw new UserError(ledgerMessages.noneFound);
  return row;
}

/**
 * Remove: blocked if the ledger's been used in any voucher line, same as MDA
 * (ledger_creation_page.dart:320-334) — suggesting "mark it inactive instead" even though no
 * screen anywhere actually offers that toggle, a dead-end message kept verbatim from MDA.
 */
export async function deleteLedger(db: Db, bookId: string, accCode: string): Promise<void> {
  const [row] = await db
    .select({ accName: ledgers.accName })
    .from(ledgers)
    .where(and(eq(ledgers.bookId, bookId), eq(ledgers.accCode, accCode)));
  if (!row) return;

  // How many voucher lines use it, cancelled vouchers included (ledger_creation_page.dart:323).
  const used = await ledgerVoucherLineCount(db, bookId, accCode);
  if (used > 0) {
    throw new UserError(ledgerMessages.removeBlocked(row.accName, used));
  }

  await db.delete(ledgers).where(and(eq(ledgers.bookId, bookId), eq(ledgers.accCode, accCode)));
}
