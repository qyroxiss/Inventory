// The main screen's frame — approved design D1 "Ledger Desk" (docs/design/MAIN-SCREEN.md).
// MDA's MainShell (main.dart): the NAVIGATION sidebar on the left, a header with the company,
// FY, Quick find, the user and Logout, the page (dashboard, a section, or a screen), and the
// status bar. Quick find opens on Ctrl K.

import { brand } from '@qi/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, Outlet, useLocation, useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { api, unwrap } from '../../api.ts';
import { Dialog } from '../../components/Dialog.tsx';
import { getAccount } from '../../lib/account.ts';
import { setTheme, useTheme } from '../../lib/theme.ts';
import { ALL_ITEMS, NAV, SECTION_ICONS, findItem, findSection, slug, type NavItem } from './nav.ts';

export function MainShell() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const theme = useTheme();
  const me = useQuery({
    queryKey: ['book-me'],
    queryFn: () => unwrap(api.api.book.me.$get()),
    gcTime: 0,
  });
  const account = useQuery({ queryKey: ['account'], queryFn: getAccount });
  const [findOpen, setFindOpen] = useState(false);
  // Phones and tablets: the sidebar is a drawer behind ☰, closed again once a page opens.
  const [menuOpen, setMenuOpen] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => setMenuOpen(false), [pathname]);

  // Ctrl K (⌘K on a Mac) opens Quick find from anywhere on the main screen.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setFindOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /** MDA's Logout: close the books and go back to Company & Year Setup. */
  const logout = async () => {
    await api.api.book.logout.$post().catch(() => undefined);
    queryClient.removeQueries({ queryKey: ['book-me'] });
    queryClient.removeQueries({ queryKey: ['dashboard'] });
    await navigate({ to: '/' });
  };

  const fy = me.data ? `FY ${me.data.yearName}` : '';
  const next = theme === 'dark' ? 'light' : 'dark';
  const name = me.data?.userName ?? '';

  return (
    <div className="flex h-app-screen min-h-[600px] flex-col">
      <div className="flex min-h-0 flex-1">
        <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} />
        {menuOpen && (
          <div
            aria-hidden="true"
            onClick={() => setMenuOpen(false)}
            className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          />
        )}

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <header className="flex h-16 flex-none items-center gap-4 border-b border-border pl-9 pr-8 print:hidden max-lg:gap-2.5 max-lg:px-4 max-sm:px-3">
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-label="Open menu"
              aria-expanded={menuOpen}
              className="grid size-11 flex-none cursor-pointer place-items-center border-[1.5px] border-foreground lg:hidden"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="M4 7h16M4 12h16M4 17h16" />
              </svg>
            </button>
            <div className="flex min-w-0 items-baseline gap-3.5 max-md:flex-col max-md:gap-1">
              <span className="truncate font-serif text-[26px] leading-none max-md:max-w-full max-md:text-[20px]">
                {me.data?.companyName}
              </span>
              {fy && (
                <span className="whitespace-nowrap rounded-full border border-foreground px-2.5 py-1 font-mono text-xs max-md:border-0 max-md:p-0 max-md:text-[11px] max-md:text-muted-foreground">
                  {fy}
                </span>
              )}
            </div>
            <span className="flex-1" />
            <button
              type="button"
              onClick={() => setFindOpen(true)}
              aria-label="Quick find"
              className="flex h-10 w-[300px] flex-none cursor-pointer items-center gap-2.5 border border-border bg-card pl-3 pr-2 text-sm text-muted-foreground max-lg:size-11 max-lg:justify-center max-lg:p-0"
            >
              <SearchIcon size={15} />
              <span className="flex-1 text-left max-lg:hidden">Quick find...</span>
              <kbd className="border border-border px-1.5 py-0.5 font-mono text-[11px] text-foreground max-lg:hidden">
                Ctrl K
              </kbd>
            </button>
            <button
              type="button"
              onClick={() => setTheme(next)}
              aria-label={`Switch to ${next} theme`}
              className="flex h-10 cursor-pointer items-center rounded-full border border-border px-3.5 text-[13px] text-muted-foreground max-md:hidden"
            >
              {theme === 'dark' ? 'Light' : 'Dark'}
            </button>
            {me.data && (
              <div className="flex items-center gap-2.5 pl-1.5 max-md:hidden">
                <span
                  aria-hidden="true"
                  className="grid size-9 place-items-center bg-foreground font-serif text-xl text-card"
                >
                  {name.charAt(0).toUpperCase() || 'A'}
                </span>
                <span className="flex flex-col leading-tight">
                  <span className="text-sm font-semibold">{name}</span>
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {me.data.role}
                  </span>
                </span>
              </div>
            )}
            <button
              type="button"
              onClick={logout}
              title="Sign Out"
              className="flex h-10 flex-none cursor-pointer items-center border-[1.5px] border-foreground px-4 text-sm font-semibold max-lg:h-11 max-sm:px-3"
            >
              Logout
            </button>
          </header>

          <main className="flex min-h-0 flex-1 flex-col overflow-y-auto px-8 py-5 max-lg:px-4 max-lg:py-4 max-sm:px-2 max-sm:py-2">
            <Outlet />
          </main>
        </div>
      </div>

      <footer className="flex h-[30px] flex-none items-center gap-[18px] border-t border-border bg-card px-5 font-mono text-[11px] text-muted-foreground print:hidden">
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className="size-[7px] rounded-full bg-primary" />
          Ready
        </span>
        <span>{brand.appName}</span>
        <span className="flex-1" />
        {account.data && <span className="truncate max-md:hidden">{account.data.email}</span>}
        <span>
          {fy}&nbsp;&nbsp;·&nbsp;&nbsp;v{brand.version}
        </span>
      </footer>

      <QuickFind
        open={findOpen}
        onClose={() => setFindOpen(false)}
        onOpen={(item) => {
          setFindOpen(false);
          void navigate({ to: '/app/$screen', params: { screen: item.slug } });
        }}
      />
    </div>
  );
}

