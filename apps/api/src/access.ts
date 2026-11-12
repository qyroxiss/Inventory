// Role Permissions on the server (core permissions.ts): which page each API call belongs to, and
// whether it only reads ('view') or changes something ('full').
//
// Lookups that many screens share stay open to anyone signed in to the book: master lists (a
// Sales Invoice needs the ledgers even when Ledger Creation is hidden), settings, purchase setup
// (also used by Stock Journal), voucher lines (also used by Day Book) and the City list. Hiding a
// page closes its own lists, bills and prints; View only closes its saves, changes and cancels.

import { RETURN_KIND_PAGES, VOUCHER_TYPE_PAGES } from '@qi/core';

export type Need = 'view' | 'full';
/** The call is allowed when the user has `need` on at least one of `pages`. */
export type Rule = { pages: string[]; need: Need };

const VOUCHER_PAGES = [...new Set(Object.values(VOUCHER_TYPE_PAGES))];

/** Master paths and their pages: changes need full use; reading stays open. */
const MASTERS: [prefix: string, page: string][] = [
  ['/api/groups', 'Group Master'],
  ['/api/sub-groups', 'Sub Group Master'],
  ['/api/ledgers', 'Ledger Creation'],
  ['/api/misc-masters/unit', 'Unit Master'],
  ['/api/misc-masters/godown', 'Godown'],
  ['/api/stock-groups', 'Stock Group'],
  ['/api/stock-sub-groups', 'Stock Sub Group'],
  ['/api/stock-items', 'Stock Item'],
  ['/api/sale-types', 'Sale Type'],
];

const REPORTS: Record<string, string> = {
  '/api/reports/stock-summary': 'Stock Summary',
  '/api/reports/stock-register': 'Stock Register',
  '/api/reports/sales-register': 'Sales Register',
  '/api/reports/purchase-register': 'Purchase Register',
  '/api/reports/profit-loss': 'Profit & Loss',
  '/api/reports/balance-sheet': 'Balance Sheet',
  '/api/reports/trial-balance': 'Trial Balance',
  '/api/reports/day-book': 'Day Book',
  '/api/reports/ledger-statement': 'Ledger Statement',
  '/api/reports/ledger-statements': 'Ledger Statement',
  '/api/reports/outstanding': 'Outstanding',
  '/api/gst/gstr1': 'GSTR-1',
  '/api/gst/gstr3b': 'GSTR-3B',
  '/api/gst/audit': 'GST Audit',
  '/api/gst/hsn': 'HSN Summary',
  '/api/gst/itc': 'Input Tax Credit',
};

/** What the rule needs to look at besides the method and path. */
export type CallInfo = {
  method: string;
  path: string;
  query: (k: string) => string | undefined;
  /** The JSON body (only read for the few calls whose page depends on it). */
  body: () => Promise<Record<string, unknown>>;
  /** A voucher's type by its id (for changing or cancelling a voucher). */
  voucherType: (id: string) => Promise<string | null>;
};

const under = (path: string, prefix: string) => path === prefix || path.startsWith(prefix + '/');

/** The page rule for one API call, or null when anyone signed in to the book may make it. */
export async function ruleFor(call: CallInfo): Promise<Rule | null> {
  const { method, path } = call;
  const read = method === 'GET';
  const need: Need = read ? 'view' : 'full';
  const rule = (pages: string[]): Rule | null => (pages.length ? { pages, need } : null);

  if (path === '/api/dashboard') return rule(['Dashboard']);

  for (const [prefix, page] of MASTERS) if (under(path, prefix)) return read ? null : rule([page]);

  if (REPORTS[path]) return rule([REPORTS[path]!]);

  // Accounting vouchers. Only the seven accounting types: a bill's, return's or stock journal's
  // voucher (SAL, PUR, STJ…) or an unknown type is never reachable from here (DENY).
  if (under(path, '/api/vouchers')) {
    if (read) {
      if (/^\/api\/vouchers\/[^/]+\/lines$/.test(path)) return null; // Day Book too
      if (path === '/api/vouchers') {
        const types = (call.query('types') ?? '').split(',').filter(Boolean);
        if (types.some((t) => !VOUCHER_TYPE_PAGES[t])) return deny(need);
        return rule([...new Set(types.map((t) => VOUCHER_TYPE_PAGES[t]).filter(isStr))]);
      }
      if (path === '/api/vouchers/next') {
        const page = VOUCHER_TYPE_PAGES[call.query('type') ?? ''];
        return page ? rule([page]) : deny(need);
      }
      if (path === '/api/vouchers/print') {
        const kind = call.query('kind');
        return rule(
          kind === 'receipt' ? ['Receipt'] : kind === 'payment' ? ['Payment'] : VOUCHER_PAGES,
        );
      }
      return rule(VOUCHER_PAGES);
    }
    if (path === '/api/vouchers') {
      const page = VOUCHER_TYPE_PAGES[String((await call.body()).vchrType ?? '')];
      return page ? rule([page]) : deny(need);
    }
    const id = /^\/api\/vouchers\/([^/]+)/.exec(path)?.[1];
    const type = id ? await call.voucherType(id) : null;
    if (!type) return rule(VOUCHER_PAGES); // not found: the route answers that
    const page = VOUCHER_TYPE_PAGES[type];
    return page ? rule([page]) : deny(need);
  }

  // Bills.
  if (under(path, '/api/purchases'))
    return path === '/api/purchases/setup' ? null : rule(['Purchase Invoice']);
  if (under(path, '/api/sales'))
    return path === '/api/sales/setup' ? null : rule(['Sales Invoice']);
  if (under(path, '/api/returns')) {
    const kind = read ? call.query('kind') : String((await call.body()).kind ?? '');
    const page = RETURN_KIND_PAGES[kind ?? ''];
    return rule(page ? [page] : Object.values(RETURN_KIND_PAGES));
  }
  if (under(path, '/api/stock-journals')) {
    if (path === '/api/stock-journals/in-hand') return null; // stock in hand, a lookup
    return rule(['Stock Journal']);
  }

  // Tools.
  if (path === '/api/backup') return rule(['Backup Data']);
  if (under(path, '/api/logs')) return rule(['Logs']);
  if (under(path, '/api/settings')) return read ? null : rule(['Company Settings']);

  return null;
}

const isStr = (v: unknown): v is string => typeof v === 'string';

/** A rule nobody passes: no user has a level on this made-up page. */
const deny = (need: Need): Rule => ({ pages: ['(none)'], need });
