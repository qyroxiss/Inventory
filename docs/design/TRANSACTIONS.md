# Transactions

**Status:** all three built 2026-10-07.

- Purchase Invoice from `purchase_invoice_page.dart` and `purchase_service.dart`.
- Sales Invoice from `sale_invoice_page.dart`, `sale_service.dart` and `sale_type_service.dart`.
- Stock Journal is "Not built yet" in MDA (only its STJ- series exists). It's built here at the
  owner's request, in the usual Indian accounting shape; see its section.

All three share `apps/web/src/screens/transactions/shared.tsx`: the page, label-above fields,
number boxes, the type-to-search lookup with its "…" picker, the item grid, and Enter walking
the fields in MDA's order. Stock in hand (`packages/services/src/stock.ts`) is the opening
quantity plus Σ(In − Out) in all godowns; cancelled documents have no movements, so they don't
count.

## Purchase Invoice (`/app/purchase-invoice`)

- **Code:**
  - Screen: `apps/web/src/screens/transactions/PurchaseInvoiceScreen.tsx`, with
    `PurchaseList.tsx` and the shared pieces in `shared.tsx`.
  - Service: `packages/services/src/purchases.ts`.
  - Maths, messages and checks: `packages/core/src/purchases.ts`.
- **API:**
  - `GET /api/purchases` (list), `/api/purchases/setup` (suppliers, items, godowns, the next
    bill number and the company's state), `/api/purchases/next`, `/api/purchases/bill?no=`.
  - `POST /api/purchases` (save), `PUT /api/purchases` (update),
    `POST /api/purchases/cancel`.
- **Tables:** `purchases` (PurcMaster), `purchase_lines` (PurcDetail), `voucher_items`
  (VchrItem) and `stock_trn` (StockTrn). Migration 0006.

### The screen, top to bottom

1. **Title bar:** Back, "Purchase Invoice", the chips MDA shows ("Editing PB-0001" while a bill
   is open; "Intra-state - CGST + SGST" or "Inter-state - IGST" once a supplier is chosen) and
   "Enter moves to the next field".
2. **Header:**
   - Purchase No. (read-only) | Purchase Date | Supply With | No. | Date
   - Order No. | Order Date | Order Type | Goods Rec No | Rec. Date
   - Supplier Name | Transporter | Narration
   - The supplier's "No." and "Date" and Rec. Date are free text, as in MDA. Purchase Date
     is limited to the open year; Order Date to any date.
3. **Purchased Item Detail:**
   - A Code / Name switch picks which box you type the item in; the other shows what the pick
     resolved to. Then Location (godown, optional).
   - Quantity | Rate | Disc % | Disc Amount | Tax | Amount, then Add (Update while a line is
     open) and Remove.
   - The grid, with MDA's columns (SNo., Code, Item Name, Qty., Rate, DisP, DisA, Amount,
     SGSTP/A, CGSTP/A, IGSTP/A). Tap a row to edit it; ✎ and ✕ on each row.
   - The totals line: Qty, Sub Total, Discount (when any), SGST, CGST, IGST, Round Off (when
     any) and Net Amount.
4. **Footer:** Show All Purchase · New Bill · Cancel Bill | Save/Update. MDA's second Back in
   the footer is left out; Back is top left.

### Rules (MDA's)

- **Suppliers:** active ledgers in Sundry Creditors (L007) or a group directly under it. With
  none: "No supplier ledgers found. Create them under Masters > Ledger Creation with the group
  "Sundry Creditors"."
- **CGST + SGST or IGST:** the company's state (its stored code, else its GSTIN's first two
  characters) against the supplier's (the same way). Unknown on either side counts as
  intra-state. Changing the supplier recomputes every line with the item's current rate.
- **Line maths:** gross = qty × rate; Disc % wins over Disc Amount (typing one zeroes the other);
  GST on the taxable value, halved for CGST/SGST with SGST taking the odd paisa. Picking an item
  fills an empty Rate with its purchase rate.
- **Totals:** net = sub total + taxes, rounded to the rupee; the difference is Round Off. No
  bill-level discount.
- **Posting (one PUR voucher):** Dr Purchase A/c (PUR001) the sub total, Dr Input CGST/SGST
  (TAX001/002) or Input IGST (TAX003), Dr or Cr Round Off (TAX007), Cr the supplier the net.
  Plus the item lines, the stock inward per line (to its godown), and the supplier's bill
  reference ("New", the net). A missing system ledger (or its group) is created first.
