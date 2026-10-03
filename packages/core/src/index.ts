// @qi/core — pure domain logic ported from MDA-Inventory. No IO, no DB, no React.
export { brand } from './brand.ts';
export { round2, roundOff, roundHalfAway } from './round.ts';
export { hashPassword, verifyPassword, isLegacyPassword } from './password.ts';
export { validators } from './validators.ts';
export { parseDate, formatDmy, isInFinancialYear, financialYearLabel } from './dates.ts';
export {
  companyCode,
  companyStatutory,
  companyFieldErrors,
  companyMessages,
  yearCode,
  yearFieldErrors,
  yearMessages,
} from './company.ts';
export {
  loginMessages,
  loginFieldErrors,
  newPasswordErrors,
  SEED_ADMIN,
  ROLES,
} from './book-login.ts';
export {
  VCHR_KINDS,
  emptyDashboard,
  weekLabels,
  grouped,
  inr,
  compact,
  signed,
  pct,
  trends,
  ago,
  type DashboardData,
  type RecentTx,
  type Trend,
} from './dashboard.ts';
export {
  GROUP_TYPES,
  LEDGER_OPTIONS,
  TOP_LEVEL,
  DEFAULT_GROUPS,
  groupMessages,
  groupFieldErrors,
  groupCodePrefix,
  nextCode,
  type GroupType,
  type DefaultGroup,
} from './groups.ts';
