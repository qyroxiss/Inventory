// Company registry. Port of the save path in MDA-Inventory lib/company_creation_page.dart:220-263
// and the list in lib/company_setup_page.dart:43-44; update and delete from the same page.

import { companyCode, companyFieldErrors, companyMessages, companyStatutory } from '@qi/core';
import { and, asc, eq, schema, type Db } from '@qi/db';
import { UserError, assertNoFieldErrors } from './errors.ts';

const { companies } = schema;

export type Company = typeof companies.$inferSelect;

export type CompanyInput = {
  compName: string;
  mailName?: string;
  add1?: string;
  state?: string;
  country?: string;
  pinCode?: string;
  phone?: string;
  mobile?: string;
  fax?: string;
  email?: string;
  website?: string;
  gstin?: string;
  pan?: string;
  cin?: string;
  bankName?: string;
  bankBranch?: string;
  bankAcNo?: string;
  bankIfsc?: string;
  finYrFrom?: string;
  booksFrom?: string;
};

const t = (v: string | undefined) => (v ?? '').trim();

/** Companies of an account, ordered by name (company_setup_page.dart:43). */
export const listCompanies = (db: Db, accountId: string): Promise<Company[]> =>
  db
    .select()
    .from(companies)
    .where(eq(companies.accountId, accountId))
    .orderBy(asc(companies.compName));

export async function getCompany(
  db: Db,
  accountId: string,
  companyId: string,
): Promise<Company | null> {
  const [row] = await db
    .select()
    .from(companies)
    .where(and(eq(companies.accountId, accountId), eq(companies.id, companyId)));
  return row ?? null;
}

export async function createCompany(
  db: Db,
  accountId: string,
  input: CompanyInput,
  nowMs = Date.now(),
): Promise<Company> {
  const values = formValues(input);
  const [row] = await db
    .insert(companies)
    .values({ accountId, compCode: companyCode(values.compName, nowMs), ...values })
    .returning();
  return row!;
}

/** Update: every form field is written back, as MDA does (company_creation_page.dart:265-288). */
export async function updateCompany(
  db: Db,
  accountId: string,
  companyId: string,
  input: CompanyInput,
): Promise<Company> {
  const values = formValues(input);
  const [row] = await db
    .update(companies)
    .set(values)
    .where(and(eq(companies.accountId, accountId), eq(companies.id, companyId)))
    .returning();
  if (!row) throw new UserError(companyMessages.noneFound);
  return row;
}

/**
 * Delete: the company and its year records go; its books are kept, as MDA leaves the year
 * .db files on disk (company_creation_page.dart:345-352).
 */
export async function deleteCompany(db: Db, accountId: string, companyId: string): Promise<void> {
  // financial_years rows go with the company (ON DELETE CASCADE); books have no foreign key.
  await db
    .delete(companies)
    .where(and(eq(companies.accountId, accountId), eq(companies.id, companyId)));
}

/** The values MDA saves from the form; validation first (Name required, GSTIN/PAN if entered). */
function formValues(input: CompanyInput) {
  assertNoFieldErrors(
    companyFieldErrors({ name: input.compName, gstin: input.gstin, pan: input.pan }),
  );
  const name = t(input.compName);
  const statutory = companyStatutory(input);
  return {
    compName: name,
    mailName: t(input.mailName),
    add1: t(input.add1),
    state: input.state ?? 'Not Applicable',
    country: input.country ?? 'India',
    pinCode: t(input.pinCode),
    phone: t(input.phone),
    mobile: t(input.mobile),
    fax: t(input.fax),
    email: t(input.email),
    website: t(input.website),
    gstin: statutory.gstin,
    stateCode: statutory.stateCode,
    pan: statutory.pan,
    cin: statutory.cin,
    bankName: t(input.bankName),
    bankBranch: t(input.bankBranch),
    bankAcNo: t(input.bankAcNo),
    bankIfsc: statutory.bankIfsc,
    finYrFrom: input.finYrFrom === undefined ? '1-Apr-26' : t(input.finYrFrom),
    booksFrom: input.booksFrom === undefined ? '1-Apr-26' : t(input.booksFrom),
  };
}