- **Numbering:** bills PB-0001…, the highest existing bill + 1 (Q-08). Every save also takes the
  next PUR-nnn voucher number.
- **Update** keeps the bill number but deletes the old voucher and posts a new one with a new
  PUR number (Q-07).
- **Cancel** ("Cancel Purchase": "Cancel purchase PB-0001? … Its stock and ledger effect are
  reversed." with **Keep it** / **Cancel bill**) marks the bill and its voucher Cancelled and
  removes its stock movement. The bill stays listed, struck through and marked "Cancelled".
- **Messages** are MDA's, as toasts: "Purchase PB-0001 saved  -  Net 1233.00", "Purchase …
  updated", "Purchase … cancelled", "Select an item first", "Quantity must be more than zero",
  "Select the supplier first - it decides CGST/SGST vs IGST", and the service's checks
  (LOGIC-SPEC §9). Save with no supplier only turns the box red, as MDA's form does.
- **Keyboard:** the cursor starts on Supply With. Enter walks MDA's order (Purchase Date →
  Supply With → No. → Date → Order No. → Order Date → Order Type → Goods Rec No → Rec. Date →
  Supplier → Transporter → Narration → Item → Qty → Rate → Disc % → Disc Amt → Add). Picking a
  supplier jumps to Transporter, an item to Quantity, a godown to Add; Add returns to the item.
  Number boxes select their text on focus. Lookups show matches only once you type; "…" opens
  the full list. Tab follows the page's own order, so Location isn't moved to the end as in
  MDA's Tab order (Q-35).

### Import from MDA

The import now brings PurcMaster, PurcDetail, VchrItem and StockTrn as well, so imported
purchases open here with their lines and stock. A company imported before this keeps what it
had: the import skips a company that's already there, so bringing its purchases means deleting
that company and importing again.

### Purchase quirks kept

- **Q-07:** update reposts under a new PUR number.
- **Q-08:** PURBILL's LastNo never moves.
- **Q-49:** an empty narration stays empty.
- **Q-50:** a cancelled bill's Save collides with its own number.

### Checked

- In the browser: picking by typing and by "…", the Code/Name switch, the add-before-supplier
  message, editing and updating a line, the totals and round off, save, the list, reopening,
  update, cancel, the cancelled bill's notice and its refused save.
- No page scroll at 1280×720, 1366×768, 1920×1080 or on a 768×1024 tablet; the item grid
  scrolls inside itself. Phones scroll, as allowed.

## Sales Invoice (`/app/sales-invoice`)

- **Code:** `SalesInvoiceScreen.tsx` and `SaleList.tsx`; the service is
  `packages/services/src/sales.ts`; maths, messages and checks are in
  `packages/core/src/sales.ts`.
