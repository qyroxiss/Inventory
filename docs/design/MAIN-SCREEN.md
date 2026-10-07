# Main screen — approved design

**Status:** D1 "Ledger Desk" is the approved main screen (owner, 2026-10-03), built the same day. D2 "Day Book" was approved and built first, then replaced by D1 at the owner's request. D2 and D3 stay on the canvas for reference.

**Owner's rule for this screen:** the dashboard must fit on one screen with no scrolling, Quick Actions included. Checked:
- at 1280×632, 1327×760, 1366×657, 1440×860, 1536×730 and 1920×960 browser windows
- both empty and with a full week of figures and 5 transactions (MDA lists the latest 5)

**Code:**
- `apps/web/src/screens/main/MainShell.tsx`: sidebar, header, Quick find, status bar
- `Dashboard.tsx`
- `SectionPage.tsx`: MDA's section page
- `ScreenPlaceholder.tsx`
- `nav.ts`: MDA's menu, icons and Quick Actions
- `packages/core/src/dashboard.ts`: MDA's formats and trend wording, tested against MDA's own cases
- `GET /api/dashboard` (`packages/services/src/dashboard.ts`)

**Data:** every figure comes from the open book by MDA's own queries (LOGIC-SPEC §12), counting Active documents only:
- **Total Stock Value:** opening quantity plus every movement, at the item's purchase rate (its sale rate when that is 0, and its last purchase price when both are 0; see REPORTS.md). The trend compares it with the opening stock value.
- **Today's Sales:** the net amount of today's sale bills, against yesterday's. The same figures, day by day, draw the 7-day bars.
- **Pending Bills:** bills raised (purchase bills and credit sales) with each party's settlements applied oldest first. A bill is overdue once its date plus the party's Credit Days has passed.
- **Cash Balance:** the ledgers directly under Cash-in-Hand, opening plus movements. The trend is today's movement.
- **Recent Transactions:** the five newest vouchers.

"Today" is the day in India, so the live server (which runs on UTC) agrees with the user's calendar. A book with no activity shows ₹0, "none overdue", empty bars and MDA's "No transactions yet.". Checked in `packages/services/test/dashboard.test.ts` against a hand-computed book.

| | |
|---|---|
| Live, clickable version | https://claude.ai/artifact/W7nZaGNoyDuL7AnX23CEZV (row "Main screen — three directions", D1) |
| Snapshot in this repo | [design/main/main-d1-approved.dc.html](../../design/main/main-d1-approved.dc.html) |
| Colours and fonts | [packages/ui/src/styles.css](../../packages/ui/src/styles.css) |
| MDA source | `main.dart` (MainShell: sidebar, header, dashboard, section pages, status bar), `dashboard_service.dart` (figures) |

## What the screen shows

**Sidebar:**
- "NAVIGATION", on ruled paper with the red margin.
- MDA's seven sections, numbered 01–07, each with its icon. The section you are in is highlighted and opens its items underneath (Masters shows its two groups). MDA's own placeholders show "Not built yet".
- Clicking a section opens MDA's section page: its name, "N entries · M categories", and a card per screen marked "Open →" or "Not built yet".

**Header:**
- the company and the FY pill
- **Quick find... (Ctrl K)**: searches every screen; ↑ ↓ and Enter open one
- Light/Dark
- the user's initial, name and role
- **Logout**. As in MDA, it closes the books and returns to Company & Year Setup.

**Dashboard, sized to the window:**
- the date and "Good morning/afternoon/evening, admin" with "Here's what's happening in your business today.", and the FY pill
- the four figures in one ledger strip, with MDA's trend text: Total Stock Value, Today's Sales, Pending Bills, Cash Balance
- "Sales — Last 7 Days" as bars, today in green, each labelled in MDA's short form (84K, 1.3L)
- Recent Transactions: money in green with an in-arrow, money out red with an out-arrow, following MDA's own list of which voucher types are inward and which are outward
- the six Quick Actions as one row at the bottom, in MDA's order: New Purchase, New Sale (dark), Receipt, Payment, Journal Entry, New Party

**Status bar:** "Ready", "Inventory", the account email (web only), "FY … · v1.0.0".

**What items open:** `/app/<screen>`. Until its screen is built, the page shows the item's name and its place in MDA's menu. MDA's working screens say they are rebuilt in Phase 5; MDA's own placeholders keep its "Not built yet".

## Decisions

- The greeting leaves out MDA's 👋.
- "Enterprise Edition" (under MDA's product name) is left out while the app is unbranded.
- "View all →" is plain text, because in MDA it opens nothing (quirk Q-36).
- Signing out of the website account stays on Company & Year Setup. This screen's Logout is MDA's book Logout.

**Wording:** every label is MDA's: the 7 menu sections and their items, "Quick find..." / "Ctrl K", "Logout", the greeting and "Here's what's happening in your business today.", the four figures, "Sales — Last 7 Days", "in Indian Rupees (₹)", "This Week", "Recent Transactions", "View all →", "Quick Actions" with its six actions, "Not built yet", and the status bar "Ready · … · FY … · v1.0.0".

## How to change it

As in [AUTH-SCREENS.md](AUTH-SCREENS.md#how-to-change-it): revise the canvas, approve, then update the code.
