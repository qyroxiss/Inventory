# GST Reports

**Status:** built 2026-10-07. MDA lists GSTR-1, GSTR-3B, GST Audit, HSN Summary and Input Tax
Credit, but shows "Not built yet" for each. They're built here from the posted sale and
purchase bills, following the GST return formats.

- **Code:**
  - `packages/core/src/gst.ts`: state codes, GSTR-1 grouping, the GSTR-3B set-off, the HSN
    roll-up and the audit wording.
  - `packages/services/src/gst.ts`: the queries and the audit checks.
  - `apps/web/src/screens/gst/GstReports.tsx`.
- **API:** `/api/gst/gstr1`, `/gstr3b`, `/hsn?side=out|in`, `/itc` and `/audit`, each taking
  `?from&to`.
- **Addresses:** `/app/gstr-1`, `/app/gstr-3b`, `/app/gst-audit`, `/app/hsn-summary`,
  `/app/input-tax-credit`.

## Shared rules

- **Bills counted:** only Active bills; cancelled ones are left out. Credit and debit notes
  carry no GST in MDA, so they don't appear.
- **Period:** it opens on the current month of the open year. **Month** picks any month of the
  year, and From/To set any period inside it.
- **Rate:** a line's rate is its combined rate (CGST % + SGST %, or IGST %).
- **Place of supply:**
  - It's the buyer's state: the bill's stored state code, else the first two digits of the
    bill's GSTIN.
  - When neither is known, it's the company's own state.
  - It's shown as "27-Maharashtra".
- **Print:** every report prints like the other reports.

## GSTR-1 (outward supplies)

- **Headline figures:** B2B invoices, B2C Large, B2C Small, Taxable, IGST, CGST, SGST, Nil /
  exempt.
- **Sections** (one shown at a time):
  - **B2B:** bills whose GST No is filled in, one row per invoice and rate. Columns: GSTIN,
    Party, Invoice, Date, Value, Place of Supply, Rate, Taxable, IGST, CGST, SGST.
  - **B2C Large:** no GSTIN, inter-state, and bill value above ₹1,00,000. That limit has applied
    since 1 Aug 2024; it was ₹2,50,000 before. One row per invoice and rate.
  - **B2C Small:** every other unregistered bill, summed by place of supply and rate, marked
    Inter or Intra.
  - **HSN:** the outward HSN summary.
- **0% lines** count as nil rated or exempt, not in the tables above.

## GSTR-3B (summary return)

- **3.1 Outward supplies:**
  - (a) taxable outward supplies (Taxable, IGST, CGST, SGST);
  - (c) nil rated and exempted.
- **4 Eligible ITC:** (A)(5) all other ITC, from purchases from suppliers with a valid GSTIN.
- **6.1 Payment of tax:** tax payable, paid through ITC, payable in cash, and ITC carried
  forward.
- **Set-off order (sec. 49, rule 88A):**
  - IGST credit pays IGST first, then CGST, then SGST.
  - CGST credit pays CGST, then IGST.
  - SGST credit pays SGST, then IGST.
  - CGST credit never pays SGST, and SGST credit never pays CGST.

## HSN Summary

- Lines grouped by HSN code and rate.
- **Columns:** HSN, Description (the first item name seen), UQC (the unit), Qty, Rate, Taxable,
  IGST, CGST, SGST, Total.
- **Outward (sales)** or **Inward (purchases)**. Items with no HSN show "—".

## Input Tax Credit

- One row per purchase bill: Date, Bill No, Supplier's invoice no, Supplier, GSTIN, Taxable,
  IGST, CGST, SGST, ITC, Status.
- **Status:** "Eligible" when the supplier has a valid GSTIN, otherwise "No GSTIN".
- The totals count eligible credit only.

## GST Audit (errors first)

- **Company:**
  - No GSTIN: an error.
  - No state, so every supply is treated as intra-state: a warning.
- **Party GSTIN:** a customer or supplier (and groups directly under them) whose GSTIN fails the
  format or check digit (the same check as Ledger Creation). An error.
- **Sale bill:** a bill's own GST No that fails the check. An error.
- **Tax split:** a bill billed as CGST + SGST when the states say IGST, or the other way round.
  Checked only when both states are known. An error.
- **Input tax credit:** tax taken on a purchase from a supplier with no valid GSTIN. A warning.
- **HSN code:** an item on the period's bills with no HSN. A warning.
- **GST rate:** a Taxable item billed at 0%. A warning.
- **Tax ledger:** an Output or Input CGST/SGST/IGST ledger whose movement in the period differs
  from the bills' tax, for example after a manual journal to a tax ledger. A warning.
- With nothing found: "No problems found for this period."

## Checked

- **Core** (`packages/core/test/gst.test.ts`): the B2B / B2C Large / B2C Small / nil split, and
  the set-off order in both directions.
- **Service** (`packages/services/test/gst.test.ts`), on a hand-checked month:
  - The Karnataka buyer is B2B with IGST 135; the walk-in sale is B2C Small with CGST and SGST
    27 each.
  - ITC: 360 eligible, 60 not.
  - GSTR-3B: everything is paid through ITC, and 18 CGST and 153 SGST are carried forward.
  - Purchase HSN summary.
  - The audit's findings, including a journal to Output CGST.
- **Browser:** every screen, the GSTR-1 sections, the HSN Inward switch and the month picker. No
  page scroll at 1280×720 and 768×1024; phones scroll.
