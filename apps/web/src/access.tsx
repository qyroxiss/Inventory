// Role Permissions in the app (core permissions.ts): which pages the signed-in user may open, and
// whether the page on screen is View only. The server enforces the same rules; this keeps the
// menu, Quick find and the buttons in step with them.
//
//   - useAccess(): the user's level on every page (from /api/book/access).
//   - PageAccessProvider / useCanEdit(): the page on screen, and whether its saves are allowed.
//     A screen opened over another one (Ledger Creation from "+ New") names its own page.

import { canEdit, canView, type PageAccess } from '@qi/core';
import { useQuery } from '@tanstack/react-query';
import { createContext, useContext, type ReactNode } from 'react';
import { api, unwrap } from './api.ts';
import { findItem } from './screens/main/nav.ts';

export const ACCESS_KEY = ['access'] as const;

export function useAccess() {
  const q = useQuery({
    queryKey: ACCESS_KEY,
    queryFn: () => unwrap(api.api.book.access.$get()),
    // Changes by the Admin reach an open screen within a minute, and on the next page change.
    staleTime: 60_000,
  });
  const pages: PageAccess | null = q.data?.pages ?? null;
  return {
    ready: !!pages,
    pages,
    /** Until the levels arrive, everything shows; the server still refuses what isn't allowed. */
    view: (page: string) => !pages || canView(pages, page),
    edit: (page: string) => !pages || canEdit(pages, page),
  };
}

/** The menu page an address belongs to: /app → Dashboard, /app/sales-invoice → Sales Invoice.
 *  Section pages and unknown addresses belong to none. */
export function pageOfPath(pathname: string): string | null {
  const rest = pathname.replace(/\/+$/, '').replace(/^\/app/, '');
  if (rest === '') return 'Dashboard';
  if (rest.startsWith('/section/')) return null;
  return findItem(rest.slice(1).split('/')[0] ?? '')?.label ?? null;
}

const PageContext = createContext<string | null>(null);

export function PageAccessProvider({ page, children }: { page: string | null; children: ReactNode }) {
  return <PageContext.Provider value={page}>{children}</PageContext.Provider>;
}

/** May the user save, change or cancel on this page (or on `page`, when named)? */
export function useCanEdit(page?: string) {
  const current = useContext(PageContext);
  const { edit } = useAccess();
  const p = page ?? current;
  return p ? edit(p) : true;
}
