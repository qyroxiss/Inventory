// Dashboard figures. Port of MDA-Inventory lib/dashboard_service.dart (docs/LOGIC-SPEC.md §12),
// read from the open book. "Today" is the day in India, so a server running on UTC still
// agrees with the user's calendar.

import { VCHR_KINDS, ago, round2, weekLabels, type DashboardData, type RecentTx } from '@qi/core';
import { and, desc, eq, gte, lte, schema, sql, type Db } from '@qi/db';
import { stockValues } from './reports.ts';

const { billRefs, ledgers, purchases, sales, voucherLines, vouchers } = schema;

/** Cash-in-Hand: the Cash Balance is the closing balance of the ledgers directly under it. */
const CASH_GROUP = 'A003';

const p2 = (n: number) => String(n).padStart(2, '0');
const isoDay = (d: Date) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;

/** [d]'s wall-clock time in India, as a Date whose local fields read that time. */
const inIndia = (d: Date) => new Date(d.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));

export async function getDashboard(
  db: Db,
  book: { bookId: string },
  now: Date = new Date(),
): Promise<DashboardData> {
  const at = inIndia(now);
  const today = isoDay(at);
  const [stock, week, cash, bills, recent] = await Promise.all([
    stockValues(db, book.bookId, '9999-12-31'),
    salesWeek(db, book.bookId, at),
    cashBalance(db, book.bookId, today),
    pendingBills(db, book.bookId, today),
    recentVouchers(db, book.bookId, at),
  ]);
  return {
    stockValue: stock.closing,
    stockOpening: stock.opening,
    todaySales: week[6]!,
    yesterdaySales: week[5]!,
    weekValues: week,
    weekLabels: weekLabels(today),
    cashBalance: cash.balance,
    cashToday: cash.today,
    pendingBills: bills.open,
    overdueBills: bills.overdue,
    recent,
  };
}

/** Net sales of each of the seven days ending today, read from the bills so each counts once. */
async function salesWeek(db: Db, bookId: string, at: Date): Promise<number[]> {
  const days = Array.from({ length: 7 }, (_, i) =>
    isoDay(new Date(at.getFullYear(), at.getMonth(), at.getDate() - 6 + i)),
  );
  const rows = await db
    .select({
      day: sql<string>`${sales.billDate}::text`,
      amt: sql<string>`coalesce(sum(${sales.netAmount}), 0)`,
    })
    .from(sales)
    .where(
      and(
        eq(sales.bookId, bookId),
        eq(sales.status, 'Active'),
        gte(sales.billDate, days[0]!),
        lte(sales.billDate, days[6]!),
      ),
    )
    .groupBy(sales.billDate);
  const byDay = new Map(rows.map((r) => [r.day, Number(r.amt)]));
  return days.map((d) => round2(byDay.get(d) ?? 0));
}

/** Closing cash (opening balances plus every active movement) and today's movement. */
async function cashBalance(db: Db, bookId: string, today: string) {
  const [opening] = await db
    .select({
      bal: sql<string>`coalesce(sum(case when ${ledgers.drCr} = 'Cr' then -${ledgers.opBal} else ${ledgers.opBal} end), 0)`,
    })
    .from(ledgers)
    .where(and(eq(ledgers.bookId, bookId), eq(ledgers.grpCode, CASH_GROUP)));
  const [moved] = await db
    .select({
      bal: sql<string>`coalesce(sum(${voucherLines.drAmount} - ${voucherLines.crAmount}), 0)`,
      today: sql<string>`coalesce(sum(case when ${vouchers.vchrDate} = ${today} then ${voucherLines.drAmount} - ${voucherLines.crAmount} else 0 end), 0)`,
    })
    .from(voucherLines)
    .innerJoin(vouchers, eq(vouchers.id, voucherLines.voucherId))
    .innerJoin(
      ledgers,
      and(eq(ledgers.bookId, vouchers.bookId), eq(ledgers.accCode, voucherLines.accCode)),
    )
    .where(
      and(
        eq(vouchers.bookId, bookId),
        eq(vouchers.status, 'Active'),
        eq(ledgers.grpCode, CASH_GROUP),
      ),
    );
  return {
    balance: round2(Number(opening?.bal ?? 0) + Number(moved?.bal ?? 0)),
    today: round2(Number(moved?.today ?? 0)),
  };
}

