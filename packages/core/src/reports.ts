// Reports. MDA lists Stock Summary, Profit & Loss, Balance Sheet, Day Book and Sales Register but
// shows "Not built yet" for each; it leaves only its read helpers (stockInHand, ledgerBalance)
// and the dashboard's stock valuation. The reports are built here on those, in the usual
// Indian accounting shape (docs/design/REPORTS.md):
//   - Stock is valued as MDA's dashboard values it: quantity × purchase rate, or the sale rate
//     when an item has no purchase rate. An item with neither (MDA's form never sets them) is
//     valued at its last purchase price, by the owner's choice, so stock isn't shown as ₹0.
//   - Balances follow MDA's ledgerBalance: ± opening (Cr negative) + Σ(Dr − Cr) over Active
//     vouchers; positive means Dr.
//   - Sub groups roll up into their top-level group; a group's type (Assets, Liabilities,
//     Expenses, Income) decides where it goes.

import { round2 } from './round.ts';

/** MDA's stock rate (dashboard_service.dart:94), falling back to the last purchase price when
 *  the item has neither rate. */
export const stockRate = (purRate: number, saleRate: number, lastPurchase = 0) =>
  purRate > 0 ? purRate : saleRate > 0 ? saleRate : lastPurchase;

/** Opening stock value: the item's opening value when set, else quantity × rate. */
export const openingStockValue = (opQty: number, opValue: number, rate: number) =>
  opValue > 0 ? opValue : round2(opQty * rate);

export type ReportGroup = { grpCode: string; grpName: string; grpType: string; parentGrp: string };

/** The top-level group a group sits under (itself when it's top level). */
export function topGroupOf(code: string, groups: Map<string, ReportGroup>): ReportGroup | null {
  let g = groups.get(code);
  for (let i = 0; g && g.parentGrp !== 'Parent' && i < 20; i++) {
    const up = groups.get(g.parentGrp);
    if (!up) break;
    g = up;
  }
  return g ?? null;
}

export type LedgerBalance = { accCode: string; accName: string; grpCode: string; balance: number };

/** One line of a statement side: a group with its ledgers (only the non-zero ones). */
export type StatementGroup = {
  grpCode: string;
  grpName: string;
  amount: number;
  ledgers: { accCode: string; accName: string; amount: number }[];
};

/** Groups ledgers under their top-level group. `sign` turns the Dr-positive balance into the
 *  side's own sense (+1 for Dr-natured: Assets, Expenses; −1 for Cr-natured). */
export function groupBalances(
  balances: LedgerBalance[],
  groups: Map<string, ReportGroup>,
  pick: (top: ReportGroup) => boolean,
  sign: 1 | -1,
): StatementGroup[] {
  const out = new Map<string, StatementGroup>();
  for (const b of balances) {
    const top = topGroupOf(b.grpCode, groups);
    if (!top || !pick(top)) continue;
    const amount = round2(b.balance * sign);
    let g = out.get(top.grpCode);
    if (!g) {
      g = { grpCode: top.grpCode, grpName: top.grpName, amount: 0, ledgers: [] };
      out.set(top.grpCode, g);
    }
    g.amount = round2(g.amount + amount);
    if (Math.abs(amount) >= 0.005)
      g.ledgers.push({ accCode: b.accCode, accName: b.accName, amount });
  }
  return [...out.values()]
    .filter((g) => Math.abs(g.amount) >= 0.005 || g.ledgers.length)
    .sort((a, b) => a.grpCode.localeCompare(b.grpCode));
}

const sumOf = (gs: StatementGroup[]) => round2(gs.reduce((a, g) => a + g.amount, 0));

/** Top-level groups that make up the trading account; the rest of each type goes to P&L. */
export const TRADING_GROUPS = {
  purchase: 'E003',
  directExp: 'E001',
  sales: 'I003',
  directInc: 'I001',
};

export type ProfitAndLoss = {
  trading: {
    openingStock: number;
    debit: StatementGroup[];
    credit: StatementGroup[];
    closingStock: number;
    /** Positive = gross profit, negative = gross loss. */
    gross: number;
    total: number;
  };
  pl: {
    debit: StatementGroup[];
    credit: StatementGroup[];
    /** Positive = net profit, negative = net loss. */
    net: number;
    total: number;
  };
};

/**
 * Trading and Profit & Loss account. Dr: opening stock, purchases and direct expenses; Cr:
 * sales, direct incomes and closing stock — the difference is the gross profit, carried to the
 * P&L account. There, indirect expenses (every other Expenses group) against indirect incomes
 * (every other Income group) give the net profit.
 */
