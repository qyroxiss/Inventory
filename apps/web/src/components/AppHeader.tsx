// The thin strip at the top: product name (unbranded for now), today's date, the signed-in
// account with Logout (web only), and the theme switch.

import { brand } from '@qi/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { api } from '../api.ts';
import { getAccount, logoutAccount } from '../lib/account.ts';
import { setTheme, useTheme } from '../lib/theme.ts';

const today = () =>
  new Date()
    .toLocaleDateString('en-GB', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    })
    .replace(/^(\w+) /, '$1, ');

/** Signed-in account and its Logout. Shows nothing when signed out, or on desktop. */
function AccountChip() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const account = useQuery({ queryKey: ['account'], queryFn: getAccount });
  if (!account.data) return null;

  const logout = async () => {
    // Close the open book first (MDA's Logout), then the account.
    await api.api.book.logout.$post().catch(() => undefined);
    await logoutAccount().catch(() => undefined);
    queryClient.clear();
    await navigate({ to: '/signin' });
  };

  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className="truncate font-mono text-[13px] text-muted-foreground max-md:hidden">
        {account.data.email}
      </span>
      <button
        type="button"
        onClick={logout}
        className="flex h-10 cursor-pointer items-center rounded-full border border-border px-3.5 text-[13px] text-muted-foreground"
      >
        Logout
      </button>
    </div>
  );
}

export function AppHeader() {
  const theme = useTheme();
  const next = theme === 'dark' ? 'light' : 'dark';
  return (
    <header className="grid h-16 flex-none grid-cols-[1fr_auto_1fr] items-center gap-4 border-b border-border px-12 max-lg:px-6 max-md:flex max-md:justify-between max-md:px-4">
      <span className="font-mono text-[13px] font-medium uppercase tracking-[0.14em]">
        {brand.appName}
      </span>
      <span className="font-mono text-[13px] text-muted-foreground max-md:hidden">{today()}</span>
      <div className="flex min-w-0 items-center justify-end gap-3">
        <AccountChip />
        <button
          type="button"
          onClick={() => setTheme(next)}
          aria-label={`Switch to ${next} theme`}
          className="flex h-10 cursor-pointer items-center gap-2 rounded-full border border-border px-3.5 text-[13px] text-muted-foreground"
        >
          {theme === 'dark' ? (
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
            </svg>
          ) : (
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
            </svg>
          )}
          <span className="max-sm:hidden">{theme === 'dark' ? 'Light' : 'Dark'}</span>
        </button>
      </div>
    </header>
  );
}
