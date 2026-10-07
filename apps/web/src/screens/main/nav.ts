// MDA's navigation, exactly as main.dart:114-196 lists it: sections, groups, items, order.
// The menu bar, Quick find and the screen placeholders all read from here.

export type NavGroup = { label: string; items: string[] };
export type NavSection = { label: string; groups: NavGroup[] };

export const NAV: NavSection[] = [
  { label: 'Dashboard', groups: [] },
  {
    label: 'Masters',
    groups: [
      {
        label: 'Accounting Masters',
        items: ['Group Master', 'Sub Group Master', 'Ledger Creation'],
      },
      {
        label: 'Inventory Masters',
        items: [
          'Stock Group',
          'Stock Sub Group',
          'Stock Item',
          'Godown',
          'Unit Master',
          'Sale Type',
        ],
      },
    ],
  },
  {
    label: 'Accounting Vouchers',
    groups: [
      { label: '', items: ['Receipt', 'Payment', 'Journal Voucher', 'Debit Note', 'Credit Note'] },
    ],
  },
  {
    label: 'Transactions',
    groups: [{ label: '', items: ['Purchase Invoice', 'Sales Invoice', 'Stock Journal'] }],
  },
  {
    label: 'Reports',
    groups: [
      {
        label: '',
        items: ['Stock Summary', 'Profit & Loss', 'Balance Sheet', 'Day Book', 'Sales Register'],
      },
    ],
  },
  {
    label: 'GST Reports',
    groups: [
      { label: '', items: ['GSTR-1', 'GSTR-3B', 'GST Audit', 'HSN Summary', 'Input Tax Credit'] },
    ],
  },
  {
    label: 'Tools',
    groups: [
      {
        label: '',
        items: ['Backup Data', 'User Management', 'Company Settings', 'Import Data', 'Logs'],
      },
    ],
  },
];

/** Items MDA itself shows as "Not built yet" (LOGIC-SPEC §1). */
export const NOT_BUILT = new Set([
  'Backup Data', 'Company Settings', 'Import Data', 'Logs',
]); // prettier-ignore

/** The dashboard's Quick Actions, in MDA's order, and the screen each one opens (main.dart:738-745). */
export const QUICK_ACTIONS = [
  { label: 'New Purchase', screen: 'Purchase Invoice', icon: 'cart' },
  { label: 'New Sale', screen: 'Sales Invoice', icon: 'store' },
  { label: 'Receipt', screen: 'Receipt', icon: 'down' },
  { label: 'Payment', screen: 'Payment', icon: 'up' },
  { label: 'Journal Entry', screen: 'Journal Voucher', icon: 'swap' },
  { label: 'New Party', screen: 'Ledger Creation', icon: 'party' },
] as const;

/** Line icons (24×24, stroked), one per section and per Quick Action. */
export const ICONS = {
  dashboard: 'M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z',
  masters:
    'M9 3h6v5H9zM12 8v4M5 12h14M5 12v3M12 12v3M19 12v3M3 15h4v5H3zM10 15h4v5h-4zM17 15h4v5h-4z',
  vouchers: 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6M9 16h3',
  transactions: 'M4 8h14l-4-4M20 16H6l4 4',
  reports: 'M4 20V11M10 20V5M16 20v-7M2 20h20',
  gst: 'M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6',
  tools: 'M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1M15 4v4M9 10v4M17 16v4',
  cart: 'M3 4h2l2.4 11h10.8L20 7H6.2M9 20h.01M17 20h.01',
  store: 'M4 10l1.5-5h13L20 10M5 10v10h14V10M4 10h16M10 20v-5h4v5',
  down: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  up: 'M12 20V9M7 14l5-5 5 5M5 4h14',
  swap: 'M4 8h14l-4-4M20 16H6l4 4',
  party: 'M15 19c0-3-2.7-5-6-5s-6 2-6 5M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6M19 8v6M16 11h6',
  moneyIn: 'M17 7 7 17M7 9v8h8',
  moneyOut: 'M7 17 17 7M9 7h8v8',
} as const;

/** Each section's icon, in NAV order. */
export const SECTION_ICONS = [
  ICONS.dashboard, ICONS.masters, ICONS.vouchers, ICONS.transactions, ICONS.reports, ICONS.gst, ICONS.tools,
]; // prettier-ignore

/** 'Profit & Loss' → 'profit-loss', used in the address bar (/app/profit-loss). */
export const slug = (label: string) =>
  label
    .toLowerCase()
    .replace(/&/g, ' ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

export type NavItem = {
  label: string;
  section: string;
  group: string;
  slug: string;
  built: boolean;
};

/** Every item, flattened, in menu order. */
export const ALL_ITEMS: NavItem[] = NAV.flatMap((s) =>
  s.groups.flatMap((g) =>
    g.items.map((label) => ({
      label,
      section: s.label,
      group: g.label,
      slug: slug(label),
      built: !NOT_BUILT.has(label),
    })),
  ),
);

export const findItem = (s: string) => ALL_ITEMS.find((i) => i.slug === s) ?? null;

/** A section by its address (/app/section/masters), with its index in NAV. */
export const findSection = (s: string) => {
  const i = NAV.findIndex((n) => slug(n.label) === s);
  return i > 0 ? { ...NAV[i]!, index: i } : null;
};
