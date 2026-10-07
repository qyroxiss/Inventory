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

- **Title:** "Masters › Company Creation" / "Company Creation". While editing, both say **Update**. **Back** sits top-left, beside the breadcrumb (see [Layout rules](#layout-rules-every-inner-screen)).
- **Layout:** three columns of `Label : field` rows on ruled paper, read down then across in MDA's own field order (so Enter still moves through the fields exactly as in MDA). Changed from two columns on 2026-10-04 so the whole form fits one screen.
  - **Column 1, COMPANY INFORMATION:** Company Name *, Mailing Name, Address, State (MDA's 37 entries), Country (India / Others), Pincode, Telephone.
  - **Column 2:** Mobile, Fax, E-mail, Website (Company Information, continued); STATUTORY DETAILS: GSTIN, PAN, CIN.
  - **Column 3:** BANK DETAILS (PRINTED ON INVOICES): Bank Name, Branch, A/c Number, IFSC Code; FINANCIAL YEAR: Fin. Year From, Books From (both 1-Apr-26); BASE CURRENCY: read only, two to a row.
  - On a narrow window the third column drops below the other two.
- **Keyboard:** Enter moves to the next field; the cursor starts in Company Name.
- **Buttons, as in MDA:**

  | Button | What it does |
  |---|---|
  | Cancel, Back | Back to Company & Year Setup |
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
- **Back** (top-left, above "SELECT COMPANY") returns to Company & Year Setup. MDA's Back quits the app (quirk Q-01).

## Owner's changes (2026-10-07)

Not in MDA; added on the owner's request. Rules in `packages/core/src/contact.ts` and `company.ts`, checked again on the server.

- **Company Creation and Tools › Company Settings:**
  - **Telephone** and **Fax** are landlines: digits, spaces, `+`, `-` and brackets only, 6 to 15 digits (hint "022 2345 6789").
  - **Mobile** has a country code picker (India +91 first, then the Gulf, neighbours and other common countries) and takes digits only. For +91: exactly 10, starting 6–9. Elsewhere: 6 to 12. It's stored as "+91 9876543210". A number saved before without a code reads as +91.
  - **GSTIN** at most 15, **PAN** 10, **CIN** 21, letters and digits only. CIN must be in its format (e.g. U12345MH2020PTC123456).
  - **A/c Number:** digits only, 9 to 18. **IFSC:** 11 characters, 4 letters, then 0, then 6 letters or digits (e.g. SBIN0001234).
  - Every one of these stays optional. Typing past a limit stops; pasted letters are dropped from a number box.
- **"No year yet. Add one with Manage Years."** — "Manage Years" is a link that opens Manage Years with that company chosen. The same goes for the "No Year" panel and the Manage Years button (it opens on the selected company).
- **Manage Years:**
  - Opens on the company in the address (`/years?company=…`), and Back returns to Company & Year Setup with it still selected.
  - **Year Name** offers the five years around today (newest first, leaving out years the company has) and still takes typing. "2026-27" becomes "2026-2027".
  - Picking or typing a year range fills **From 01/04** and **To 31/03** of the next year. Both stay editable, and their calendars open on those dates. This is what stops the dates on Company & Year Setup from disagreeing with the year's name.

## Layout rules (every inner screen)

Set by the owner on 2026-10-04, for every screen built so far and every one after:

1. **No scrolling while space is left on the screen.** Fields are placed to use the full width (more columns, balanced column lengths) instead of making the page scroll. Checked on every screen at 1280×720, 1366×768, 1440×900 and 1920×1080, including with validation messages showing and while editing a record. Lists that can grow without limit (company lists, View dialogs) still scroll inside themselves; the page around them doesn't.
2. **Every screen works on phones and tablets too** (added 2026-10-04). Three layouts:
   - **Laptop (1024px and wider):** as designed, at 0.85 scale, with rule 1's no-scroll check.
   - **Tablet (768–1023px):** full scale. The sidebar becomes a ☰ drawer that closes once a page opens, the top bar shrinks to company + FY, a search icon and Logout, and side-by-side panels stack.
   - **Phone (under 768px):** everything from tablet, plus form labels move above their fields, multi-column forms become one column (still in MDA's field order), button bars wrap with the main action full width at the bottom, and list dialogs drop secondary columns. Pages scroll normally here, which is expected on a phone.
   - Keyboard hints are hidden on touch screens. Where MDA needs a double-click (Ledger List), tapping a highlighted row again opens it.
   - Checked on every screen at 360, 390, 768, 820 and 1024px wide: nothing past the screen edge, and the drawer opens and closes.
3. **Back is always in the same place: top-left, first thing in the page header**, before the breadcrumb, as in MDA's own page header. It's a bordered button with an arrow and the word "Back" (`apps/web/src/components/BackButton.tsx`), so someone who isn't used to computers can find it without hunting. The Masters screens' old underlined "← Masters" link at the bottom of the page is gone.
4. **Every field is a bordered box** (owner, 2026-10-06): text fields, drop-downs, text areas and search boxes, never a single underline. One style everywhere: `field-box` in [packages/ui/src/styles.css](../../packages/ui/src/styles.css), with `field-error` for the red error box. A field has a soft border at rest and an ink border while in use, on a slightly brighter background than the paper (`--field`, `--field-border`, light and dark).

## How to change it

As in [AUTH-SCREENS.md](AUTH-SCREENS.md#how-to-change-it): revise the canvas, approve, then update the code. Colours change in the theme file, labels in `fields.ts`, and layout in the two screen files.
