# New Company and Manage Years — approved design

**Status:** M1 and M2 were approved by the owner on 2026-10-03 and built the same day. The M1b variant (section index + print preview) was considered and set aside.

| | |
|---|---|
| Live, clickable version | https://claude.ai/artifact/W7nZaGNoyDuL7AnX23CEZV (row "New Company and Manage Years") |
| Snapshots in this repo | [design/masters/company-creation-m1-approved.dc.html](../../design/masters/company-creation-m1-approved.dc.html), [design/masters/manage-years-m2-approved.dc.html](../../design/masters/manage-years-m2-approved.dc.html) |
| Code | `apps/web/src/screens/company/CompanyScreen.tsx`, `fields.ts` (labels and lists), `YearsScreen.tsx` |
| Colours and fonts | [packages/ui/src/styles.css](../../packages/ui/src/styles.css) |

**Wording:** every title, label, hint, button and message is MDA's own (rule: [AUTH-SCREENS.md](AUTH-SCREENS.md#what-the-screen-does)). Field labels and lists live in `fields.ts`; messages live in `packages/core/src/company.ts` and `validators.ts`.

## M1 · New Company — MDA "Company Creation" (`company_creation_page.dart`)

- **Title:** "Masters › Company Creation" / "Company Creation". While editing, both say **Update**.
- **Layout:** two columns of `Label : field` rows on ruled paper.
  - **Left column, COMPANY INFORMATION:** Company Name *, Mailing Name, Address, State (MDA's 37 entries), Country (India / Others), Pincode, Telephone, Mobile, Fax, E-mail, Website.
  - **Right column:**
    - STATUTORY DETAILS: GSTIN, PAN, CIN
    - BANK DETAILS (PRINTED ON INVOICES): Bank Name, Branch, A/c Number, IFSC Code
    - FINANCIAL YEAR: Fin. Year From, Books From (both 1-Apr-26)
    - BASE CURRENCY: read only
- **Keyboard:** Enter moves to the next field; the cursor starts in Company Name.
- **Buttons, as in MDA:**

  | Button | What it does |
  |---|---|
  | Cancel, ← Back | Back to Company & Year Setup |
  | View | "Select Company" list (Code · Company Name · State, "N record(s)", ↑↓ / Enter / Esc). Picking a company opens it for update. |
  | Save Company | Saves, shows `Company "X" saved successfully`, goes back to Company & Year Setup |
  | Update Company | Saves, shows `… updated successfully`, stays on the page |
  | New | Clears the form (editing only) |
  | Delete | MDA's confirmation, then `Company "X" deleted`, then a cleared form. The company's years go too; its books are kept (MDA keeps the .db files). |
  | Print | MDA's "COMPANY MASTER" sheet through the browser's print dialog; the footer reads "Printed by Inventory" (unbranded) |

- **Messages:** `Required`, `GSTIN must be 15 characters`, `Invalid GSTIN format`, `Invalid GSTIN check digit`, `PAN must look like AAAAA9999A`, `No companies found`, `Error saving company: …`.
- **Left out on the web:** "Company Data Path". MDA shows a fixed Windows folder there; it will be shown in the desktop app only.

## M2 · Manage Years — MDA "Manage Company Years" (`company_year_page.dart`)

- **Left, SELECT COMPANY:** the company list. The chosen company gets MDA's `=>` marker. No company is selected at first, as in MDA.
- **Right:**
  - "Managing:" and the company name, or "Select a company to manage its financial years".
  - **ADD FINANCIAL YEAR:** Year Name (hint 2026-2027), From Date, To Date, **Save Year →**.
    - The dates are read-only boxes that open the browser's calendar on click, Enter or Space, and fill in dd/mm/yyyy.
    - After a save the three boxes clear.
  - **FINANCIAL YEARS:** Year · From · To, with a Delete button per row and MDA's confirmation. Only the record is removed; adding the same year again re-attaches its books.
- **Messages:** `Required`, `Format: YYYY-YYYY`, `Please select a company first`, `Year "X" added for Y`, `Year "X" already exists for this company`, "No companies found. Create a company first.", "Select a company to see its years", "No financial years added yet".
- **← Back** returns to Company & Year Setup. MDA's Back quits the app (quirk Q-01).

## How to change it

As in [AUTH-SCREENS.md](AUTH-SCREENS.md#how-to-change-it): revise the canvas, approve, then update the code. Colours change in the theme file, labels in `fields.ts`, and layout in the two screen files.
