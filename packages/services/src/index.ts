// @qi/services — use-cases over @qi/db, with all rules from @qi/core.
export { UserError } from './errors.ts';
export {
  listCompanies,
  getCompany,
  createCompany,
  updateCompany,
  deleteCompany,
  type Company,
  type CompanyInput,
} from './companies.ts';
export {
  listYears,
  getYear,
  createYear,
  deleteYear,
  type FinancialYear,
  type YearInput,
} from './years.ts';
export { listBookIndex, type BookIndexCompany, type BookIndexYear } from './book-index.ts';
export { bookLogin, changeBookPassword, type BookSession } from './book-auth.ts';
export { getDashboard } from './dashboard.ts';
export {
  listGroups,
  createGroup,
  updateGroup,
  deleteGroup,
  type AccountGroup,
  type GroupInput,
} from './groups.ts';
