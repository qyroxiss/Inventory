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
  listAllGroups,
  listGroups,
  createGroup,
  updateGroup,
  deleteGroup,
  listSubGroups,
  createSubGroup,
  updateSubGroup,
  deleteSubGroup,
  type AccountGroup,
  type GroupInput,
  type SubGroup,
  type SubGroupInput,
} from './groups.ts';
export {
  listLedgers,
  createLedger,
  updateLedger,
  deleteLedger,
  type Ledger,
  type LedgerWithGroup,
  type LedgerInput,
} from './ledgers.ts';
export { listMisc, addMiscIfNew } from './misc-list.ts';
export {
  createMiscMaster,
  listMiscMaster,
  removeMiscMaster,
  updateMiscMaster,
  type MiscMasterRow,
} from './misc-masters.ts';
export { importMda, type MdaImport, type MdaImportResult } from './mda-import.ts';
