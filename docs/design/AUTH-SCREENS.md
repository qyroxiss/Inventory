# Auth screens — approved design

**Status:** approved by the owner on 2026-10-03 as the starting point. Further changes are expected after review by the project guide; see [How to change it](#how-to-change-it).

| | |
|---|---|
| Approved design | **A6 · Ledger, many companies** |
| Live, clickable version | https://claude.ai/artifact/W7nZaGNoyDuL7AnX23CEZV (private: share it from the page's **Share** menu) |
| Snapshot in this repo | [design/auth/login-a6-approved.dc.html](../../design/auth/login-a6-approved.dc.html) |
| Colours and fonts in code | [packages/ui/src/styles.css](../../packages/ui/src/styles.css) (the theme file) |

The other directions on the canvas (A–A5, B, C) are kept for reference only.

**Account sign-in (web only, before Company & Year Setup): S3 · Quiet**, approved on 2026-10-03 and built on 2026-10-03 (`apps/web/src/screens/AccountScreen.tsx`, `apps/web/src/lib/account.ts`; account Logout is in the header strip). Snapshot: [design/auth/account-signin-s3-approved.dc.html](../../design/auth/account-signin-s3-approved.dc.html).
- Same header strip and colours as A6.
- **Left:** ruled ledger paper with only today's date and a very large "*Inventory.*" (the brand name and logo go here later).
- **Right:** a Sign In / Create Account switch.
  - **Sign In** ("Enter your credentials to continue"): Email, Password (Show/Hide), "Remember me", **Sign In →**.
  - After Create Account or Sign In, it goes straight to Company & Year Setup (the canvas shows a "Signed In" stand-in whose **Continue** opens the A6 artboard).
  - **Create Account:** Name, Email, Password + Confirm (8+ characters), **Create Account →**.
  - **Messages:** the sign-in system's own wording: `Required`, `Invalid email`, `Invalid email or password`, `Password too short`, `User already exists. Use another email.`; plus MDA's `Passwords do not match`.
- **No "Forgot password?"** until an email service is chosen.
- S1 (Journal page) and S2 (Financial year) are on the canvas for reference.

## Where it lives in code

| Part | File |
|---|---|
| Whole screen (joins the two halves, loads the data, follows MDA's selection rules) | `apps/web/src/screens/books/BooksScreen.tsx` |
| Left half: index of books, search, A–Z, keyboard | `apps/web/src/screens/books/BookIndex.tsx` |
| Right half: sign in, forced password change | `apps/web/src/screens/books/SignInPanel.tsx` |
| Header strip (name, date, Light/Dark) | `apps/web/src/components/AppHeader.tsx` |
| Shared pieces (labelled boxed field, buttons, serif heading) | `apps/web/src/components/ledger.tsx` |
| Remember me (username only) / theme choice | `apps/web/src/lib/remember.ts`, `apps/web/src/lib/theme.ts` |
| Data for the index: every company with its years | `GET /api/book-index` (`packages/services/src/book-index.ts`) |

After sign-in, `/app` shows a stand-in "Signed In" page (company, year, user, Logout) until the main screen is designed.

### Where the code differs from the canvas mock, and why

| Canvas mock | Code | Why |
|---|---|---|
| Choosing a company selects its **latest** year | Selects its **first** year (oldest first, in name order); on open, the first company and its first year are selected | That's what MDA does (`company_setup_page.dart` `_loadYears` picks index 0). The rule is to port MDA's behaviour exactly. Switching to "latest" is a one-line change in `BooksScreen.tsx` if wanted. |
| **City** column; search by name or city | **State** column; search by name or state | MDA's company form never fills City (only State), so the column would always be empty. City is shown if a company ever has one. "Not Applicable" shows as blank. |
| (not shown) | Empty states: "No companies yet", "No year yet", "No Year", "No Company" | Needed by real data; worded plainly in the same style. |
| Done screen inside the panel | Goes to `/app` | MDA opens the main shell after login. |

---

## What the screen does

A full-screen split. The left side is the company & year list on ruled paper; the right side is the sign-in.

**Wording rule (owner, 2026-10-03):** screen names, headings, labels and buttons use MDA-Inventory's own words, never invented ones. Only a feature MDA doesn't have (search, the account sign-in) gets plain new wording.

**Left: choose company and year (MDA `company_setup_page.dart`)**
- **Heading:** "N companies" and **"Company & Year Setup"** (MDA's title).
- **Buttons:** **+ New Company** (solid dark) and **Manage Years** (outlined), beside the heading.
- **Search Company** by company name or state (the canvas said city; see the table above):
  - matches are underlined, and the count shows "3 of 40 companies"
  - Enter opens the first match, Esc clears the search
  - "No company matches …" offers Clear search
- **List:** No. · Company Name · State · Years, in name order as in MDA.
  - Only the list scrolls; the page stays still.
  - Choosing a company opens its years underneath and selects its first year (MDA's rule).
- **A–Z bar:** jump to a letter; letters with no companies are greyed out.
- **Keyboard:**
  - ↑ ↓, Home and End move through the list
  - typing a letter jumps to the next company with that letter
  - Enter opens a company; ← → moves between years; Enter picks a year and moves the cursor to the password
- **Removed on purpose:** "Recently opened". MDA's Remember Me keeps only the username.

**Right: sign in (MDA `auth_page.dart`)**
- **Header:** the company name, then FY and dates, above a double rule (MDA's company chip).
- **"Sign In"** with "Enter your credentials to continue" (MDA's wording).
  - **User Name** (hint "Enter username") is pre-filled with `admin`; Enter moves to the password (hint "Enter password").
  - The password has a Show/Hide toggle.
  - "Remember me".
  - **Sign In →** (green).
- **Errors:** MDA's exact messages, such as `Required` and `Invalid username or password`.
- **Forced change "Set a new password":** the MDA rules (6+ characters, not `admin`, must match). Cancel shows `Password change is required to continue.`
- **Header strip:** the plain "Inventory" name (unbranded), today's date, and a Light/Dark switch.

**Phones and tablets (added 2026-10-04):** the sign-in comes first and the company list sits below it, since the first company and year are already chosen. A ▾ button beside the company name jumps to the list, and picking a year scrolls back up to the password. On phones the FY line drops its date range and a long company name stays on one line.

**Import from MDA (added 2026-10-05; MDA has no such button):** the third button beside the heading. It opens a folder picker for MDA-Inventory's data folder, the one holding `MDA_Registry.db`. Usually that's `%APPDATA%\MDA Inventory\Data`, or the `data` folder beside MDA's program file.
- The browser reads MDA's files (sql.js) and never changes them. The server copies each company, its years, and per year its users, groups, ledgers, Misc_Master lists and audit log into the signed-in account (`packages/services/src/mda-import.ts`).
- MDA's passwords work unchanged (same `pbkdf2$20000$…` format).
- A company whose CompCode the account already has is skipped (`Company "X" already exists`), so importing twice changes nothing.
- A year whose file is missing gets a fresh book, as MDA would create one.
- Messages: `Company "X" imported (1 year)`, `Company "X" already exists`, `MDA_Registry.db not found in the selected folder`, `No MDA companies found in the selected folder`.
- Also carried: every Inventory Master, stock items (Part_Master) included.
- Not carried yet: purchases, sales, vouchers and the other transaction tables. Each is added to the import when its screen is built.

## Visual system

| Token (in styles.css) | Light | Dark | Used for |
|---|---|---|---|
| `--background` (desk) | `#F1EEE6` | `#0F1012` | page, header strip |
| `--card` (paper) | `#FBF9F3` | `#16171A` | ruled index panel |
| `--foreground` (ink) | `#1C1B18` | `#ECE8DE` | text, the border of a field in use, dark button |
| `--muted-foreground` | `#5C5850` | `#A6A194` | labels, hints |
| `--primary` (green) | `oklch(0.42 0.09 160)` | `oklch(0.78 0.1 160)` | main action |
| `--accent` | `oklch(0.95 0.03 160)` | `oklch(0.27 0.035 160)` | selected row |
| `--border` | `#DED8C9` | `#2C2D31` | row rules |
| `--destructive` | `#B42318` | `#F97066` | errors |
| `--ledger-ruled` / `--ledger-margin` | faint blue lines / red margin | dimmed | paper texture |

**Fonts:** all three are bundled with the app, so the offline desktop version works.

| Font | Use |
|---|---|
| Instrument Serif | headings |
| IBM Plex Sans | body |
| IBM Plex Mono | labels, dates, codes |

**Shapes and sizes:**
- Square corners (`--radius: 0`).
- Buttons and rows are at least 44 px tall.
- Designed for desktop and laptop screens (1280 px and wider).

---

## How to change it

This setup is deliberate, so that changes stay cheap, even big ones.

1. **Collect the feedback.** Your guide can review the live link and leave comments on any spot of the design, once you share it from the page's **Share** menu. You can also simply tell me the changes in chat.
2. **I revise the design on the canvas first** and you approve it there. No code changes until the design is agreed.
3. **I update the code to match:**
   - **Colours, fonts, corners:** one value in `packages/ui/src/styles.css` changes every screen at once.
   - **Overall size ("zoom"):** `--ui-scale` in the same file, currently `0.85` (set on 2026-10-03 because full size felt congested). `1` is the design's full size; lower values fit more on screen.
   - **Wording:** button and heading text sits in the screen file. MDA's validation messages sit in `packages/core/src/book-login.ts` and `company.ts`; they're kept verbatim unless you ask to change them.
   - **Layout** (moving things, adding or removing sections): changes in `BookIndex.tsx` / `SignInPanel.tsx` only. The login logic, API and database are separate and don't change.
4. **Each approved version is snapshotted** in `design/auth/` (for example `login-a7-approved.dc.html`), so earlier versions can always be compared or restored.

Changing *behaviour* (for example adding "Recently opened" back, or changing a login rule) is a logic change. Per the owner's rule, it's only made when asked, and it's recorded in LOGIC-SPEC.
