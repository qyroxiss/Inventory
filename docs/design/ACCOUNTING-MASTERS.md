# Accounting Masters — Group Master

**Status:** Group Master was built on 2026-10-04, directly from docs/LOGIC-SPEC.md §7 and the
MDA source (`group_master_page.dart`) — the same information already approved there — rather
than a new canvas round. It reuses M1/M2's visual language: one form on ruled paper, a View
dialog for the list, confirm dialogs, and a Print sheet. Sub Group Master and the rest of
Inventory Masters (Stock Group, Stock Sub Group, Stock Item, Godown, Unit, Sale Type) are not
built yet; they read and write some of the same table and follow next.

|                   |                                                                                      |
| ----------------- | ------------------------------------------------------------------------------------ |
| Code              | `apps/web/src/screens/masters/GroupMasterScreen.tsx`                                 |
| Business logic    | `packages/core/src/groups.ts` (fields, messages, code generation, the 28-group seed) |
| Service layer     | `packages/services/src/groups.ts`                                                    |
| API               | `GET/POST /api/groups`, `PUT/DELETE /api/groups/:grpCode`                            |
| Table             | `account_groups` (Maacct2 in MDA — docs/LOGIC-SPEC.md §2)                            |
| Colours and fonts | [packages/ui/src/styles.css](../../packages/ui/src/styles.css)                       |

## What the screen shows

Reached from the sidebar: **Masters → Accounting Masters → Group Master** (`/app/group-master`).

- **Breadcrumb and heading:** "Masters › Accounting Masters" / "Group _Master_".
- **GROUP DETAILS form**, a single column: Group Name\*, Group Type\* (Liabilities / Expenses /
  Assets / Income, in that order — MDA's own, not alphabetical), Group Ledger (Yes/No, defaults
  to No).
- **Buttons:** Cancel (editing only) · View · Delete · Print (editing only) · Save Group / Update
  Group. Save/Update moves right, as in M1.
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

- **Delete** is a genuinely inert button (native `disabled`) once a group is loaded — neither the
  mouse nor Enter can reach it, matching MDA's own dead-code guard.
- **Update** looks the same (dimmed, no click handler), but pressing **Enter** while it is focused
  still opens the confirm dialog and saves — exactly MDA's behaviour, kept rather than "fixed".

Both sides of this were checked end to end: a mouse click does nothing, Enter still works.

## How to change it

As in [AUTH-SCREENS.md](AUTH-SCREENS.md#how-to-change-it): colours in the theme file, wording and
the seed list in `packages/core/src/groups.ts`, layout in `GroupMasterScreen.tsx`. Since this
wasn't designed on the canvas, a future change can still start there if a visual redesign (rather
than a wording or field change) is wanted.
