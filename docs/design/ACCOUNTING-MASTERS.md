# Accounting Masters — Group Master, Sub Group Master and Ledger Creation

**Status:** Group Master was built on 2026-10-04, then Sub Group Master the same day, then Ledger
Creation shortly after — all three directly from docs/LOGIC-SPEC.md §7 and the MDA source
(`group_master_page.dart`, `sub_group_master_page.dart`, `ledger_creation_page.dart`), rather
than a new canvas round. All three reuse M1/M2's visual language: one form on ruled paper, a View
dialog for the list, confirm dialogs, and a Print sheet. The remaining Inventory Masters (Stock
Group, Stock Sub Group, Stock Item, Godown, Unit, Sale Type) are not built yet and follow next.

Every screen's breadcrumb and heading follow MDA's own header exactly: "Masters › _Screen
Name_" on the left, an "Accounting Master" pill badge on the right — not "Masters › Accounting
Masters" as Group Master and Sub Group Master originally had it (a layout assumption made before
either screen's real header source was checked; corrected once Ledger Creation's own header was
read directly from `ledger_creation_page.dart:1538-1566`).

|                       |                                                                                                                 |
| --------------------- | --------------------------------------------------------------------------------------------------------------- |
| Code                  | `apps/web/src/screens/masters/GroupMasterScreen.tsx`, `SubGroupMasterScreen.tsx`, `LedgerCreationScreen.tsx`    |
| Business logic        | `packages/core/src/groups.ts`, `packages/core/src/ledgers.ts` (fields, messages, code generation, the 28-group seed) |
| Service layer         | `packages/services/src/groups.ts`, `packages/services/src/ledgers.ts`, `packages/services/src/misc-list.ts`    |
| API                   | `GET/POST /api/groups`, `PUT/DELETE /api/groups/:grpCode`, the same four for `/api/sub-groups` and `/api/ledgers`, `GET /api/groups/all` (every group and sub group, for Ledger Creation's Under Group list), `GET/POST /api/misc-list` |
| Tables                | `account_groups` (Maacct2), `ledgers` (Maacct), `misc_list` (Misc_Master) — docs/LOGIC-SPEC.md §2              |
| Colours and fonts     | [packages/ui/src/styles.css](../../packages/ui/src/styles.css)                                                 |

## Group Master

Reached from the sidebar: **Masters → Accounting Masters → Group Master** (`/app/group-master`).

- **Breadcrumb and heading:** "Masters › Accounting Masters" / "Group _Master_".
- **GROUP DETAILS form**, a single column: Group Name\*, Group Type\* (Liabilities / Expenses /
  Assets / Income, in that order — MDA's own, not alphabetical), Group Ledger (Yes/No, defaults
  to No).
- **Buttons:** Cancel (editing only) · View · Remove · Print (editing only) · Save Group / Update
  (MDA's own labels — Save says "Save Group", Update is bare "Update", Remove is "Remove", never
  "Delete"). Save/Update moves right, as in M1.
- **View** opens the same style of dialog as M1's "Select Company": Code · Group Name · Type ·
  Ledger, ↑↓/Enter/double-click, only **top-level** groups (MDA's own filter — sub groups belong
  to Sub Group Master).
- **Print** sends the same top-level list to the browser's print dialog as a plain "GROUP MASTER"
  sheet, footer "Printed by Inventory" (unbranded), exactly like M1's "COMPANY MASTER" sheet.
- **A new book is seeded with MDA's 28 default groups** (16 top-level, 12 nested under them) the
  moment its financial year is created, the same seed MDA has always used
  (`db_service.dart:936-984`, docs/LOGIC-SPEC.md §3).

**Wording:** every label, hint and message is MDA's own: "Group name is required", "Please select
a group type", `Name is Already Exists..` / `This Name Already Exists` (two different wordings on
purpose — MDA has them on the Save and Update paths respectively), "Wants to update/remove this
record…?", "This record will be not deleted", "Group Master" / "N record(s)".

## The Q-16 quirk, exactly as MDA has it

Every group Group Master can load is top level, and MDA permanently disables **Delete** for all of
them, and disables **Update** by mouse but not by keyboard (docs/LOGIC-SPEC.md Q-16):

- **Remove** is a genuinely inert button (native `disabled`) once a group is loaded — neither the
  mouse nor Enter can reach it, matching MDA's own dead-code guard.
- **Update** looks the same (dimmed, no click handler), but pressing **Enter** while it is focused
  still opens the confirm dialog and saves — exactly MDA's behaviour, kept rather than "fixed".

Both sides of this were checked end to end: a mouse click does nothing, Enter still works.

## Sub Group Master

Reached from the sidebar: **Masters → Accounting Masters → Sub Group Master**
(`/app/sub-group-master`). Edits the rest of the same `account_groups` table — anything that
isn't top level.