export function profitAndLoss(
  balances: LedgerBalance[],
  groups: Map<string, ReportGroup>,
  openingStock: number,
  closingStock: number,
): ProfitAndLoss {
  const T = TRADING_GROUPS;
  const isExp = (g: ReportGroup) => g.grpType === 'Expenses';
  const isInc = (g: ReportGroup) => g.grpType === 'Income';
  const tradingDr = groupBalances(
    balances,
    groups,
    (g) => isExp(g) && (g.grpCode === T.purchase || g.grpCode === T.directExp),
    1,
  );
  const tradingCr = groupBalances(
    balances,
    groups,
    (g) => isInc(g) && (g.grpCode === T.sales || g.grpCode === T.directInc),
    -1,
  );
  const plDr = groupBalances(
    balances,
    groups,
    (g) => isExp(g) && g.grpCode !== T.purchase && g.grpCode !== T.directExp,
    1,
  );
  const plCr = groupBalances(
    balances,
    groups,
    (g) => isInc(g) && g.grpCode !== T.sales && g.grpCode !== T.directInc,
    -1,
  );

  const trDr = round2(openingStock + sumOf(tradingDr));
  const trCr = round2(sumOf(tradingCr) + closingStock);
  const gross = round2(trCr - trDr);
  const plDrTotal = round2(sumOf(plDr) + (gross < 0 ? -gross : 0));
  const plCrTotal = round2(sumOf(plCr) + (gross > 0 ? gross : 0));
  const net = round2(plCrTotal - plDrTotal);
  return {
    trading: {
      openingStock,
      debit: tradingDr,
      credit: tradingCr,
      closingStock,
      gross,
      total: Math.max(trDr, trCr),
    },
    pl: { debit: plDr, credit: plCr, net, total: Math.max(plDrTotal, plCrTotal) },
  };
}

export type BalanceSheet = {
  liabilities: StatementGroup[];
  assets: StatementGroup[];
  /** Net profit (negative = loss), shown on the liabilities side as Profit & Loss A/c. */
  profit: number;
  closingStock: number;
  /** Shown on the shorter side so both agree: + on liabilities, − on assets. */
  difference: number;
  total: number;
};

/** Liabilities (Cr-natured) plus the profit, against assets (Dr-natured) plus closing stock. Any
 *  gap — opening balances that don't agree, or opening stock no ledger carries — is shown as
 *  "Difference in Opening Balances", as Tally does. */
export function balanceSheet(
  balances: LedgerBalance[],
  groups: Map<string, ReportGroup>,
  profit: number,
  closingStock: number,
): BalanceSheet {
  const liabilities = groupBalances(balances, groups, (g) => g.grpType === 'Liabilities', -1);
  const assets = groupBalances(balances, groups, (g) => g.grpType === 'Assets', 1);
  const liab = round2(sumOf(liabilities) + profit);
  const asset = round2(sumOf(assets) + closingStock);
  const difference = round2(asset - liab);
  return {
    liabilities,
    assets,
    profit,
    closingStock,
    difference,
    total: Math.max(asset, liab),
  };
}

// ── Ledger Statement ───────────────────────────────────────────────────────────

export type StatementLine = {
  date: string;
  vchrNo: string;
  type: string;
  particulars: string;
  narration: string;
  debit: number;
  credit: number;
};
export type StatementRow = StatementLine & { balance: number };

/** A ledger's entries with the running balance after each one (Dr positive, Cr negative),
 *  starting from its balance before the period. */
export function ledgerStatement(opening: number, lines: StatementLine[]) {
  let bal = round2(opening);
  const rows: StatementRow[] = lines.map((l) => {
    bal = round2(bal + l.debit - l.credit);
    return { ...l, balance: bal };
  });
  const debit = round2(lines.reduce((a, l) => a + l.debit, 0));
  const credit = round2(lines.reduce((a, l) => a + l.credit, 0));
  return { opening: round2(opening), rows, debit, credit, closing: bal };
}

/** 1,234.50 Dr / 980.00 Cr: a balance with its side; zero has none. */
export const drCr = (v: number, fmt: (n: number) => string) =>
  Math.abs(v) < 0.005 ? fmt(0) : `${fmt(Math.abs(v))} ${v > 0 ? 'Dr' : 'Cr'}`;

// ── Trial Balance ──────────────────────────────────────────────────────────────

export type TrialRow = {
  accCode: string;
  accName: string;
  grpName: string;
  debit: number;
  credit: number;
};

