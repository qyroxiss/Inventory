// The "index of books" behind the company & year screen: every company of the account with
// its years, in one round trip. Same rows and order as MDA's two lists
// (company_setup_page.dart:43 companies by CompName, :63 years by YearName).

import { asc, inArray, schema, type Db } from '@qi/db';
import { listCompanies } from './companies.ts';

const { financialYears } = schema;

export type BookIndexYear = { id: string; yearName: string; fromDate: string; toDate: string };
export type BookIndexCompany = {
  id: string;
  compName: string;
  city: string | null;
  state: string | null;
  years: BookIndexYear[];
};

export async function listBookIndex(db: Db, accountId: string): Promise<BookIndexCompany[]> {
  const companies = await listCompanies(db, accountId);
  if (companies.length === 0) return [];
  const years = await db
    .select({
      id: financialYears.id,
      companyId: financialYears.companyId,
      yearName: financialYears.yearName,
      fromDate: financialYears.fromDate,
      toDate: financialYears.toDate,
    })
    .from(financialYears)
    .where(
      inArray(
        financialYears.companyId,
        companies.map((c) => c.id),
      ),
    )
    .orderBy(asc(financialYears.yearName));

  return companies.map((c) => ({
    id: c.id,
    compName: c.compName,
    city: c.city,
    state: c.state,
    years: years
      .filter((y) => y.companyId === c.id)
      .map(({ id, yearName, fromDate, toDate }) => ({ id, yearName, fromDate, toDate })),
  }));
}
