// The company & year screen with the book login beside it — approved design A6
// (docs/design/AUTH-SCREENS.md). MDA shows these as two pages, company_setup_page.dart then
// auth_page.dart; the design puts them side by side. Selection follows MDA: on open the first
// company and its first year are chosen; picking another company chooses its first year.

import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { ApiError, api, unwrap } from '../../api.ts';
import { AppHeader } from '../../components/AppHeader.tsx';
import { BookIndex } from './BookIndex.tsx';
import { NothingToOpen, SignInPanel } from './SignInPanel.tsx';
import { SIGN_IN_ID } from './types.ts';

export function BooksScreen() {
  const navigate = useNavigate();
  const search = useSearch({ from: '/' });
  const index = useQuery({
    queryKey: ['book-index'],
    queryFn: () => unwrap(api.api['book-index'].$get()),
  });
  const [picked, setPicked] = useState<{ companyId: string; yearId: string | null } | null>(null);
  const passRef = useRef<HTMLInputElement>(null);

  const accountGone = index.error instanceof ApiError && index.error.status === 401;
  useEffect(() => {
    if (accountGone) void navigate({ to: '/signin' });
  }, [accountGone, navigate]);

  const companies = index.data ?? [];
  // Without a pick, the company in the address (Change Year, back from Manage Years), else the first.
  const company =
    companies.find((c) => c.id === (picked?.companyId ?? search.company)) ?? companies[0] ?? null;
  const year =
    company?.years.find(
      (y) => y.id === (picked?.companyId === company.id ? picked.yearId : null),
    ) ??
    company?.years[0] ??
    null;

  const pickCompany = (id: string) => {
    if (id === company?.id) return; // same company: keep its year
    const next = companies.find((c) => c.id === id);
    setPicked({ companyId: id, yearId: next?.years[0]?.id ?? null });
  };
  const pickYear = (id: string) => {
    if (!company) return;
    setPicked({ companyId: company.id, yearId: id });
    setTimeout(() => {
      // Phones and tablets: back up to the sign-in form above the list, company name in view.
      if (!matchMedia('(min-width: 1024px)').matches)
        document.getElementById(SIGN_IN_ID)?.scrollIntoView({ block: 'start' });
      passRef.current?.focus({ preventScroll: true });
    }, 0);
  };

  return (
    <div className="flex h-app-screen min-h-[600px] flex-col max-sm:min-h-0">
      <AppHeader />
      <div className="flex min-h-0 flex-1 max-lg:flex-col max-lg:overflow-y-auto">
        {index.isPending ? (
          <p className="m-auto font-mono text-sm text-muted-foreground">Loading…</p>
        ) : index.isError ? (
          <div className="m-auto flex flex-col items-center gap-3">
            <p className="m-0 text-[15px]">{index.error.message}</p>
            <button
              type="button"
              onClick={() => index.refetch()}
              className="min-h-11 cursor-pointer text-sm underline underline-offset-4"
            >
              Try again
            </button>
          </div>
        ) : (
          <>
            <BookIndex
              companies={companies}
              companyId={company?.id ?? null}
              yearId={year?.id ?? null}
              onPickCompany={pickCompany}
              onPickYear={pickYear}
              onNewCompany={() => void navigate({ to: '/company/new' })}
              onManageYears={(id) =>
                void navigate({ to: '/years', search: id ? { company: id } : {} })
              }
            />
            {company && year ? (
              <SignInPanel key={year.id} company={company} year={year} passRef={passRef} />
            ) : company ? (
              <NothingToOpen title={['No', 'Year']}>
                {company.compName} has no year yet. Add one with{' '}
                <button
                  type="button"
                  onClick={() => void navigate({ to: '/years', search: { company: company.id } })}
                  className="cursor-pointer font-semibold text-foreground underline underline-offset-4"
                >
                  Manage Years
                </button>
                , then sign in here.
              </NothingToOpen>
            ) : (
              <NothingToOpen title={['No', 'Company']}>
                Create one with New Company, add its year with Manage Years, then sign in here.
              </NothingToOpen>
            )}
          </>
        )}
      </div>
    </div>
  );
}