/**
 * MDA's NAVIGATION sidebar on ruled paper. The section you are in is highlighted and opens
 * its items underneath; MDA's own placeholders carry "Not built yet".
 */
function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  // Read the current screen/section from the URL itself, not route params — Group Master and
  // Sub Group Master are their own routes (not the generic /app/$screen placeholder), so they
  // never populate a `screen` param, and relying on it left the sidebar stuck on "Dashboard".
  const location = useLocation();
  const segments = location.pathname
    .replace(/^\/app\/?/, '')
    .split('/')
    .filter(Boolean);
  const screenSlug = segments[0] === 'section' ? undefined : segments[0];
  const sectionSlug = segments[0] === 'section' ? segments[1] : undefined;
  const here = sectionSlug
    ? findSection(sectionSlug)?.label
    : screenSlug
      ? findItem(screenSlug)?.section
      : 'Dashboard';

  return (
    <nav
      aria-label="Navigation"
      // Tapping any link closes the drawer, even one to the page already open.
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('a')) onClose();
      }}
      className={`relative flex min-h-0 flex-[0_0_272px] flex-col border-r border-border bg-card bg-[repeating-linear-gradient(to_bottom,transparent_0_39px,var(--ledger-ruled)_39px_40px)] print:hidden max-lg:fixed max-lg:inset-y-0 max-lg:left-0 max-lg:z-40 max-lg:w-[288px] max-lg:max-w-[85vw] max-lg:shadow-2xl max-lg:transition-transform ${
        open ? '' : 'max-lg:invisible max-lg:-translate-x-full'
      }`}
    >
      <div aria-hidden="true" className="absolute inset-y-0 left-11 w-px bg-ledger-margin" />
      <div aria-hidden="true" className="absolute inset-y-0 left-12 w-px bg-ledger-margin" />
      <div className="flex h-16 flex-none items-center border-b border-border pl-16 pr-5 max-lg:pr-3">
        <span className="flex-1 font-serif text-[28px] leading-none">
          {brand.appName.slice(0, Math.ceil(brand.appName.length / 2))}
          <span className="italic">
            {brand.appName.slice(Math.ceil(brand.appName.length / 2))}.
          </span>
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close menu"
          className="grid size-11 cursor-pointer place-items-center border-[1.5px] border-foreground lg:hidden"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
      </div>
      <span className="pb-2 pl-16 pr-5 pt-5 font-mono text-[11px] tracking-[0.14em] text-muted-foreground">
        NAVIGATION
      </span>
      <div className="min-h-0 flex-1 overflow-y-auto pb-4">
        {NAV.map((s, i) => {
          const on = s.label === here;
          const row = `grid min-h-11 w-full grid-cols-[26px_22px_minmax(0,1fr)] items-center gap-3 pl-3 pr-4 text-[15px] ${
            on ? 'bg-accent font-semibold' : ''
          }`;
          const inner = (
            <>
              <span
                className={`text-right font-mono text-[11px] ${on ? 'text-primary-text' : 'text-muted-foreground'}`}
              >
                {String(i + 1).padStart(2, '0')}
              </span>
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                className={on ? 'text-primary-text' : ''}
              >
                <path d={SECTION_ICONS[i]} />
              </svg>
              <span className="truncate">{s.label}</span>
            </>
          );
          return (
            <div key={s.label} className="flex flex-col">
              {i === 0 ? (
                // exact: otherwise the router counts every /app/... page as Dashboard's own and
                // marks it current for screen readers too.
                <Link
                  to="/app"
                  activeOptions={{ exact: true }}
                  aria-current={on ? 'page' : undefined}
                  className={row}
                >
                  {inner}
                </Link>
              ) : (
                <Link
                  to="/app/section/$section"
                  params={{ section: slug(s.label) }}
                  aria-current={on ? 'page' : undefined}
                  className={row}
                >
                  {inner}
                </Link>
              )}
              {on && s.groups.length > 0 && (
                <div className="flex flex-col pb-2.5 pt-0.5">
                  {s.groups.map((g) => (
                    <div key={g.label || s.label} className="flex flex-col">
                      {g.label && (
                        <span className="pb-1 pl-[98px] pr-4 pt-2.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                          {g.label}
                        </span>
                      )}
                      {g.items.map((label) => {
                        const item = findItem(slug(label))!;
                        const active = screenSlug === item.slug;
                        return (
                          <Link
                            key={label}
                            to="/app/$screen"
                            params={{ screen: item.slug }}
                            aria-current={active ? 'page' : undefined}
                            className={`flex min-h-[34px] items-center justify-between gap-2 pl-[98px] pr-4 text-sm hover:underline hover:underline-offset-4 ${
                              item.built ? '' : 'text-muted-foreground'
                            } ${active ? 'font-semibold' : ''}`}
                          >
                            <span className="truncate">{label}</span>
                            {!item.built && <NotBuiltTag />}
                          </Link>
                        );
                      })}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </nav>
  );
}

export const NotBuiltTag = () => (
  <span className="whitespace-nowrap border border-border px-[5px] py-px font-mono text-[9px] text-muted-foreground">
    Not built yet
  </span>
);

export const Icon = ({
  d,
  size = 18,
  width = 1.7,
}: {
  d: string;
  size?: number;
  width?: number;
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={width}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    className="flex-none"
  >
    <path d={d} />
  </svg>
);

const SearchIcon = ({ size }: { size: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    aria-hidden="true"
  >
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </svg>
);

/** Quick find: type to find any screen; ↑↓ to move, Enter to open, Esc to close. */
function QuickFind({
  open,
  onClose,
  onOpen,
}: {
  open: boolean;
  onClose: () => void;
  onOpen: (item: NavItem) => void;
}) {
  const [q, setQ] = useState('');
  const [hit, setHit] = useState(0);
  useEffect(() => {
    if (open) {
      setQ('');
      setHit(0);
    }
  }, [open]);

  const needle = q.trim().toLowerCase();
  const hits = ALL_ITEMS.filter(
    (i) =>
      !needle ||
      i.label.toLowerCase().includes(needle) ||
      i.section.toLowerCase().includes(needle) ||
      i.group.toLowerCase().includes(needle),
  );

  return (
    <Dialog open={open} onClose={onClose} title={['Quick', 'find']} className="w-[640px]">
      <div className="mt-3 flex items-center gap-3 border-y-2 border-foreground px-[26px]">
        <SearchIcon size={18} />
        <input
          autoFocus
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setHit(0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setHit((h) => Math.min(h + 1, hits.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setHit((h) => Math.max(h - 1, 0));
            } else if (e.key === 'Enter' && hits[hit]) {
              e.preventDefault();
              onOpen(hits[hit]);
            }
          }}
          placeholder="Quick find..."
          aria-label="Quick find"
          autoComplete="off"
          className="h-14 flex-1 border-0 bg-transparent text-lg outline-none focus-visible:outline-none"
        />
      </div>
      <div className="max-h-[50vh] overflow-y-auto">
        {hits.map((i, k) => (
          <button
            key={i.slug}
            type="button"
            onClick={() => onOpen(i)}
            onMouseEnter={() => setHit(k)}
            className={`flex min-h-[46px] w-full cursor-pointer items-center justify-between gap-3 border-b border-border px-[26px] text-left ${
              k === hit ? 'bg-accent' : ''
            }`}
          >
            <span
              className={`flex items-center gap-2.5 text-[15px] ${i.built ? '' : 'text-muted-foreground'}`}
            >
              {i.label}
              {!i.built && <NotBuiltTag />}
            </span>
            <span className="font-mono text-[11px] text-muted-foreground">
              {i.section}
              {i.group && ` › ${i.group}`}
            </span>
          </button>
        ))}
        {hits.length === 0 && (
          <p className="m-0 px-[26px] py-4 text-sm text-muted-foreground">Nothing matches “{q}”.</p>
        )}
      </div>
      <div className="px-[26px] py-2.5 font-mono text-[11px] text-muted-foreground pointer-coarse:hidden">
        ↑↓ Navigate&nbsp;&nbsp;•&nbsp;&nbsp;Enter Open&nbsp;&nbsp;•&nbsp;&nbsp;Esc Close
      </div>
    </Dialog>
  );
}