/** Every ledger with a balance, by its top-level group then name, in Debit or Credit, and the
 *  opening stock as its own Debit row (it sits on the items, not a ledger; added 2026-11-12, as
 *  Tally shows it). When the opening balances don't agree, the gap shows as its own row so the
 *  two sides still total. */
export function trialBalance(
  balances: LedgerBalance[],
  groups: Map<string, ReportGroup>,
  openingStock = 0,
) {
  const rows: TrialRow[] = balances
    .filter((b) => Math.abs(b.balance) >= 0.005)
    .map((b) => ({
      accCode: b.accCode,
      accName: b.accName,
      grpName: topGroupOf(b.grpCode, groups)?.grpName ?? '',
      debit: b.balance > 0 ? round2(b.balance) : 0,
      credit: b.balance < 0 ? round2(-b.balance) : 0,
    }))
    .sort((a, b) => a.grpName.localeCompare(b.grpName) || a.accName.localeCompare(b.accName));
  if (Math.abs(openingStock) >= 0.005)
    rows.unshift({
      accCode: '',
      accName: 'Opening Stock',
      grpName: 'Stock-in-Hand',
      debit: openingStock > 0 ? round2(openingStock) : 0,
      credit: openingStock < 0 ? round2(-openingStock) : 0,
    });
  const debit = round2(rows.reduce((a, r) => a + r.debit, 0));
  const credit = round2(rows.reduce((a, r) => a + r.credit, 0));
  const difference = round2(debit - credit);
  return { rows, debit, credit, difference };
}

// ── Outstanding ────────────────────────────────────────────────────────────────

export type BillRef = {
  accCode: string;
  accName: string;
  billNo: string;
  /** 'New' raises a bill; anything else settles the party's bills, oldest first. */
  refType: string;
  billDate: string;
  amount: number;
  creditDays: number;
  /** Receivable (a sale to a customer) or payable (a purchase from a supplier). */
  side: 'receivable' | 'payable';
};
export type OpenBill = {
  accCode: string;
  accName: string;
  billNo: string;
  billDate: string;
  dueDate: string;
  amount: number;
  pending: number;
  /** Days past the due date (0 when not yet due). */
  overdueDays: number;
  side: 'receivable' | 'payable';
};

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);

/** Bills still unpaid as on [today], by the dashboard's rule (LOGIC-SPEC "Pending bills"): each
 *  party's settlements are applied to its bills oldest first; due = bill date + credit days. */
export function outstandingBills(refs: BillRef[], today: string): OpenBill[] {
  const settled = new Map<string, number>();
  const raised: BillRef[] = [];
  for (const r of refs) {
    if (r.refType !== 'New') settled.set(r.accCode, (settled.get(r.accCode) ?? 0) + r.amount);
    else raised.push(r);
  }
  raised.sort((a, b) => a.accCode.localeCompare(b.accCode) || a.billDate.localeCompare(b.billDate));
  const out: OpenBill[] = [];
  for (const r of raised) {
    const credit = settled.get(r.accCode) ?? 0;
    const applied = Math.min(credit, r.amount);
    settled.set(r.accCode, round2(credit - applied));
    const pending = round2(r.amount - applied);
    if (pending <= 0.005) continue;
    const dueDate = addDays(r.billDate, r.creditDays);
    out.push({
      accCode: r.accCode,
      accName: r.accName,
      billNo: r.billNo,
      billDate: r.billDate,
      dueDate,
      amount: r.amount,
      pending,
      overdueDays: Math.max(0, daysBetween(dueDate, today)),
      side: r.side,
    });
  }
  return out;
}

/** The ageing column a bill falls in, by days overdue. */
export const AGEING = ['Not due', '1-30', '31-60', '61-90', 'Over 90'] as const;
export const ageingOf = (overdueDays: number): (typeof AGEING)[number] =>
  overdueDays <= 0
    ? 'Not due'
    : overdueDays <= 30
      ? '1-30'
      : overdueDays <= 60
        ? '31-60'
        : overdueDays <= 90
          ? '61-90'
          : 'Over 90';

export const reportMessages = {
  noStock: 'No stock items yet',
  noMovements: 'No stock movements in this period',
  pickItem: 'Select an item to see its register',
  noVouchers: 'No vouchers in this period',
  noSales: 'No sales in this period',
  noPurchases: 'No purchases in this period',
  noEntries: 'No entries in this period',
  pickLedger: 'Select a ledger to see its statement',
  noBalances: 'No ledger has a balance',
  noOutstanding: 'Nothing outstanding',
  badRange: 'The From date is after the To date.',
  differenceLabel: 'Difference in Opening Balances',
} as const;
