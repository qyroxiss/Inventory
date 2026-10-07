# Transactions

**Status:** Purchase Invoice built 2026-10-07 from `purchase_invoice_page.dart` and
`purchase_service.dart` (docs/LOGIC-SPEC.md §4.3, §5, §6.2, §6.8, §9). Sales Invoice is next.
Stock Journal is "Not built yet" in MDA and stays a placeholder.

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

### Quirks kept

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
