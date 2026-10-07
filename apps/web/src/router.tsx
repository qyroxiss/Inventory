// Screen map, following MDA's flow (docs/LOGIC-SPEC.md §1, §8):
//
//   /signin          account sign-in / sign-up             (web & mobile only — layer 1)
//   /                company & year + book login, side by side (MDA CompanySetupPage + AuthPage — layer 2)
//   /company/new     new company                           (MDA CompanyCreationPage)
//   /years           manage years                          (MDA CompanyYearPage)
//   /app             main screen: dashboard                (MDA MainShell)
//   /app/section/<s> a section's page: its screens as cards (MDA's section page)
//   /app/<screen>    a menu item's screen (placeholder until built)
//
// Guards send you back a step when a session is missing, as MDA's navigation does.

import { QueryClient } from '@tanstack/react-query';
import {
  Outlet,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  redirect,
} from '@tanstack/react-router';
import { api } from './api.ts';
import { Toaster } from './components/Toast.tsx';
import { AccountScreen } from './screens/AccountScreen.tsx';
import { CompanyScreen } from './screens/company/CompanyScreen.tsx';
import { YearsScreen } from './screens/company/YearsScreen.tsx';
import { BooksScreen } from './screens/books/BooksScreen.tsx';
import { Dashboard } from './screens/main/Dashboard.tsx';
import { MainShell } from './screens/main/MainShell.tsx';
import { ScreenPlaceholder } from './screens/main/ScreenPlaceholder.tsx';
import { SectionPage } from './screens/main/SectionPage.tsx';
import { GroupMasterScreen } from './screens/masters/GroupMasterScreen.tsx';
import { LedgerCreationScreen } from './screens/masters/LedgerCreationScreen.tsx';
import { SubGroupMasterScreen } from './screens/masters/SubGroupMasterScreen.tsx';
import { MiscMasterScreen } from './screens/masters/MiscMasterScreen.tsx';
import { SaleTypeScreen } from './screens/masters/SaleTypeScreen.tsx';
import { CashBankTab } from './screens/vouchers/CashBankTab.tsx';
import { JournalTab } from './screens/vouchers/JournalTab.tsx';
import { NoteTab } from './screens/vouchers/NoteTab.tsx';
import { PurchaseInvoiceScreen } from './screens/transactions/PurchaseInvoiceScreen.tsx';
import { SalesInvoiceScreen } from './screens/transactions/SalesInvoiceScreen.tsx';
import { StockJournalScreen } from './screens/transactions/StockJournalScreen.tsx';
import {
  DayBookScreen,
  SalesRegisterScreen,
  StockSummaryScreen,
} from './screens/reports/ListReports.tsx';
import { BalanceSheetScreen, ProfitLossScreen } from './screens/reports/Statements.tsx';
import {
  BackupScreen,
  CompanySettingsScreen,
  ImportDataScreen,
  LogsScreen,
} from './screens/tools/ToolsScreens.tsx';
import { UserManagementScreen } from './screens/tools/UserManagementScreen.tsx';
import {
  GstAuditScreen,
  Gstr1Screen,
  Gstr3bScreen,
  HsnSummaryScreen,
  ItcScreen,
} from './screens/gst/GstReports.tsx';
import { StockGroupScreen } from './screens/masters/StockGroupScreen.tsx';
import { StockItemScreen } from './screens/masters/StockItemScreen.tsx';
import { StockSubGroupScreen } from './screens/masters/StockSubGroupScreen.tsx';

export const queryClient = new QueryClient();

const rootRoute = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: () => (
    <>
      <Outlet />
      <Toaster />
    </>
  ),
});

/** Layer 1: an account session must exist (always true on desktop, where it is 'local'). */
const requireAccount = async () => {
  const res = await api.api.account.$get();
  if (res.status === 401) throw redirect({ to: '/signin' });
};

/** Layer 2: a book session must exist, and the forced password change must be done (MDA blocks until it is). */
const requireBook = async () => {
  const res = await api.api.book.me.$get();
  if (!res.ok || (await res.json()).mustChangePassword) throw redirect({ to: '/' });
};

const signinRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/signin',
  // Already signed in (or desktop, where there is no account layer): straight to the books.
  beforeLoad: async () => {
    const res = await api.api.account.$get();
    if (res.ok) throw redirect({ to: '/' });
  },
  component: AccountScreen,
});

const booksRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: requireAccount,
  component: BooksScreen,
});

const newCompanyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/company/new',
  beforeLoad: requireAccount,
  component: CompanyScreen,
});

const yearsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/years',
  beforeLoad: requireAccount,
  component: YearsScreen,
});

const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/app',
  beforeLoad: async () => {
    await requireAccount();
    await requireBook();
  },
  component: MainShell,
});

const dashboardRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/',
  component: Dashboard,
});

