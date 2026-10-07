# Reports

**Status:** built 2026-10-07. MDA lists Stock Summary, Profit & Loss, Balance Sheet, Day Book and
Sales Register but shows "Not built yet" for each. It leaves only:

- its read helpers `stockInHand` and `ledgerBalance` (`posting_service.dart:477-519`);
- its dashboard's stock valuation (`dashboard_service.dart:90-105`).

The reports are built on those, in the usual Indian accounting shape, as WORKFLOW.md Phase 6
planned.

- **Code:**
  - `packages/core/src/reports.ts`: the valuation, group roll-up, Trading/P&L and Balance Sheet
    assembly.
  - `packages/services/src/reports.ts`: the queries.
  - `apps/web/src/screens/reports/`: `ListReports.tsx`, `Statements.tsx` and `shared.tsx`.
- **API:**
  - `/api/reports/stock-summary?from&to[&godown]`
  - `/api/reports/day-book?from&to[&cancelled=1]`
  - `/api/reports/sales-register?from&to[&cancelled=1]`
  - `/api/reports/profit-loss?to` and `/api/reports/balance-sheet?to`
- **Addresses:** each menu item's own: `/app/stock-summary`, `/app/profit-loss`,
  `/app/balance-sheet`, `/app/day-book`, `/app/sales-register`.

## Rules shared by every report

- **Only Active vouchers count.** Cancelled documents have no stock movements.
- **Period:** it defaults to the open year's first day to today, and is kept inside the year.
  From after To shows "The From date is after the To date." and nothing is fetched.
- **Stock valuation (MDA's dashboard rule):**
  - Value = quantity × the item's purchase rate, or its sale rate when the purchase rate is 0.
  - Opening stock value = the item's opening value when set, otherwise opening quantity × that
    rate.
  - Only active items are counted.
- **Ledger balance (MDA's `ledgerBalance`):** ± opening (Cr negative) + Σ(Dr − Cr) up to the
  date; positive means Dr.
- **Groups:** sub groups roll up into their top-level group. The group's type (Assets,
  Liabilities, Expenses, Income) decides the side.
- **Print:**
  - The Print button prints the report on its own, with the company name and the period line.
  - The app's menu, header and status bar are hidden, and long tables run onto further pages.
- **Money:** two decimals with Indian grouping (12,34,567.89).
- **Layout:** no page scroll on laptops or tablets; tables and statements scroll inside
  themselves. Phones scroll as a page.

## Stock Summary

- **Filters:** From, To, Godown (All godowns or one).
- **Columns:** Code · Item · Unit · Opening · Inward · Outward · Closing · Rate · Value, with
  the total value at the foot.
- **How it's worked out:**
  - Opening = opening quantity + every movement before From.
  - Inward and Outward are the movements within the period.
  - Closing = Opening + Inward − Outward.
- **With a godown:** only that godown's movements count. The item's opening quantity carries
  no godown, so it's left out.

## Day Book

- **Filters:** From, To, Show cancelled.
- **Columns:** Date · Voucher · Type · Particulars · Ref · Debit · Credit, oldest first. The
  totals row counts active vouchers only.
- **Particulars:** the party, else the first debited ledger, else the narration.
- **Debit and Credit:** the voucher's line totals.
- **Click a row** to see its ledger lines. A stock journal shows "Stock only — no ledger lines."

## Sales Register

- **Filters:** From, To, Show cancelled (struck through and left out of the totals).
- **Columns:** Date · Bill No · Customer · GSTIN · Mode · Taxable · CGST · SGST · IGST · Disc ·
  R/Off · Net, with totals.

## Profit & Loss (up to a date, from the year's start)

- **Trading Account:**
  - **Dr:** To Opening Stock; To Purchase Accounts (E003); To Direct Expenses (E001); To Gross
    Profit c/o.
  - **Cr:** By Sales Accounts (I003); By Direct Incomes (I001); By Closing Stock; By Gross Loss
    c/o.
- **Profit & Loss Account:**
  - **Dr:** To Gross Loss b/f; every other Expenses group (indirect); To Net Profit.
  - **Cr:** By Gross Profit b/f; every other Income group; By Net Loss.
- Each group lists its non-zero ledgers beneath it.

## Balance Sheet (as on a date)

- **Liabilities:** every Liabilities group, then Profit & Loss A/c (the year's net profit; a
  loss shows as a minus).
- **Assets:** every Assets group, then Closing Stock.
- **When the sides don't agree:** the gap is shown as "Difference in Opening Balances" on the
  shorter side, as Tally does. Causes are opening balances that don't net to zero, or opening
  stock that no ledger carries.

## Checked

- **Against a hand-computed book** (`packages/services/test/reports.test.ts`):
  - The book: capital 10,000, purchase 20 kg @ 80 + GST, cash sale 5 kg @ 120 + GST, rent 500.
  - Stock: 15 kg closing, value 1,200.
  - Trading: gross profit 200. P&L: net loss 300.
  - Balance Sheet: 11,408 on both sides, no difference.
- **In the browser:**
  - Every report, the voucher-lines popup and the godown filter.
  - The print layout of the Balance Sheet.
  - No page scroll at 1280×720 and 768×1024.

## Open point for the owner

Stock is valued at the item master's purchase rate, as MDA's dashboard does. Saving a purchase
doesn't update that rate. An item bought without a rate on its master is valued at 0 until the
rate is filled in on the Stock Item screen. This can turn a real gross profit into a loss in
P&L.
