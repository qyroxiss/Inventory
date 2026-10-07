# Inventory Masters

**Status:** built one screen at a time, in the order the screens depend on each other: Unit
Master, Godown, Stock Group, Stock Sub Group, Sale Type, then Stock Item. Each is ported
directly from its MDA source file. The shared pieces (page header, `Label : field` rows,
button bar, View list, printed list) are in `apps/web/src/components/master.tsx`. Each uses the layout of the Accounting Masters
([ACCOUNTING-MASTERS.md](ACCOUNTING-MASTERS.md)) and follows the
[layout rules](MASTERS-SCREENS.md#layout-rules-every-inner-screen). The header reads "Masters ›
_Screen Name_" with an "Inventory Master" pill, as in MDA.

| Screen | MDA source | Built |
|---|---|---|
| Unit Master | `unit_master_page.dart` | 2026-10-05 |
| Godown | `godown_master_page.dart` | 2026-10-06 |
| Stock Group | `stock_group_page.dart` | 2026-10-07 |
| Stock Sub Group | `stock_sub_group_page.dart` | — |
| Sale Type | `sale_type_master_page.dart` | — |
| Stock Item | `stock_item_page.dart` | — |

## Unit Master and Godown

MDA's two screens are line-for-line the same apart from the word "Unit"/"Godown", the
Misc_Type and the code prefix. So one screen serves both here (`/app/unit-master`, `/app/godown`).
Everything below is written for Unit; Godown is the same with "Godown" in place of "Unit":
`GD` codes, "GODOWN DETAILS", "Godown Name", `Godown Name Already Exists..`, "Godown Master List",
and "No godowns saved yet.". MDA seeds no godowns.

- **Code:** `apps/web/src/screens/masters/MiscMasterScreen.tsx`. Logic is in
  `packages/services/src/misc-masters.ts`; the two kinds, their messages and the 18-unit seed are
  in `packages/core/src/misc-masters.ts`. API: `/api/misc-masters/unit` and `/api/misc-masters/godown`.
- **Storage:** Misc_Master rows of type `Unit` (our `misc_list`). The code is `UN` + 3 digits,
  the highest existing + 1, so a new book's first own unit is UN019.
- **New books** start with MDA's 18 units (Nos/Numbers … Sheet), as MDA seeds them.
- **Form:** "UNIT DETAILS", **Unit Name \*** (hint "Enter unit name"). Enter moves to Save Unit,
  or to Update while a unit is open.
- **Buttons, as in MDA:** Print and View on the left. Then **Save Unit**, or **Cancel · Update ·
  Remove** while a unit is open. Every button works by mouse and touch, unlike Group Master
  (Q-16).

  | Button | What it does |
  |---|---|
  | Save Unit | `Unit "X" saved (Code: UN019)`, clears the form. An exact duplicate shows `Unit Name Already Exists..` (case-sensitive). |
  | Update | Asks "Update Unit / Wants to update this record "X"?", then `Unit "X" updated` and clears the form |
  | Remove | Asks "Remove Unit / Wants to remove this record "X"? This cannot be undone.", then `Unit "X" removed` (shown in red, as in MDA) and clears the form |
  | Cancel | Clears the form (only while a unit is open) |
  | View | "Unit Master" list, N record(s), Code · Unit Name by name. Nothing is highlighted at first; ↑ ↓ highlight, Enter or a double-click opens. On touch screens, tap a row and then tap it again. Empty list: "No units saved yet." |
  | Print | "Unit Master List", "Total Records: N", Code · Unit Name, through the browser's print dialog |

- **Quirks kept** ([LOGIC-SPEC.md](../LOGIC-SPEC.md) §14):
  - Q-37: Update allows duplicate names.
  - Q-38: Save and Update overwrite the long name.
  - Q-39: Remove doesn't check stock items.
- **Laptop, tablet and phone:** no scrolling at 1280×720, 1366×768 and 1920×1080, or on
  360/390/768/1024-wide screens, in both new and edit mode. On phones, the small buttons pair up
  two per row and the main action is full width.

## Stock Group

- **Code:** `apps/web/src/screens/masters/StockGroupScreen.tsx`. Logic is in
  `packages/services/src/stock-groups.ts`; messages are in `packages/core/src/stock-groups.ts`.
  API: `/api/stock-groups`.
- **Storage:** Misc_Master rows of type `StockGroup`: name, GST Rate in Misc_Gen1, HSN No. in
  Misc_Gen2 (both free text, e.g. "18%"), and the save time in Misc_Date. The code is `SG` + 4
  digits (SG0001). That's its own series in Misc_Master, apart from the account groups'
  sub-group codes.
- **Header:** "Masters › Stock Group" and the "Inventory Master" pill.
- **Form:** "STOCK GROUP DETAILS": **Group Name \*** ("Enter stock group name"), **GST Rate**
  ("e.g. 18%"), **HSN No.** ("HSN / SAC code"). Enter moves down the fields, then to Save Group,
  or to Update while a group is open.
- **Buttons:**

  | Button | What it does |
  |---|---|
  | Save Group | `Stock Group "X" saved (Code: SG0001)`, clears the form. A duplicate name shows `Name is Already Exists..` (case-sensitive). |
  | Update | Asks "Update Stock Group / Update record "X"?", then checks the name, then `Stock Group "X" updated` and clears the form. A duplicate shows `Name is Already Exists..`. Unlike Unit, MDA checks here. |
  | Remove | Asks "Remove Stock Group / Remove "X"? This cannot be undone.", then `Stock Group "X" removed` (red, as in MDA) and clears the form |
  | Cancel | Clears the form (only while a group is open) |
  | View | "Stock Group" list, N record(s): Code · Group Name · GST Rate · HSN No. (HSN dropped on phones). Hint "↑ ↓ to navigate • Enter to select • Double-click row • Esc to close". Empty: "No stock groups saved yet." |
  | Print | "Stock Group List", "Total Records: N", Code · Group Name · GST Rate · HSN No. |

- **Quirks kept:**
  - Q-33: GST Rate and HSN are stored but no item takes them as defaults.
  - Q-40: Remove doesn't check stock sub groups.

