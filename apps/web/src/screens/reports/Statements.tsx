// Profit & Loss and Balance Sheet (docs/design/REPORTS.md): the usual two-sided statements as
// on a date, each top-level group with its ledgers beneath it. Side by side on laptops; one
// above the other on tablets and phones.

import { reportMessages as rm, type StatementGroup } from '@qi/core';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { api, unwrap } from '../../api.ts';
import { dmyDash } from '../transactions/shared.tsx';
import { PeriodDate, ReportPage, amt, defaultPeriod, useBook } from './shared.tsx';

type Line = {
  label: string;
  amount: number;
  ledgers?: StatementGroup['ledgers'];
  strong?: boolean;
};

const fromGroups = (gs: StatementGroup[], prefix: string): Line[] =>
  gs.map((g) => ({ label: `${prefix} ${g.grpName}`, amount: g.amount, ledgers: g.ledgers }));

/** One side of a statement: its heading, its lines and its total at the foot. */
function Side({ head, lines, total }: { head: string; lines: Line[]; total: number }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col border border-border bg-card print:border-black print:bg-white">
      <div className="flex justify-between border-b-2 border-foreground bg-muted px-3 py-2 font-mono text-[11px] uppercase tracking-[0.06em] text-muted-foreground print:border-black print:bg-white print:text-black">
        <span>{head}</span>
        <span>Amount (₹)</span>
      </div>
      <div className="flex flex-1 flex-col">
        {lines.map((l, i) => (
          <div key={i} className="border-b border-border/60 px-3 py-1.5 print:break-inside-avoid">
            <div
              className={`flex justify-between gap-3 text-[14px] ${l.strong ? 'font-semibold' : ''}`}
            >
              <span className="min-w-0 truncate">{l.label}</span>
              <span className="font-mono">{amt(l.amount)}</span>
            </div>
            {l.ledgers?.map((x) => (
              <div
                key={x.accCode}
                className="flex justify-between gap-3 pl-5 pr-24 text-[12.5px] text-muted-foreground print:text-black max-sm:pr-16"
              >
                <span className="min-w-0 truncate">{x.accName}</span>
                <span className="font-mono">{amt(x.amount)}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="flex justify-between border-t-2 border-foreground px-3 py-2 text-[14px] font-bold print:border-black">
        <span>Total</span>
        <span className="font-mono">{amt(total)}</span>
      </div>
    </div>
  );
}

const TwoSides = ({ title, children }: { title?: string; children: ReactNode }) => (
  <div className="flex flex-col gap-1.5">
    {title && (
      <h2 className="m-0 font-mono text-xs font-medium uppercase tracking-[0.12em] text-primary-text print:text-black">
        {title}
      </h2>
    )}
    <div className="flex gap-3 max-lg:flex-col print:flex-row">{children}</div>
  </div>
);

/** The "As on" date, set to today (inside the open year) once the book is known. */
function useAsOn() {
  const book = useBook();
  const [to, setTo] = useState('');
  useEffect(() => {
    if (book && !to) setTo(defaultPeriod(book.fyFrom, book.fyTo).to);
  }, [book]);
  return [to, setTo, book] as const;
}

export function ProfitLossScreen() {
  const [to, setTo, book] = useAsOn();
  const q = useQuery({
    queryKey: ['report', 'profit-loss', to],
    enabled: !!to,
    queryFn: () => unwrap(api.api.reports['profit-loss'].$get({ query: { to } })),
  });
  const r = q.data;
  const subtitle = to ? `From ${dmyDash(book?.fyFrom ?? '')} to ${dmyDash(to)}` : '';
  return (
    <ReportPage
      title={['Profit &', 'Loss']}
      subtitle={subtitle}
      filters={<PeriodDate id="rp-to" label="Up to" value={to} onChange={setTo} />}
    >
      {r && (
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto print:overflow-visible">
          <TwoSides title="Trading Account">
            <Side
              head="Particulars (Dr)"
              total={r.trading.total}
              lines={[
                { label: 'To Opening Stock', amount: r.trading.openingStock },
                ...fromGroups(r.trading.debit, 'To'),
                ...(r.trading.gross > 0
                  ? [{ label: 'To Gross Profit c/o', amount: r.trading.gross, strong: true }]
                  : []),
              ]}
            />
            <Side
              head="Particulars (Cr)"
              total={r.trading.total}
              lines={[
                ...fromGroups(r.trading.credit, 'By'),
                { label: 'By Closing Stock', amount: r.trading.closingStock },
                ...(r.trading.gross < 0
                  ? [{ label: 'By Gross Loss c/o', amount: -r.trading.gross, strong: true }]
                  : []),
              ]}
            />
          </TwoSides>
          <TwoSides title="Profit & Loss Account">
            <Side
              head="Particulars (Dr)"
              total={r.pl.total}
              lines={[
                ...(r.trading.gross < 0
                  ? [{ label: 'To Gross Loss b/f', amount: -r.trading.gross }]
                  : []),
                ...fromGroups(r.pl.debit, 'To'),
                ...(r.pl.net > 0
                  ? [{ label: 'To Net Profit', amount: r.pl.net, strong: true }]
                  : []),
              ]}
            />
            <Side
              head="Particulars (Cr)"
              total={r.pl.total}
              lines={[
                ...(r.trading.gross > 0
                  ? [{ label: 'By Gross Profit b/f', amount: r.trading.gross }]
                  : []),
                ...fromGroups(r.pl.credit, 'By'),
                ...(r.pl.net < 0
                  ? [{ label: 'By Net Loss', amount: -r.pl.net, strong: true }]
                  : []),
              ]}
            />
          </TwoSides>
          <Note />
        </div>
      )}
    </ReportPage>
  );
}

export function BalanceSheetScreen() {
  const [to, setTo] = useAsOn();
  const q = useQuery({
    queryKey: ['report', 'balance-sheet', to],
    enabled: !!to,
    queryFn: () => unwrap(api.api.reports['balance-sheet'].$get({ query: { to } })),
  });
  const r = q.data;
  return (
    <ReportPage
      title={['Balance', 'Sheet']}
      subtitle={to ? `As on ${dmyDash(to)}` : ''}
      filters={<PeriodDate id="rp-to" label="As on" value={to} onChange={setTo} />}
    >
      {r && (
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto print:overflow-visible">
          <TwoSides>
            <Side
              head="Liabilities"
              total={r.total}
              lines={[
                ...fromGroups(r.liabilities, ''),
                { label: 'Profit & Loss A/c', amount: r.profit, strong: true },
                ...(r.difference > 0 ? [{ label: rm.differenceLabel, amount: r.difference }] : []),
              ]}
            />
            <Side
              head="Assets"
              total={r.total}
              lines={[
                ...fromGroups(r.assets, ''),
                { label: 'Closing Stock', amount: r.closingStock },
                ...(r.difference < 0 ? [{ label: rm.differenceLabel, amount: -r.difference }] : []),
              ]}
            />
          </TwoSides>
          <Note />
        </div>
      )}
    </ReportPage>
  );
}

const Note = () => (
  <p className="m-0 text-xs text-muted-foreground print:text-black">
    Stock is valued at each item's purchase rate (its sale rate when it has none). Cancelled
    vouchers are left out.
  </p>
);
