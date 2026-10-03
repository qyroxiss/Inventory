// Dashboard figures. Port target: MDA-Inventory lib/dashboard_service.dart.
//
// For now every book reports "no activity": the stock, sales, voucher and ledger tables the
// figures are read from arrive in Phase 2, and each figure is filled in then from its MDA
// query (stock value, today's sales, cash balance, pending bills, the 7-day window and the
// recent list). The screen already shows them in MDA's formats.

import { emptyDashboard, type DashboardData } from '@qi/core';
import type { Db } from '@qi/db';

const isoDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export async function getDashboard(
  _db: Db,
  _book: { bookId: string },
  now: Date = new Date(),
): Promise<DashboardData> {
  return emptyDashboard(isoDay(now));
}
