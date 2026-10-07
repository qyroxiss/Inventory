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
| Stock Sub Group | `stock_sub_group_page.dart` | 2026-10-07 |
| Sale Type | `sale_type_master_page.dart` | 2026-10-07 |
| Stock Item | `stock_item_page.dart` | 2026-10-07 |

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

## Stock Sub Group

- **Code:** `apps/web/src/screens/masters/StockSubGroupScreen.tsx`; logic in
  `packages/services/src/stock-sub-groups.ts`; messages in `packages/core/src/stock-sub-groups.ts`.
  API: `/api/stock-sub-groups`.
- **Storage:** Misc_Master rows of type `StockSubGroup`; Misc_Pname holds the Stock Group's code;
  Save stamps Misc_Date. Codes are `SSG` + 4 digits (SSG0001).
- **Form:** "STOCK SUB GROUP DETAILS": **Sub Group Name \*** ("Enter stock sub group name") and
  **Under \***, a type-to-search list of stock groups ("Type to search group…"). Enter moves from
  the name to Under; picking a group moves on to Save Sub Group, or to Update.
- **Messages:** `Sub group name is required`; then, once the name is there, `Please select an
  under group`. `Name is Already Exists..` on Save and Update. `Stock Sub Group "X" saved (Code:
  SSG0001)`, `… updated`, `… removed` (red). Confirms: "Update record "X"?" and "Remove "X"? This
  cannot be undone.".
- **View:** Code · Sub Group Name · Under Group (the group's current name). Empty: "No stock sub
  groups saved yet.". **Print:** "Stock Sub Group List".
- **Quirks kept:**
  - A sub group whose group was removed shows a blank Under but keeps the old code (Q-40).
  - Q-41: Remove doesn't check stock items.

## Sale Type Master

Laid out differently from the other masters, as in MDA. The form (Sale Name, Sale Prefix, Sale
By) has the saved types listed with it (Job Name · Job Work): click a row to edit it. On laptops
the list sits beside the form so nothing scrolls; on tablets and phones it's under the form, as
in MDA. There's no View or Print.

- **Code:** `apps/web/src/screens/masters/SaleTypeScreen.tsx`; logic in
  `packages/services/src/sale-types.ts`; messages in `packages/core/src/sale-types.ts`.
  API: `/api/sale-types`.
- **Storage:** Misc_Master rows of type `SaleType`: Sale Name in Misc_Name, Sale Prefix in
  Misc_Pname (upper-cased), Sale By in Misc_Sname. Codes are `ST` + 3 digits.
- **Form:** **Sale Name \*** ("e.g. Counter Sale, Tax Invoice"); **Sale Prefix** ("e.g. CS";
  letters, digits, `-` and `/`, at most 6); **Sale By \*** ("e.g. Counter, Challan"), typeable, with
  a "…" button that opens "Select Sale By" (Counter, Challan, Invoice, Delivery, Direct, Online;
  Close). Picking one moves to Save. Above the form: "Editing ST001" while a type is open, and
  the hint "Enter moves to the next field".
- **Buttons:** **Save**, or **Remove · Clear · Update** while a type is open. MDA's own Back
  button at the bottom is the Back at the top-left here (layout rule 3).
  - **Update saves without asking**, as in MDA.
  - **Remove** first checks for bills using the type (`"X" is used on N bill(s) and cannot be
    removed`), then asks "Remove "X"? This cannot be undone.". Sale bills don't exist yet, so
    that count is 0 until Sales Invoice is built.
- **Messages:**
  - `Sale Name is required` and `Sale By is required` show on the fields.
  - `Sale Type "X" already exists.` shows as a red message.
  - `Sale Type "X" saved (Code: ST001)`, `… updated`, `… removed` (red).
  - Under the list: "No sale types yet", "N sale types", "Click a row to edit it".

## Stock Item

- **Code:** `apps/web/src/screens/masters/StockItemScreen.tsx`; logic in
  `packages/services/src/stock-items.ts`; lists and messages in `packages/core/src/stock-items.ts`.
  API: `/api/stock-items`. Table `stock_items` (MDA's Part_Master, every column).
- **Form, two fields to a line as in MDA:**
  - Item Code \* | Item Name \*
  - Print Name | Under Sub Group
  - Unit | Tax Type
  - GST Rate | HSN No. when the Tax Type is Taxable; otherwise HSN No. alone
  - Purchase Rate | Sale Rate (added; see below)
  - On tablets and phones the fields go to one column. Enter moves through them in that order,
    then to Save Item, or to Update.
- **Fields:**
  - The **Item Code** is typed by the user and can't be changed once saved (read-only while
    editing).
  - **Under Sub Group** is an optional list of stock sub groups.
  - **Unit** lists MDA's own hard-coded units (Q-19) and keeps any typed text.
  - **Tax Type:** Taxable, Non GST, Nil Rated, Exempt. Moving away from Taxable clears the GST Rate.
  - **GST Rate** lists 0% to 28% and keeps typed text.
  - **Purchase Rate** and **Sale Rate** are added by the owner's choice (2026-10-07).
    - MDA's table has these columns, and its Purchase and Sales Invoice fill an empty Rate from
      them. Stock is valued at them too, but MDA's form never sets them.
    - Blank means 0. Otherwise a number of 0 or more with up to 2 decimals; anything else gets
      "Enter a valid rate".
    - An update that leaves them out keeps the stored rates, so an MDA import's rates survive.
- **Messages:**
  - `Required` under Code and Name.
  - Save checks the code first (`Item Code "X" already exists.`), then the name (`Item Name is
    Already Exists..`). Update checks the name against the other items only.
  - `Stock Item "X" saved` (no code in this one), `… updated`, `… removed` (red).
- **View:** Code · Item Name · Sub Group · Unit · GST Rate · HSN No. (phones show Code · Item
  Name · Unit). **Print:** "Stock Item List", with Print Name, Reg Type, Purchase Rate and Sale
  Rate added.
- **Quirk kept:** Q-42, Remove doesn't check purchases, sales or stock.

## Import from MDA

Brings in every Inventory Master: units, godowns, stock groups, stock sub groups and sale types
come from Misc_Master; stock items come from Part_Master, with every column (rates, opening
stock, levels and barcode are kept for the screens that will use them).

