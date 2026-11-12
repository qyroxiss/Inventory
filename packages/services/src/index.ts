// @qi/services — use-cases over @qi/db, with all rules from @qi/core.
export { UserError } from './errors.ts';
export {
  listCompanies,
  getCompany,
  companyDecimals,
  setCompanyDecimals,
  type Decimals,
  companyPreferences,
  setCompanyPreferences,
  type Preferences,
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
export { bookLogin, changeBookPassword, liveBookUser, type BookSession } from './book-auth.ts';
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
export {
  createStockGroup,
  listStockGroups,
  removeStockGroup,
  updateStockGroup,
  type StockGroup,
} from './stock-groups.ts';
export {
  createStockSubGroup,
  listStockSubGroups,
  removeStockSubGroup,
  updateStockSubGroup,
  type StockSubGroup,
} from './stock-sub-groups.ts';
export {
  createSaleType,
  listSaleTypes,
  removeSaleType,
  updateSaleType,
  type SaleType,
} from './sale-types.ts';
export {
  createStockItem,
  listStockItems,
  removeStockItem,
  updateStockItem,
  type StockItem,
} from './stock-items.ts';
export {
  cancelVoucher,
  ensureBookSeeds,
  listVouchers,
  nextVoucherNo,
  saveVoucher,
  updateVoucher,
  voucherForPrint,
  voucherLinesOf,
  type PostingContext,
  type VoucherInput,
  type VoucherLineRow,
  type VoucherPrint,
  type VoucherRow,
} from './vouchers.ts';
export { purchaseForPrint, returnForPrint, saleForPrint } from './invoice-print.ts';
export {
  billForReturn,
  cancelReturn,
  listReturns,
  nextReturnNo,
  returnDoc,
  returnableBills,
  saveReturn,
  updateReturn,
  type BillForReturn,
  type ReturnDoc,
  type ReturnInput,
  type ReturnRow,
  type ReturnableBill,
} from './returns.ts';
export {
  cancelPurchase,
  listPurchases,
  nextPurchaseBillNo,
  purchaseBill,
  purchaseLookups,
  savePurchase,
  updatePurchase,
  type PurchaseInput,
  type PurchaseItem,
  type PurchaseLineInput,
  type PurchaseRow,
  type Supplier,
} from './purchases.ts';
export {
  cancelSale,
  listSales,
  nextSaleBillNo,
  saleBill,
  saleLookups,
  saveSale,
  updateSale,
  type Customer,
  type SaleInput,
  type SaleLineInput,
  type SaleRow,
} from './sales.ts';
export {
  cancelStockJournal,
  listStockJournals,
  nextStockJournalNo,
  saveStockJournal,
  stockJournalLinesOf,
  updateStockJournal,
  type StockJournalInput,
  type StockJournalRow,
} from './stock-journal.ts';
export { stockInHand } from './stock.ts';
export {
  balanceSheetReport,
  dayBook,
  ledgerBalancesAsOn,
  ledgerStatementReport,
  outstandingReport,
  profitLossReport,
  purchaseRegister,
  salesRegister,
  stockRegister,
  stockSummary,
  stockValues,
  trialBalanceReport,
  type DayBookRow,
  type PurchaseRegisterRow,
  type SalesRegisterRow,
  type StockSummaryRow,
} from './reports.ts';
export {
  gstAudit,
  gstr1Report,
  gstr3bReport,
  hsnReport,
  itcReport,
  type GstContext,
  type ItcRow,
} from './gst.ts';
export {
  auditLogFilters,
  createBookUser,
  deleteBookUser,
  listAuditLog,
  listBookUsers,
  listSeries,
  updateBookUser,
  updateSeries,
  type Actor,
  type BookUserRow,
  type LogRow,
  type SeriesRow,
  type UserInput,
} from './tools.ts';
export { exportBackup, restoreBackup, summarizeBackup, type Backup } from './backup.ts';
export { importMda, type MdaImport, type MdaImportResult } from './mda-import.ts';
export {
  accessFor,
  createRole,
  deleteRole,
  listPermissions,
  renameRole,
  roleNames,
  saveRolePages,
  saveUserPages,
  type PermissionsView,
  type RoleInfo,
  type UserAccessInfo,
} from './permissions.ts';
export {
  PL_LEDGER_NAME,
  carryMessages,
  carryOpenings,
  copyMasters,
  previousYear,
  refreshOpenings,
  type CarryResult,
} from './carry-forward.ts';
