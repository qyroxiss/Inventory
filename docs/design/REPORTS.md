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
- **Stock valuation (MDA's dashboard rule, plus a fallback):**
  - Value = quantity × the item's purchase rate, or its sale rate when the purchase rate is 0.
  - An item with neither rate is valued at the rate on its last active purchase bill dated on or
    before the report date. MDA's form never sets the rates, so without this, stock would show
    as 0. This is the owner's choice (2026-10-07).
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
  - With the rates cleared, stock is valued at the last purchase price as on each date (80 in
    May, 90 after a June purchase), and the item's own rate still wins when set.
- **In the browser:**
  - Every report, the voucher-lines popup and the godown filter.
  - The print layout of the Balance Sheet.
  - No page scroll at 1280×720 and 768×1024.

## Settled: stock valuation

- **The problem:** MDA values stock at the item's purchase rate, but its Stock Item form has no
  rate box. So an item made in the app was always valued at 0, which turned a real gross profit
  into a loss in P&L.
- **The owner's choice (2026-10-07):** do both of these.
  - Add Purchase Rate and Sale Rate to the Stock Item form (see INVENTORY-MASTERS.md).
  - Value any item whose rates are still 0 at its last purchase price.

## Added 2026-10-25: Ledger Statement, Trial Balance, Purchase Register, Outstanding

These are from WORKFLOW Phase 6; MDA has none of them. All four count **Active vouchers only**.
Screens: `apps/web/src/screens/reports/LedgerReports.tsx`. Queries: `packages/services/src/reports.ts`.
Maths: `packages/core/src/reports.ts`.

| Report | Filters | What it shows |
|---|---|---|
| **Ledger Statement** | Ledger (type to search), From, To | Opening balance (the ledger's opening ± every entry before From), then each entry: Date, Voucher No, Type, Particulars (the first account on the other side of the voucher), Narration, Debit, Credit, running Balance (Dr/Cr), and the closing balance |
| **Trial Balance** | As on | Every ledger with a balance, in Debit or Credit, with its top-level group, sorted by group then name. If the opening balances don't agree, the gap shows as "Difference in Opening Balances", so both sides total |
| **Purchase Register** | From, To, Show cancelled | Bills with supplier, GSTIN, supplier bill no., taxable, CGST/SGST/IGST, freight, round off, net |
| **Outstanding** | As on, Receivable / Payable | Bills not fully paid, by the dashboard's pending-bill rule (LOGIC-SPEC): a party's settlements clear its bills oldest first. Due = bill date + the ledger's credit days. Ageing columns: Not due, 1-30, 31-60, 61-90 and Over 90 days past due. Bills from a purchase are payable; all others are receivable |

**Tested:**
- `packages/core/test/ledger-reports.test.ts`
- The hand-computed book in `packages/services/test/reports.test.ts`:
  - The trial balance agrees.
  - Cash shows 10,000 + 708 − 500 = 10,208.
  - The purchase is payable and 60 days overdue on 30-06-2026.

## Added 2026-11-11: Stock Register

MDA has no Stock Register; the owner asked for one under Reports › Inventory Reports, after
Stock Summary. Screen: `apps/web/src/screens/reports/StockRegister.tsx`. Query:
`stockRegister` in `packages/services/src/reports.ts`. Maths: `packages/core/src/stock-register.ts`.
API: `/api/reports/stock-register?from&to&show=all|purchase|sales[&items=CODE1,CODE2]`.
Address: `/app/stock-register`.

- **Filters:**
  - From and To.
  - Item: **Single** (type to search one item) or **Multiple**. Multiple opens a list with an
    **All items** tick box and a tick box per item.
  - Show: **All**, **Purchase** or **Sales**.
- **Per item, like a ledger:** a heading (name · code · unit), Opening Balance, one row per
  movement (Date · Type · Bill No · Particulars · Inward · Outward · Balance · Rate · Amount),
  then Closing Balance with the Inward and Outward totals.
- **How it's worked out:**
  - Opening = the item's opening stock + every movement before From.
  - Balance = the stock after each row; Closing = the stock on To.
  - Particulars = the voucher's ledger, else the sale's customer name, else the narration.
  - Every stock movement counts: Purchase/Sales Invoices, Purchase/Sales Returns and Stock
    Journals. Cancelled documents have none.
- **Show (owner's choice, 2026-11-11):** it only hides rows. Purchase shows Purchase Invoices
  and Purchase Returns; Sales shows Sales Invoices and Sales Returns. Opening, Balance and
  Closing stay the item's real stock, so the Balance column can step across hidden rows. The
  closing line's Inward/Outward totals add up the rows shown.
- **All items:** every active item that has stock or a movement; items with neither are left
  out. A single item always shows, even when empty.
- **Phones:** the table keeps all its columns and scrolls sideways inside itself.

**Tested:** `packages/core/test/stock-register.test.ts`; the hand-computed book in
`packages/services/test/reports.test.ts` (Basmati Rice: +20 from Bharat Suppliers on PB-0001,
−5 to Acme Traders on SB-0001, closing 15; the Sales view from 05-05-2026 opens at 20). In the
browser: single, multiple, All items and the three Show views; no page scroll at 1280×720,
1366×768, 1920×1080, 1024, 820, 768, 390 and 360 widths.
