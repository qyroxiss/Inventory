// The dashboard — approved design D1 "Ledger Desk" (docs/design/MAIN-SCREEN.md), sized to fit
// one screen with no scrolling: greeting, MDA's four figures in a ledger strip, "Sales — Last
// 7 Days" beside Recent Transactions (MDA lists the latest 5), and the Quick Actions as one row
// at the bottom. Figures and formats are MDA's (main.dart, dashboard_service.dart); until the
// stock, sales and voucher tables exist every book reports no activity, in MDA's own wording.

import { compact, inr, trends, type Trend } from '@qi/core';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { api, unwrap } from '../../api.ts';
import { Icon } from './MainShell.tsx';
import { ICONS, QUICK_ACTIONS, slug } from './nav.ts';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]; // prettier-ignore

/** MDA's greeting by the hour (main.dart:785-790). */
const greeting = (h: number) =>
  h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';

const PANEL = 'flex min-h-0 flex-col border border-border bg-card';

export function Dashboard() {
  const me = useQuery({
    queryKey: ['book-me'],
    queryFn: () => unwrap(api.api.book.me.$get()),
    gcTime: 0,
  });
  const dash = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => unwrap(api.api.dashboard.$get()),
  });
  const now = new Date();
  const d = dash.data;
  const tr = d ? trends(d) : null;

  const figures: [string, string, Trend | undefined][] = [
    ['Total Stock Value', d ? inr(d.stockValue) : '—', tr?.stock],
    ["Today's Sales", d ? inr(d.todaySales) : '—', tr?.sales],
    ['Pending Bills', d ? String(d.pendingBills) : '—', tr?.bills],
    ['Cash Balance', d ? inr(d.cashBalance) : '—', tr?.cash],
  ];

  return (
    <div className="flex h-full min-h-[540px] flex-col gap-4">
      <div className="flex flex-none items-end justify-between gap-5">
        <div className="flex flex-col gap-1.5">
          <span className="font-mono text-xs uppercase tracking-[0.12em] text-muted-foreground">
            {DAYS[now.getDay()]}, {String(now.getDate()).padStart(2, '0')} {MONTHS[now.getMonth()]}{' '}
            {now.getFullYear()}
          </span>
          <h1 className="m-0 font-serif text-[40px] font-normal leading-none">
            {greeting(now.getHours())}, <span className="italic">{me.data?.userName}</span>
          </h1>
          <p className="m-0 text-sm text-muted-foreground">
            Here's what's happening in your business today.
          </p>
        </div>
        {me.data && (
          <span className="rounded-full border border-foreground px-3 py-[5px] font-mono text-xs">
            FY {me.data.yearName}
          </span>
        )}
      </div>

      <dl className="m-0 grid flex-none grid-cols-4 border-b-[3px] border-t-2 border-double border-b-foreground border-t-foreground bg-card [border-top-style:solid]">
        {figures.map(([title, value, t], i) => (
          <div
            key={title}
            className={`flex flex-col gap-1.5 px-5 pb-[11px] pt-[13px] ${i ? 'border-l border-border' : ''}`}
          >
            <dt className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
              {title}
            </dt>
            <dd className="m-0 font-serif text-[34px] leading-none">{value}</dd>
            <span
              className={`font-mono text-xs ${t?.up === false ? 'text-destructive' : 'text-primary-text'}`}
            >
              {t ? `${t.up ? '▲' : '▼'} ${t.text}` : ' '}
            </span>
          </div>
        ))}
      </dl>

      {dash.isError && (
        <p className="m-0 flex-none text-sm text-muted-foreground">
          Could not read the dashboard figures.{' '}
          <button
            type="button"
            onClick={() => dash.refetch()}
            className="cursor-pointer underline underline-offset-4"
          >
            Try again
          </button>
        </p>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] gap-5">
        <section className={`${PANEL} gap-2.5 px-[22px] pb-3.5 pt-4`}>
          <div className="flex flex-none items-start justify-between">
            <div className="flex flex-col gap-[3px]">
              <h2 className="m-0 font-serif text-2xl font-normal leading-none">
                Sales — Last 7 Days
              </h2>
              <span className="text-xs text-muted-foreground">in Indian Rupees (₹)</span>
            </div>
            <span className="border border-border px-2.5 py-[3px] font-mono text-[11px]">
              This Week
            </span>
          </div>
          <WeekBars values={d?.weekValues ?? []} />
          <div className="grid flex-none grid-cols-7 gap-3.5 border-t-[1.5px] border-foreground pt-[7px]">
            {(d?.weekLabels ?? []).map((l, i) => (
              <span
                key={i}
                className={`text-center font-mono text-[11px] ${i === 6 ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}
              >
                {l}
              </span>
            ))}
          </div>
        </section>

        <section className={`${PANEL} px-[22px] pb-2 pt-4`}>
          <div className="flex flex-none items-baseline justify-between border-b-2 border-foreground pb-2.5">
            <h2 className="m-0 font-serif text-2xl font-normal leading-none">
              Recent Transactions
            </h2>
            {/* In MDA "View all →" is a label only; it opens nothing (quirk Q-36). */}
            <span className="text-[13px] text-muted-foreground">View all →</span>
          </div>
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            {d?.recent.map((r, i) => (
              <div
                key={i}
                className="grid max-h-[58px] min-h-11 flex-[1_0_44px] grid-cols-[26px_minmax(0,1fr)_auto] items-center gap-3 border-b border-border"
              >
                <span
                  aria-hidden="true"
                  className={`grid size-6 place-items-center border ${r.isIn ? 'border-primary-text text-primary-text' : 'border-destructive text-destructive'}`}
                >
                  <Icon d={r.isIn ? ICONS.moneyIn : ICONS.moneyOut} size={13} width={2.2} />
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="text-sm font-semibold">{r.type}</span>
                  <span className="truncate text-xs text-muted-foreground">{r.party}</span>
                </span>
                <span className="flex flex-col items-end">
                  <span
                    className={`font-mono text-sm font-medium ${r.isIn ? 'text-primary-text' : 'text-destructive'}`}
                  >
                    {r.isIn ? '+' : '−'}
                    {inr(r.amount)}
                  </span>
                  <span className="font-mono text-[11px] text-muted-foreground">{r.when}</span>
                </span>
              </div>
            ))}
            {d && d.recent.length === 0 && (
              <p className="m-0 py-6 text-sm text-muted-foreground">No transactions yet.</p>
            )}
          </div>
        </section>
      </div>

      <section
        aria-label="Quick Actions"
        className="grid flex-none grid-cols-[auto_repeat(6,minmax(0,1fr))] gap-2.5"
      >
        <h2 className="m-0 self-center pr-1.5 font-mono text-[11px] font-medium leading-normal tracking-[0.12em] text-primary-text">
          QUICK
          <br />
          ACTIONS
        </h2>
        {QUICK_ACTIONS.map((a) => {
          const main = a.label === 'New Sale';
          return (
            <Link
              key={a.label}
              to="/app/$screen"
              params={{ screen: slug(a.screen) }}
              className={`flex h-[54px] items-center gap-2.5 border-[1.5px] px-3.5 ${
                main
                  ? 'border-foreground bg-foreground text-card'
                  : 'border-border bg-card text-foreground hover:border-foreground'
              }`}
            >
              <Icon d={ICONS[a.icon]} size={19} />
              <span className="truncate text-sm font-semibold">{a.label}</span>
            </Link>
          );
        })}
      </section>
    </div>
  );
}

/** The 7-day bars; today in green, each bar labelled in MDA's short form (₹32K → "32K"). */
function WeekBars({ values }: { values: number[] }) {
  const max = Math.max(...values, 0) || 1;
  return (
    <div className="grid min-h-[70px] flex-1 grid-cols-7 items-end gap-3.5 bg-[repeating-linear-gradient(to_top,var(--border)_0_1px,transparent_1px_40px)] pt-[18px]">
      {values.map((v, i) => (
        <div key={i} className="flex h-full flex-col items-center justify-end gap-[5px]">
          <span
            className={`font-mono text-[10px] ${i === 6 ? 'text-primary-text' : 'text-muted-foreground'}`}
          >
            {compact(v)}
          </span>
          <div
            title={inr(v)}
            className={`w-full max-w-11 ${i === 6 ? 'bg-primary' : 'bg-border'}`}
            style={{ height: `max(2px, ${Math.round((v / max) * 100)}%)` }}
          />
        </div>
      ))}
    </div>
  );
}