- **API:**
  - `GET /api/sales`, `/api/sales/setup` (customers, items, sale types and the company's state),
    `/api/sales/next?prefix=`, `/api/sales/bill?no=`.
  - `POST` and `PUT /api/sales`, `POST /api/sales/cancel`.
- **Tables:** `sales` (SaleMaster) and `sale_lines` (SaleDetail). Migration 0007.

### The screen

1. **Header:**
   - Sale Type · Cash / Credit · Bill No · Date · Location
   - Name · Area · City · Mobile
   - Address · State · GST No
2. **Items Detail:**
   - The Code / Name switch, then Item Name | Item Code.
   - Required Qty · Rate · Discount % · Discount Amount · Amount · Add / Remove.
   - The grid, with MDA's labels (Itm.Code, Itm.Name, SGST%, …, HSN Code).
3. **Totals:**
   - Qty, Sub Total, CGST, SGST, IGST, Discount On Items (when any), Total.
   - % On · Discount Amount (the bill discount) · Round Off · **Grand Total Rs.**
4. **Footer:** Sale Print (MDA's "Sale printing arrives with the report module") · Show All
   Sale · New Bill · Cancel Bill | Save/Update.

### Rules (MDA's)

- **Sale type:**
  - Required. The page opens on the first one by name.
  - Its prefix numbers the bill (CS gives CS-0001), and each prefix counts separately. A type
    with no prefix uses SB-.
  - Changing the type renumbers a new bill only.
  - With no sale types: "No sale types found. Create them under Masters > Inventory Masters >
    Sale Type."
- **Customer:**
  - Picked from Sundry Debtors (and groups directly under it).
  - Picking fills Address, City, State, Mobile and GST No, all still editable. The bill keeps
    its own copy.
  - CGST + SGST or IGST is decided as on a purchase.
- **Cash or Credit:**
  - A cash sale is debited to the first Cash-in-Hand ledger by code (a book with none gets
    "Cash", CASH001) and leaves no bill reference.
  - A credit sale is debited to the customer and adds a "New" bill reference for the grand
    total.
- **Bill discount:** % wins over the amount. It comes off after tax and is posted to Discount
  Allowed (SAL002, created when missing), not taken off the taxable value.
- **Posting (one SAL voucher):**
  - Dr the customer or cash for the grand total, and Dr Discount Allowed.
  - Cr Sales A/c, and Cr Output CGST/SGST or IGST.
  - Round Off goes on whichever side balances.
  - Plus the item lines and the stock going out. The narration is "Sale <bill no>".
- **Stock:** "Not enough stock for <item>: x needed, y in hand." when the bill asks for more
  than is in hand across all godowns. On update, the bill's own old quantities count as back in
  stock.
- **Update** reposts under a new SAL number (Q-07).
- **Cancel** ("Cancel Sale" … "The goods go back into stock and the ledger entry is
  reversed.") marks the bill Cancelled and returns the goods.
- **Sale Type's Remove** now really counts the bills using the type.
- **Keyboard:**
  - Enter order: Sale Type → Date → Location → Name → Area → City → Address → State → Mobile →
    GST No → Item → Required Qty → Rate → Discount % → Discount Amount → Add → % On → Discount
    Amount → Save.
  - Picking a type goes to Date, the date to Location, a customer to Area, and an item to
    Required Qty. Add returns to the item.

### Sales quirks kept

- **Q-07:** update reposts under a new SAL number.
- **Q-08:** SALEBILL's LastNo never moves.
- **Q-30:** a cash sale posts to the first cash ledger by code.
- **Q-50:** a cancelled bill's Save collides with its own number.
- **Q-51:** there's no walk-in customer name.
- **Q-52:** a line's location is fixed when the line is added.
- **Q-53:** reopening a bill whose customer is no longer listed loses the customer link.

## Stock Journal (`/app/stock-journal`)

MDA shows "Not built yet". It's built here so stock can be moved without a purchase or a sale.

- **Header:** Voucher No (STJ-001…, MDA's seeded series) · Date (inside the open year) ·
  Narration.
- **Consumption (Source):** items going out, with Item, Godown, Quantity, Rate, Amount and Add.
  Picking an item shows how much is in hand.
- **Production (Destination):** items coming in, with the same fields.
- **What it covers:**
  - A godown transfer: the same item out of one godown and into another.
  - Turning raw material into finished goods: the raw items as Source, the product as
    Destination.
- **Save** refuses a source the stock can't cover (the sale's message). It posts no ledger
  lines: an STJ voucher with one stock movement per line. The value shown is the destination
  value.
- **View** lists them, struck through when cancelled. Picking one opens it to update or cancel.
- **Cancel Vchr** marks it Cancelled and reverses its stock. It still opens to view.
- **Code:** `StockJournalScreen.tsx`, `packages/services/src/stock-journal.ts` and
  `packages/core/src/stock-journal.ts`. The lines are kept in `stock_journal_lines`
  (migration 0007).
- **API:** `/api/stock-journals` (list, save), `/next`, `/in-hand?item=`, `/:id/lines`,
  `PUT /:id` and `POST /:id/cancel`.

## Import from MDA

The import also brings SaleMaster and SaleDetail now. MDA has no stock journals to import.

## Checked (Sales and Stock Journal)

- **Sales, in the browser:**
  - The sale type and its bill number, and the customer's details filling in.
  - The item and the Enter path, and the bill discount.
  - A cash save, the stock refusal, and an inter-state credit sale (IGST).
  - The list, reopening, cancel, the red boxes on an empty Save, and Sale Print.
- **Stock Journal:** the in-hand figure, both sides, save, the list, reopening, and cancel
  reversing the stock.
- No page scroll at 1280×720, 1366×768 or on a 768×1024 tablet. Phones scroll, as allowed.
