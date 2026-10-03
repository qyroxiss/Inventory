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
    appRoute.addChildren([dashboardRoute, sectionRoute, screenRoute]),
  ]),
  context: { queryClient },
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
