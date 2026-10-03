// Dashboard wording and formats. Port of MDA-Inventory lib/main.dart:680-731 (money, trend
// chips) and lib/dashboard_service.dart (voucher kinds, week window, relative time).

/** Display label and money direction per voucher type: true = money in (dashboard_service.dart:6-19). */
export const VCHR_KINDS: Record<string, readonly [label: string, isIn: boolean]> = {
  SAL: ['Sales Invoice', true],
  PUR: ['Purchase Invoice', false],
  RCP: ['Receipt', true],
  BNK: ['Bank Receipt', true],
  PAY: ['Payment', false],
  BPAY: ['Bank Payment', false],
  JNL: ['Journal Voucher', true],
  DRN: ['Debit Note', true],
  CRN: ['Credit Note', false],
  PRT: ['Purchase Return', true],
  SRT: ['Sales Return', false],
  STJ: ['Stock Journal', true],
};

const WEEKDAY = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export type RecentTx = { type: string; party: string; amount: number; isIn: boolean; when: string };

/** What the dashboard shows (DashboardData, dashboard_service.dart:42-60). */
export type DashboardData = {
  stockValue: number;
  stockOpening: number;
  todaySales: number;
  yesterdaySales: number;
  cashBalance: number;
  cashToday: number;
  pendingBills: number;
  overdueBills: number;
  weekValues: number[];
  weekLabels: string[];
  recent: RecentTx[];
};

/** Labels of the seven days up to and including [todayIso] ('YYYY-MM-DD'). */
export function weekLabels(todayIso: string): string[] {
  const [y, m, d] = todayIso.split('-').map(Number);
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(Date.UTC(y!, m! - 1, d! - 6 + i)).getUTCDay(); // 0 = Sunday
    return WEEKDAY[(day + 6) % 7]!;
  });
}

/** A book with no activity: every figure zero, the week window still labelled. */
export const emptyDashboard = (todayIso: string): DashboardData => ({
  stockValue: 0,
  stockOpening: 0,
  todaySales: 0,
  yesterdaySales: 0,
  cashBalance: 0,
  cashToday: 0,
  pendingBills: 0,
  overdueBills: 0,
  weekValues: [0, 0, 0, 0, 0, 0, 0],
  weekLabels: weekLabels(todayIso),
  recent: [],
});

/** Indian digit grouping: 18,42,350 rather than 1,842,350 (main.dart:681). */
export function grouped(value: number): string {
  const digits = String(Math.round(Math.abs(value)));
  if (digits.length <= 3) return digits;
  const last3 = digits.slice(-3);
  let rest = digits.slice(0, -3);
  const parts: string[] = [];
  while (rest.length > 2) {
    parts.unshift(rest.slice(-2));
    rest = rest.slice(0, -2);
  }
  if (rest) parts.unshift(rest);
  return `${parts.join(',')},${last3}`;
}

/** '₹18,42,350'; negatives get a true minus sign (main.dart:695). */
export const inr = (value: number): string => `${value < -0.005 ? '−' : ''}₹${grouped(value)}`;

/** Short form for the trend chips: ₹32K, ₹1.8L, ₹2.4Cr (main.dart:698). */
export function compact(value: number): string {
  const v = Math.abs(value);
  if (v >= 10000000) return `${(v / 10000000).toFixed(1)}Cr`;
  if (v >= 100000) return `${(v / 100000).toFixed(1)}L`;
  if (v >= 1000) return `${Math.round(v / 1000)}K`;
  return String(Math.round(v));
}

export const signed = (value: number): string => `${value < 0 ? '−' : '+'}₹${compact(value)}`;

export function pct(delta: number, base: number): string {
  const p = (delta / base) * 100;
  return `${p < 0 ? '−' : '+'}${Math.abs(p).toFixed(1)}%`;
}

export type Trend = { text: string; up: boolean };

/**
 * The four trend chips (main.dart:716-731). Percentages need a base; without one the
 * movement itself is shown instead of a meaningless "+100%".
 */
export function trends(d: DashboardData): {
  stock: Trend;
  sales: Trend;
  bills: Trend;
  cash: Trend;
} {
  return {
    stock: {
      text:
        d.stockOpening > 0
          ? pct(d.stockValue - d.stockOpening, d.stockOpening)
          : signed(d.stockValue - d.stockOpening),
      up: d.stockValue >= d.stockOpening,
    },
    sales: {
      text:
        d.yesterdaySales > 0
          ? pct(d.todaySales - d.yesterdaySales, d.yesterdaySales)
          : signed(d.todaySales - d.yesterdaySales),
      up: d.todaySales >= d.yesterdaySales,
    },
    bills: {
      text: d.overdueBills > 0 ? `${d.overdueBills} overdue` : 'none overdue',
      up: d.overdueBills === 0,
    },
    cash: { text: signed(d.cashToday), up: d.cashToday >= 0 },
  };
}

/** Dart's DateTime.tryParse for the forms MDA stores: local date-time, or a plain date. */
function parseLocal(v: string | null | undefined): Date | null {
  const s = (v ?? '').trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,6}))?)?)?$/.exec(
    s,
  );
  if (!m) return null;
  const [, y, mo, d, h = '0', mi = '0', se = '0', ms = '0'] = m;
  return new Date(+y!, +mo! - 1, +d!, +h, +mi, +se, Math.floor(+ms.padEnd(3, '0').slice(0, 3)));
}

/**
 * "2h ago" while a voucher is fresh, falling back to its date once it is more than a week
 * old. Entry time is used when there is one (dashboard_service.dart:236-253).
 * [vchrDate] is the voucher date as 'YYYY-MM-DD' (MDA parses its own formats first).
 */
export function ago(
  createdAt: string | null | undefined,
  vchrDate: string | null | undefined,
  now: Date,
): string {
  const at = parseLocal(createdAt) ?? parseLocal(vchrDate);
  if (!at) return '';
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((day(now) - day(at)) / 86400000);
  if (days <= 0) {
    const mins = Math.trunc((now.getTime() - at.getTime()) / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    return `${Math.trunc((now.getTime() - at.getTime()) / 3600000)}h ago`;
  }
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(at.getDate())}-${p(at.getMonth() + 1)}-${at.getFullYear()}`;
}