- **SUB GROUP DETAILS form:** Sub Group Name\*, Under Group\* (a dropdown of every top-level
  group, placeholder "Type to search group..." — MDA's own hint text, carried over even though
  MDA's version is a live typeahead and this is a plain list for now).
- **Buttons:** Cancel (editing only) · View · Print · Remove (editing only) · Save Sub Group /
  Update. Unlike Group Master, **Update and Remove work normally here, by mouse** — nothing a
  sub group ever has is top level, so Q-16 never applies to this screen.
- **View** ("Sub Group Master — N records"): Code · Sub Group Name · Under Group, the parent's
  name joined in, exactly as MDA's self-join does.
- **Print** sends the same list to a "SUB GROUP MASTER" sheet.
- **Wording:** its own messages, separate from Group Master's — "Sub group name is required",
  "Please select an under group", `Error: Sub Group "X" may already exist.` on Save,
  `Error: "X" may conflict with an existing sub group.` on Update, "Update record "X"?",
  `Remove "X"?\nThis cannot be undone.`. **Removing a sub group shows its toast in the
  error/red colour, even though it succeeded** — a real MDA quirk, kept exactly.

### The Q-18 quirk, exactly as MDA has it

A sub group's category (Group Type) is set **once**, from whichever top-level group it's created
under. Changing **Under Group** later — moving "Petty Cash" from Current Assets to Capital
Account, say — re-parents it, but its type stays whatever it started as, even though the new
parent is a different type. MDA never recomputes it on update, so neither do we. Checked end to
end: re-parenting a sub group into a group of a different type leaves its type untouched.

## Ledger Creation

Reached from the sidebar: **Masters → Accounting Masters → Ledger Creation**
(`/app/ledger-creation`). Creates/edits actual accounts (ledgers) — customers, suppliers, cash,
bank, expense accounts, and so on. The biggest Master screen so far: 14 fields across two
responsive columns (stacking below 680px), plus an Opening Balance bar.

- **Left column:** Name\*, Address (multiline), City\* (type-to-add, learns new entries), State\*
  (36 Indian states/UTs), Country (India/Others, default India), Pincode\* (6 digits, must not
  start with 0), Mobile No., Email, PAN No., Aadhar No.
- **Right column:** Under Group\* (every group _and_ sub group by name, unlike Sub Group Master's
  own Under Group list, which is top-level groups only), Sales Executive, Reg. Type (default
  Regular), GSTIN / UIN.
- **Three fields are shown but MDA never saves them anywhere — Aadhar No., Sales Executive and
  Reg. Type** have no matching column in Maacct and are never read back, not sent to the API at
  all here. Kept in the form for look and feel only. Country is collected too but likewise never
  saved (no Country column on Maacct).
- **Opening Balance bar:** amount + Dr/Cr toggle (green Dr, red Cr), labelled "(on _1-Apr-YY_)" —
  computed live from today's date, not the open book's own financial year (MDA's own quirk, kept).
- **Buttons:** Print · View · **Cancel (always shown, and always navigates back to Masters)** ·
  Save Ledger / Update Ledger + Remove Ledger. Unlike Group/Sub Group Master, Cancel here is never
  a "clear the form" action — MDA's own `_cancel` is a bare `Navigator.pop()` for this screen only
  (`ledger_creation_page.dart:382,633`, checked directly against Group/Sub Group Master's own
  Cancel, which really does just clear the form there — a genuine, source-verified difference
  between screens, not an inconsistency in the rebuild).
- **View** ("Ledger List — N records"): Code · Ledger Name · Under Group · Op. Bal · Dr/Cr. No
  Enter-to-select here, unlike Group/Sub Group Master's own View dialogs — only ↑↓ to move,
  double-click to open, Esc to close (checked directly against `_LedgerViewDialog`'s key handler,
  which really does omit Enter).
- **Print** sends the same 5 columns to the browser's print dialog as "Ledger Master List" (note
  the different casing from Group Master's "GROUP MASTER" — MDA's own inconsistency, kept as is).
  MDA's own Print here is a 5-option Printer/PDF/WhatsApp/Excel/Word dialog; out of scope for the
  web build for now, revisited once the desktop app work starts.
- **Remove** is blocked if the ledger's been used in any voucher line, with MDA's own message —
  `"$name" is used in $usedCount voucher line(s) and cannot be removed. Mark it inactive instead.`
  — even though no screen anywhere actually has an inactive toggle (a dead-end message, kept
  verbatim). Vouchers don't exist yet in this rebuild (Phase 1), so the usage check is a stub that
  always reports none for now; shaped so the real count can drop in later without touching its
  callers or this screen.
- **A ledger loaded for edit never resets Aadhar/Sales Executive/Reg. Type/Country** — MDA's own
  `_loadForEdit` never touches them, so whatever was last typed or selected stays on screen across
  record loads, only reset by Save/Update/Remove's own form-clear. Checked end to end: typing into
  Aadhar, then double-clicking a different ledger in View, leaves that typed value untouched.
- **Wording:** its own messages — "Name is required", "City is required", "State is required",
  "Pincode is required" / "Pincode must be 6 digits", a bare **"Required"** for Under Group (not
  "Under Group is required" — a genuine MDA inconsistency against City/State's fuller phrasing,
  kept as is), `Name is Already Exists..` on **both** Save and Update (unlike Group Master's two
  different wordings — checked directly, Ledger Creation really does use the identical string
  both times), "Update record…?", `Remove "X"?\nThis cannot be undone.`.
- City's "type to add new" entries are stored in `misc_list` (Misc_Master in MDA) — a small shared
  table Unit, Godown, Stock Group and Sale Type masters will also use later, same as MDA's does.

## How to change it

As in [AUTH-SCREENS.md](AUTH-SCREENS.md#how-to-change-it): colours in the theme file, wording and
the seed list in `packages/core/src/groups.ts` / `ledgers.ts`, layout in `GroupMasterScreen.tsx` /
`SubGroupMasterScreen.tsx` / `LedgerCreationScreen.tsx`. Since none of the three was designed on
the canvas, a future change can still start there if a visual redesign (rather than a wording or
field change) is wanted. The type-to-filter dropdown (City, State, Under Group, Sales Executive)
is `apps/web/src/components/SearchSelect.tsx` — a generic component, reusable by later Masters.
