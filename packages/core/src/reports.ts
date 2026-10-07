// Reports. MDA lists Stock Summary, Profit & Loss, Balance Sheet, Day Book and Sales Register but
// shows "Not built yet" for each; it leaves only its read helpers (stockInHand, ledgerBalance)
// and the dashboard's stock valuation. The reports are built here on those, in the usual
// Indian accounting shape (docs/design/REPORTS.md):
//   - Stock is valued as MDA's dashboard values it: quantity × purchase rate, or the sale rate
//     when an item has no purchase rate.
//   - Balances follow MDA's ledgerBalance: ± opening (Cr negative) + Σ(Dr − Cr) over Active
//     vouchers; positive means Dr.
//   - Sub groups roll up into their top-level group; a group's type (Assets, Liabilities,
//     Expenses, Income) decides where it goes.

import { round2 } from './round.ts';

/** MDA's stock rate (dashboard_service.dart:94). */
export const stockRate = (purRate: number, saleRate: number) => (purRate > 0 ? purRate : saleRate);

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

export const reportMessages = {
  noStock: 'No stock items yet',
  noVouchers: 'No vouchers in this period',
  noSales: 'No sales in this period',
  badRange: 'The From date is after the To date.',
  differenceLabel: 'Difference in Opening Balances',
} as const;
