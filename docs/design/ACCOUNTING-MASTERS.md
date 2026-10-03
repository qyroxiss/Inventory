# Accounting Masters — Group Master and Sub Group Master

**Status:** Group Master was built on 2026-10-04, then Sub Group Master the same day — both
directly from docs/LOGIC-SPEC.md §7 and the MDA source (`group_master_page.dart`,
`sub_group_master_page.dart`), rather than a new canvas round. Both reuse M1/M2's visual
language: one form on ruled paper, a View dialog for the list, confirm dialogs, and a Print
sheet. They share one table; the rest of Inventory Masters (Stock Group, Stock Sub Group, Stock
Item, Godown, Unit, Sale Type) are not built yet and follow next.

|                   |                                                                                                    |
| ----------------- | -------------------------------------------------------------------------------------------------- |
| Code              | `apps/web/src/screens/masters/GroupMasterScreen.tsx`, `SubGroupMasterScreen.tsx`                   |
| Business logic    | `packages/core/src/groups.ts` (fields, messages, code generation, the 28-group seed)               |
| Service layer     | `packages/services/src/groups.ts`                                                                  |
| API               | `GET/POST /api/groups`, `PUT/DELETE /api/groups/:grpCode`, and the same four for `/api/sub-groups` |
| Table             | `account_groups` (Maacct2 in MDA — docs/LOGIC-SPEC.md §2), shared by both screens                  |
| Colours and fonts | [packages/ui/src/styles.css](../../packages/ui/src/styles.css)                                     |

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

## How to change it

As in [AUTH-SCREENS.md](AUTH-SCREENS.md#how-to-change-it): colours in the theme file, wording and
the seed list in `packages/core/src/groups.ts`, layout in `GroupMasterScreen.tsx` /
`SubGroupMasterScreen.tsx`. Since neither was designed on the canvas, a future change can still
start there if a visual redesign (rather than a wording or field change) is wanted.