const sectionRoute = createRoute({
  getParentRoute: () => appRoute,
  path: 'section/$section',
  component: SectionPage,
});

const groupMasterRoute = createRoute({
  getParentRoute: () => appRoute,
  path: 'group-master',
  component: GroupMasterScreen,
});

const subGroupMasterRoute = createRoute({
  getParentRoute: () => appRoute,
  path: 'sub-group-master',
  component: SubGroupMasterScreen,
});

const ledgerCreationRoute = createRoute({
  getParentRoute: () => appRoute,
  path: 'ledger-creation',
  component: LedgerCreationScreen,
});

const unitMasterRoute = createRoute({
  getParentRoute: () => appRoute,
  path: 'unit-master',
  // Same screen as Godown: the key gives each its own fresh form when switching between them.
  component: () => <MiscMasterScreen key="unit" kind="unit" />,
});

const godownRoute = createRoute({
  getParentRoute: () => appRoute,
  path: 'godown',
  component: () => <MiscMasterScreen key="godown" kind="godown" />,
});

const stockGroupRoute = createRoute({
  getParentRoute: () => appRoute,
  path: 'stock-group',
  component: StockGroupScreen,
});

const stockSubGroupRoute = createRoute({
  getParentRoute: () => appRoute,
  path: 'stock-sub-group',
  component: StockSubGroupScreen,
});

const stockItemRoute = createRoute({
  getParentRoute: () => appRoute,
  path: 'stock-item',
  component: StockItemScreen,
});

const saleTypeRoute = createRoute({
  getParentRoute: () => appRoute,
  path: 'sale-type',
  component: SaleTypeScreen,
});

// Accounting Vouchers: MDA's one page with five tabs; each tab has the menu item's own address.
const voucherRoute = (path: string, component: () => React.JSX.Element) =>
  createRoute({ getParentRoute: () => appRoute, path, component });
const receiptRoute = voucherRoute('receipt', () => <CashBankTab key="receipt" kind="receipt" />);
const paymentRoute = voucherRoute('payment', () => <CashBankTab key="payment" kind="payment" />);
const journalRoute = voucherRoute('journal-voucher', () => <JournalTab />);
const debitNoteRoute = voucherRoute('debit-note', () => <NoteTab key="debit" kind="debit" />);
const creditNoteRoute = voucherRoute('credit-note', () => <NoteTab key="credit" kind="credit" />);

const purchaseInvoiceRoute = createRoute({
  getParentRoute: () => appRoute,
  path: 'purchase-invoice',
  component: PurchaseInvoiceScreen,
});

const salesInvoiceRoute = createRoute({
  getParentRoute: () => appRoute,
  path: 'sales-invoice',
  component: SalesInvoiceScreen,
});

const stockJournalRoute = createRoute({
  getParentRoute: () => appRoute,
  path: 'stock-journal',
  component: StockJournalScreen,
});

// Reports: each menu item's own address.
const reportRoute = (path: string, component: () => React.JSX.Element) =>
  createRoute({ getParentRoute: () => appRoute, path, component });
const reportRoutes = [
  reportRoute('stock-summary', StockSummaryScreen),
  reportRoute('profit-loss', ProfitLossScreen),
  reportRoute('balance-sheet', BalanceSheetScreen),
  reportRoute('day-book', DayBookScreen),
  reportRoute('sales-register', SalesRegisterScreen),
  reportRoute('gstr-1', Gstr1Screen),
  reportRoute('gstr-3b', Gstr3bScreen),
  reportRoute('gst-audit', GstAuditScreen),
  reportRoute('hsn-summary', HsnSummaryScreen),
  reportRoute('input-tax-credit', ItcScreen),
  reportRoute('backup-data', BackupScreen),
  reportRoute('user-management', UserManagementScreen),
  reportRoute('company-settings', CompanySettingsScreen),
  reportRoute('import-data', ImportDataScreen),
  reportRoute('logs', LogsScreen),
];

const screenRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '$screen',
  component: ScreenPlaceholder,
});

export const router = createRouter({
  routeTree: rootRoute.addChildren([
    signinRoute,
    booksRoute,
    newCompanyRoute,
    yearsRoute,
    appRoute.addChildren([
      dashboardRoute,
      sectionRoute,
      groupMasterRoute,
      subGroupMasterRoute,
      ledgerCreationRoute,
      unitMasterRoute,
      godownRoute,
      stockGroupRoute,
      stockSubGroupRoute,
      stockItemRoute,
      saleTypeRoute,
      receiptRoute,
      paymentRoute,
      journalRoute,
      debitNoteRoute,
      creditNoteRoute,
      purchaseInvoiceRoute,
      salesInvoiceRoute,
      stockJournalRoute,
      ...reportRoutes,
      screenRoute,
    ]),
  ]),
  context: { queryClient },
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