/**
 * Bills still open, and how many are past due. Settlements are recorded on account, so each
 * party's settlements are applied to its bills oldest first; due = bill date + credit days.
 */
async function pendingBills(db: Db, bookId: string, today: string) {
  const rows = await db
    .select({
      acc: billRefs.accCode,
      refType: billRefs.refType,
      billDate: billRefs.billDate,
      amount: billRefs.amount,
      creditDays: sql<number>`coalesce(${ledgers.creditDays}, 0)`,
    })
    .from(billRefs)
    .innerJoin(vouchers, eq(vouchers.id, billRefs.voucherId))
    .leftJoin(
      ledgers,
      and(eq(ledgers.bookId, vouchers.bookId), eq(ledgers.accCode, billRefs.accCode)),
    )
    .where(and(eq(vouchers.bookId, bookId), eq(vouchers.status, 'Active')))
    .orderBy(billRefs.accCode, billRefs.billDate, billRefs.id);

  const raised = new Map<string, { due: string | null; amount: number }[]>();
  const settled = new Map<string, number>();
  for (const r of rows) {
    const amount = Number(r.amount);
    if ((r.refType ?? 'New') !== 'New') {
      settled.set(r.acc, (settled.get(r.acc) ?? 0) + amount);
      continue;
    }
    const bill = parseDay(r.billDate);
    const due = bill
      ? isoDay(new Date(bill.getFullYear(), bill.getMonth(), bill.getDate() + Number(r.creditDays)))
      : null;
    raised.set(r.acc, [...(raised.get(r.acc) ?? []), { due, amount }]);
  }

  let open = 0;
  let overdue = 0;
  for (const [acc, list] of raised) {
    let credit = settled.get(acc) ?? 0;
    for (const { due, amount } of list) {
      const applied = credit >= amount ? amount : credit;
      credit -= applied;
      if (amount - applied <= 0.005) continue;
      open++;
      if (due !== null && due < today) overdue++;
    }
  }
  return { open, overdue };
}

/** A bill date as stored: yyyy-MM-dd, or MDA's dd/MM/yyyy and dd-MM-yyyy from an import. */
function parseDay(v: string | null): Date | null {
  const s = (v ?? '').trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return new Date(+m[1]!, +m[2]! - 1, +m[3]!);
  m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(s);
  if (m) return new Date(+m[3]!, +m[2]! - 1, +m[1]!);
  return null;
}

/** The five newest active vouchers. The party is the voucher's own, else the sale's customer,
 *  else the purchase's supplier. */
async function recentVouchers(db: Db, bookId: string, at: Date): Promise<RecentTx[]> {
  const rows = await db
    .select({
      type: vouchers.vchrType,
      date: sql<string>`${vouchers.vchrDate}::text`,
      net: vouchers.netAmount,
      createdAt: vouchers.createdAt,
      partyName: ledgers.accName,
      custName: sql<
        string | null
      >`(select s.cust_name from ${sales} s where s.voucher_id = ${vouchers.id} limit 1)`,
      suppName: sql<string | null>`(select l.acc_name from ${purchases} p
        join ${ledgers} l on l.book_id = p.book_id and l.acc_code = p.supp_code
        where p.voucher_id = ${vouchers.id} limit 1)`,
    })
    .from(vouchers)
    .leftJoin(
      ledgers,
      and(eq(ledgers.bookId, vouchers.bookId), eq(ledgers.accCode, vouchers.partyCode)),
    )
    .where(and(eq(vouchers.bookId, bookId), eq(vouchers.status, 'Active')))
    .orderBy(desc(vouchers.vchrDate), desc(vouchers.createdAt))
    .limit(5);

  return rows.map((r) => {
    const [label, isIn] = VCHR_KINDS[r.type] ?? [r.type, true];
    const party = (r.partyName ?? r.custName ?? r.suppName ?? '').trim();
    const created = r.createdAt ? localStamp(inIndia(new Date(r.createdAt))) : null;
    return {
      type: label,
      party: party || '—',
      amount: Number(r.net),
      isIn,
      when: ago(created, r.date, at),
    };
  });
}

const localStamp = (d: Date) =>
  `${isoDay(d)}T${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`;
