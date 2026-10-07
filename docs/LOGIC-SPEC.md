# Qyroxis Inventory — Business Logic Spec (ported from MDA-Inventory)

This is the **source of truth for porting.** Every rule here was read out of `../MDA-Inventory/lib` (schema v12, as of Oct 2026). File references like `sale_service.dart:174` point into that folder.

When the new code and this spec disagree, the spec wins. When this spec and the Dart code disagree, the Dart code wins.

**Owner rule (2026-10-02):** port the behaviour exactly, including the quirks listed in [§14](#14-quirk-register--all-kept-as-is). Only the look, the platform and the branding ([§15](#15-branding)) change.

---

## 1. Module inventory

| Section | Item | MDA status | Parity phase |
|---|---|---|---|
| Dashboard | KPIs, 7-day chart, recent transactions, quick actions | Built | 5 |
| Masters › Accounting | Group, Sub Group, Ledger | Built | 5 |
| Masters › Inventory | Stock Group, Stock Sub Group, Stock Item, Godown, Unit, Sale Type | Built | 5 |
| Accounting Vouchers | Receipt (Cash/Bank), Payment (Cash/Bank), Journal, Debit Note, Credit Note | Built | 5 |
| Transactions | Purchase Invoice, Sales Invoice | Built | 5 |
| Transactions | Stock Journal | Placeholder | 9 |
| Reports | Stock Summary, P&L, Balance Sheet, Day Book, Sales Register | Placeholder | 6 (new spec) |
| GST Reports | GSTR-1, GSTR-3B, GST Audit, HSN Summary, ITC | Placeholder | 6 (new spec) |
| Tools | User Management | Built | 3/5 |
| Tools | Backup, Company Settings, Import, Logs | Placeholder | 6–7 |
| Setup | Company create/edit, Financial Year manage, Login | Built | 5 |

**Notes on what is missing in MDA:**
- **There is no Contra voucher.** The `PRT` (Purchase Return), `SRT` (Sales Return) and `STJ` (Stock Journal) series are seeded, but nothing uses them.
- The five `.bak` files in `_unused_legacy_pages/` are dead code and should be ignored.

---

## 2. Data model mapping

| MDA table | New table | Notes |
|---|---|---|
| Registry `CompanyMaster` | `companies` | Fields: CompName, MailName, Add1-2, City, State, StateCode, Country, PinCode, Phone, Mobile, Fax, Email, Website, GSTIN, PAN, CIN, BankName/Branch/AcNo/Ifsc, FinYrFrom, BooksFrom |
| Registry `Company_Year` | `financial_years` | YearCode (`2627`), YearName (`2026-2027`), FromDate, ToDate |
| `[User]` (per year file) | `book_users` | **Kept per book** (company + year), as in MDA (Q-03): UserCode, UserName (unique per book), Password (pbkdf2 format, same algorithm), Role, IsActive, MustChangePwd. |
| `Maacct2` (groups **and** sub groups) | `account_groups` | GrpCode, GrpName (unique per book), GrpType (Assets/Liabilities/Expenses/Income), ParentGrp (`'Parent'` = top level, else the parent code), IsLedger, SortOrder, Clr |
| `Maacct1` | — | **Unused by MDA.** Drop it. |
| `Maacct` | `ledgers` | AccCode, AccName (unique), GrpCode, OpBal, DrCr, Add1, Add2, City, State, StateCode, PinCode, Phone, Mobile, Email, GSTIN, PAN, CreditDays, CreditLimit, IsActive |
| `Misc_Master` type `Unit` | `units` | code `UNnnn`; name = Misc_Name; long name = Misc_Pname |
| `Misc_Master` type `Godown` | `godowns` | `GDnnn` |
| `Misc_Master` type `StockGroup` | `stock_groups` | `SGnnnn`; gst_rate = Misc_Gen1 (text); hsn = Misc_Gen2 |
| `Misc_Master` type `StockSubGroup` | `stock_sub_groups` | `SSGnnnn`; parent = Misc_Pname (stock group code) |
| `Misc_Master` type `SaleType` | `sale_types` | `STnnn`; name; prefix (Misc_Pname); sale_by (Misc_Sname) |
| `Misc_Master` type `City` | `cities` | `CTnnnn`; self-learning list |
| `Part_Master` | `stock_items` | PartCode (user-typed, immutable), PartName (unique), PrintName, SubGrpCode, Unit, AltUnit, ConvFactor, RegType, GstRate (text such as `"18%"`; parse by stripping `%`), CessRate, HsnNo, PurRate, SaleRate, Mrp, OpQty, OpValue, Reorder/Min/MaxLevel, Barcode, IsActive |
| `VchrHdr` | `vouchers` | `UNIQUE (book, VchrType, VchrNo)`; Status `Active`/`Cancelled`; Created/Modified/Cancelled By/At |
| `VchrAcct` | `voucher_ledger_lines` | The double entry: ΣDr must equal ΣCr |
| `VchrItem` | `voucher_item_lines` | |
| `StockTrn` | `stock_movements` | Stock in hand = OpQty + Σ(InQty − OutQty) |
| `BillRef` | `bill_refs` | RefType: `New` / `Against` / `On Account` / `Advance` |
| `TaxMaster`, `HsnMaster`, `StateMaster`, `VchrSeries` | `tax_rates`, `hsn_codes`, `states`, `voucher_series` | |
| `AuditLog` | `audit_log` | |
| `PurcMaster` / `PurcDetail` | `purchases` / `purchase_lines` | Joined on BillNo |
| `SaleMaster` / `SaleDetail` | `sales` / `sale_lines` | Customer address block is **copied** onto the bill so a reprint shows the details as they were |
| `Trvchr` | — | Legacy flat summary row: write-only, and no report reads it. **Do not port.** The importer reads it only to recover pre-v10 vouchers. |
| Year-file `CompanyMaster`, `Comp_Year` | — | Dead duplicates. Drop them. |

---

## 3. Seeds (run on every new book)

Port these verbatim from `db_service.dart:827-1019`.

- **Groups (28):**
  - Top level (`ParentGrp='Parent'`):
    - A001 Current Assets, A008 Fixed Assets, A009 Investments, A010 Misc. Expenses (ASSET)
    - L001 Branch / Divisions, L002 Capital Account, L003 Reserves & Surplus, L004 Current Liabilities, L008 Loans (Liability), L012 Suspense A/c
    - E001 Direct Expenses, E002 Indirect Expenses, E003 Purchase Accounts
    - I001 Direct Incomes, I002 Indirect Incomes, I003 Sales Accounts
  - Sub groups:
    - Under A001: A002 Bank Accounts, A003 Cash-in-Hand, A004 Deposits (Asset), A005 Loans & Advances (Asset), A006 Stock-in-Hand, A007 Sundry Debtors
    - Under L004: L005 Duties & Taxes, L006 Provisions, L007 Sundry Creditors
    - Under L008: L009 Bank OD A/c, L010 Secured Loans, L011 Unsecured Loans
  - All with IsLedger `No`, Clr `1`.
- **System ledgers:**

  | Code | Name | Group |
  |---|---|---|
  | TAX001 | Input CGST | L005 |
  | TAX002 | Input SGST | L005 |
  | TAX003 | Input IGST | L005 |
  | TAX004 | Output CGST | L005 |
  | TAX005 | Output SGST | L005 |
  | TAX006 | Output IGST | L005 |
  | TAX007 | Round Off | E002 |
  | SAL001 | Sales A/c | I003 |
  | PUR001 | Purchase A/c | E003 |

  - DrCr is `Cr` when the group code starts with `I`, otherwise `Dr`.
  - A ledger is seeded only when its group exists.
- **Created on demand** (`_ensureLedgers`):
  - Ledgers: SAL002 Discount Allowed (E002, Dr); CASH001 Cash (A003, Dr), created when a cash sale finds no A003 ledger.
  - Missing parent groups L005, I003, E002, E003 and A003 are created too.
- **Units (18):** UN001 Nos/Numbers, UN002 Pcs/Pieces, UN003 Kgs/Kilograms, UN004 Gms/Grams, UN005 Ltr/Litres, UN006 Ml/Millilitres, UN007 Mtr/Metres, UN008 Cm/Centimetres, UN009 Sqft/Square Feet, UN010 Sqmt/Square Metres, UN011 Box, UN012 Dzn/Dozen, UN013 Pair, UN014 Set, UN015 Bag, UN016 Bndl/Bundle, UN017 Roll, UN018 Sheet.
- **Tax rates:** GST00 (0% Exempt / Nil rated), GST03 3%, GST05 5%, GST12 12%, GST18 18%, GST28 28%. Cess 0.
- **States:** GST codes 01–38 (there is no 25 or 28), plus 97 Other Territory. The full list is at `db_service.dart:876-890`.
- **Voucher series** (width 3, LastNo 0):

  | Code | Name | Prefix |
  |---|---|---|
  | RCP | Cash Receipt | `RCP-` |
  | BNK | Bank Receipt | `BNK-` |
  | PAY | Cash Payment | `PAY-` |
  | BPAY | Bank Payment | `BPAY-` |
  | JNL | Journal Voucher | `JNL-` |
  | DRN | Debit Note | `DRN-` |
  | CRN | Credit Note | `CRN-` |
  | PUR | Purchase Invoice | `PUR-` |
  | SAL | Sales Invoice | `SAL-` |
  | PRT | Purchase Return | `PRT-` |
  | SRT | Sales Return | `SRT-` |
  | STJ | Stock Journal | `STJ-` |

  Plus PURBILL `PB-` (width 4) and SALEBILL `SB-` (width 4).
- **Admin user:** `admin` / `admin`, Role Admin, `MustChangePwd = 1`. It is seeded into every new book, as in MDA.

---

## 4. Code and number generation

### 4.1 Master codes (`code_gen.dart:13-61`)
`next = prefix + pad(max(numeric suffix of existing codes LIKE prefix%) + 1, width)`.
- Take the text after the prefix and strip non-digits.
- Codes that don't parse count as 0, so hand-entered odd codes never break generation.

| Master | Prefix | Width | Scope |
|---|---|---|---|
| Group | First letter of GrpType (A/L/E/I) | 3 | All groups (not filtered by type) |
| Sub Group | `SG` | 4 | account_groups |
| Ledger | `AC` | 4 | ledgers |
| Godown | `GD` | 3 | godowns |
| Unit | `UN` | 3 | units (first new one is UN019) |
| Stock Group | `SG` | 4 | stock_groups |
| Stock Sub Group | `SSG` | 4 | stock_sub_groups |
| Sale Type | `ST` | 3 | sale_types |
| City | `CT` | 4 | cities |
| Stock Item | — | — | **Typed by the user**, unique, immutable after save |

New behaviour: generate the code **inside** the insert transaction. MDA generated it outside the transaction, which is a race under multiple users.

### 4.2 Voucher numbers (`code_gen.dart:66-106`)
- `next = prefix + pad(max(series.LastNo, max suffix in vouchers of that type) + 1, width)`.
- Commit: `LastNo = used` if higher, in the same transaction.

### 4.3 Bill numbers
- **Purchase:** prefix and width come from `PURBILL` (default `PB-`, 4). `next = max(LastNo, max suffix in purchases.BillNo LIKE prefix%) + 1`.
- **Sale:**
  1. **Choose the prefix.** Use the sale type's `billPrefix` (prefix trimmed, with `-` added if missing). If the type has no prefix, use the `SALEBILL` prefix (default `SB-`).
  2. **Width** always comes from `SALEBILL` (default 4).
  3. **Floor:** the `LastNo` floor applies only when the prefix is the series prefix.
  4. **Example:** prefix `CS` gives `CS-0001`.
- Each prefix counts separately.
- When the sale type changes on a **new** bill, the bill is renumbered. An existing bill keeps its number.
- On top of the bill number, every sale or purchase save also takes a `SAL-nnn` / `PUR-nnn` **voucher** number.

---

## 5. GST and line maths (`posting_service.dart:100-140`)

```
round2(v)      = sign(v) * round(|v| * 100) / 100      // halves away from zero, as Dart does
isInterState(c, p) = c.trim() && p.trim() && c.trim() != p.trim()   // either unknown → intra-state

gross     = round2(qty * rate)
discount  = discPct > 0 ? round2(gross * discPct / 100) : round2(discAmt)
taxable   = round2(gross - discount)
gstAmount = round2(taxable * gstRate / 100)
cess      = round2(taxable * cessRate / 100)            // always 0 today; sale/purchase never pass cessRate
igst      = inter ? gstAmount : 0
cgst      = inter ? 0 : round2(gstAmount / 2)
sgst      = inter ? 0 : round2(gstAmount - cgst)        // SGST takes the odd paisa
lineTotal = round2(taxable + cgst + sgst + igst + cess)
roundOff(net) = round2(roundHalfAwayFromZero(net) - net)
```

**Stored line values** (`SaleLine.compute` / `PurcLine.compute`):
- `half = round2(gstRate / 2)`
- `sgstP = cgstP = inter ? 0 : half`
- `igstP = inter ? gstRate : 0`
- `disA` is stored as the computed amount when disP > 0
- `amount = taxable`

**Where the state codes come from:**
- **Company:** `companies.StateCode`. If that is empty, the first 2 characters of the GSTIN. If both are empty, `''`.
- **Party:** `ledgers.StateCode`. If that is empty, the first 2 characters of the ledger's GSTIN.

**Tax-inclusive rates are not supported.** All rates are tax-exclusive.

### 5.1 Sale totals (`SaleTotals.of`, `sale_service.dart:174-203`)
```
subTotal = Σamount;  sgst = Σsgst;  cgst = Σcgst;  igst = Σigst     (each round2)
gross     = round2(subTotal + sgst + cgst + igst)
billDisc  = billDiscPct > 0 ? round2(gross * billDiscPct/100) : round2(billDiscAmt)   // % wins
afterDisc = round2(gross - billDisc)
roundOff  = roundOff(afterDisc)
net       = round2(afterDisc + roundOff)
itemDisc  = Σ disA (display only);  qty = Σ qty
```
- The bill discount is applied **after tax**. It does not reduce taxable value; it is posted to Discount Allowed.
- On screen, "Total" = `round2(subTotal + cgst + sgst + igst)`.

### 5.2 Purchase totals (`PurcTotals.of`)
- `gross = round2(subTotal + sgst + cgst + igst)`
- `roundOff = roundOff(gross)`
- `net = round2(gross + roundOff)`
- `discount = Σ disA` (display only)
- **There is no bill-level discount.**

### 5.3 Recompute triggers
Changing the party (customer or supplier) recomputes **every line** with:
- the item master's current GST rate
- the new inter-state flag
- the line's disc%; when disP > 0, disA is cleared and recomputed

---

## 6. Posting rules (the journal each document creates)

Lines under 0.005 are skipped. ΣDr must equal ΣCr within 0.005, or the save fails with "… does not balance. Difference: x.xx".

### 6.1 Sale (`sale_service.dart:476-619`)
| Ledger | Dr | Cr |
|---|---|---|
| Customer (credit sale) / first A003 ledger by code (cash sale; creates CASH001 if none) | net | |
| SAL002 Discount Allowed | billDisc | |
| SAL001 Sales A/c | | subTotal |
| TAX006 Output IGST (inter-state) **or** TAX004 + TAX005 Output CGST/SGST | | igst / cgst, sgst |
| TAX007 Round Off | if roundOff < 0 → −roundOff | if roundOff > 0 |

**The voucher header** (type `SAL`):
- RefNo = BillNo
- Narration = narration, or `Sale <billNo>`
- PlaceOfSupply = customer stateCode
- OtherChrg = −billDisc

**Item lines:** GstRate = sgstP + cgstP + igstP; GodownCode = location.

**Stock:** OutQty = qty; VchrNo = BillNo; Value = taxable.

**BillRef:** written only for a **credit** sale with a customer code: RefType `New`, Amount = net.

**Stock guard:** before posting, quantities are summed per item. For each item: in hand = OpQty + Σ(In − Out) across **all godowns**. If needed > in hand + 0.0001, the save fails with: `Not enough stock for <name>: x.xx needed, y.yy in hand.` On update, the bill's own movement is removed first.

### 6.2 Purchase (`purchase_service.dart:506-645`)
| Ledger | Dr | Cr |
|---|---|---|
| PUR001 Purchase A/c | subTotal | |
| TAX003 Input IGST **or** TAX001 + TAX002 Input CGST/SGST | taxes | |
| TAX007 Round Off | if > 0 | if < 0 (abs) |
| Supplier | | net |

**The voucher header** (type `PUR`): RefNo = BillNo; RefDate = SuppInvDate.

**Stock:** InQty = qty; GodownCode = the line's location.

**BillRef:** always written for the supplier: `New`, Amount = net.

There is **no stock check**.

### 6.3 Receipt (RCP cash / BNK bank)
- Dr the Cash (A003) or Bank (A002) ledger, Cr the party, for the amount.
- partyCode = party.
- BillRef: party, billNo = VchrNo, `On Account`, amount.

### 6.4 Payment (PAY cash / BPAY bank)
- Dr the party, Cr the Cash/Bank ledger.
- partyCode = party.
- BillRef: party, VchrNo, `On Account`, amount.

### 6.5 Journal (JNL)
- Free Dr/Cr lines, at least 2. Balanced means |ΣDr − ΣCr| < 0.001 on screen; the server uses 0.005.
- No party, no BillRef.

### 6.6 Debit Note (DRN)
- Dr the party (L007 creditors) for the total, with narration = reason. Cr each entry ledger for its amount.
- BillRef: party, VchrNo, `New`, total.
- Reasons: Purchase Return, Price Difference, Short Supply, Damaged Goods, Other.
- No GST and no stock effect.

### 6.7 Credit Note (CRN)
- Dr each entry ledger. Cr the party (A007 debtors) for the total, with narration = reason.
- BillRef: `New`.
- Reasons: Sales Return, Price Difference, Excess Supply, Discount Given, Other.
- No GST and no stock effect.

### 6.8 Edit and cancel
- **Update a voucher:** delete the old ledger, item, stock and BillRef lines and write new ones. The voucher number and identity stay the same. Not allowed on a cancelled voucher.
- **Update a sale or purchase:** in MDA, the old voucher is deleted and a new one posted with a **new** SAL/PUR number. The bill number is kept. See §14 Q-07.
- **Cancel (never delete):**
  - Status → `Cancelled`, and CancelledBy/At are stamped.
  - **Stock movements are deleted.**
  - Ledger lines and BillRefs are kept.
  - Every balance and report counts `Status = 'Active'` vouchers only.
  - The confirmation text says the bill "stays in the books marked Cancelled for audit".
  - A cancelled document opens read-only.

### 6.9 Balances
- **`stockInHand(item[, godown])`** = OpQty + Σ(In − Out).
- **`ledgerBalance(acc)`** = ±OpBal (Cr is negative) + Σ(Dr − Cr) over active vouchers. The result is signed: positive means Dr.

---

## 7. Masters

These rules apply to all classic masters unless a master says otherwise.

**Rules common to all masters:**
- Names are trimmed.
- Duplicate checks are **case-sensitive**; City is the only exception. See §14 Q-15.
- Update asks for confirmation first: `Update record "<name>"?`
- Remove asks for confirmation: `… "<name>"?\nThis cannot be undone.`
- After any save, the form clears and focus returns to the first field.
- Success messages are green toasts; errors are red.

| Master | Fields (required = *) | Rules |
|---|---|---|
| **Group** | Name*, Type* (Liabilities/Expenses/Assets/Income), Group Ledger (Yes/No, default No) | Always top level (`ParentGrp='Parent'`). The duplicate check runs across all groups and sub groups: `Name is Already Exists..`. Seeded top-level groups are protected from delete: `This record will be not deleted`. |
| **Sub Group** | Name*, Under* (top-level groups only) | GrpType is inherited from the parent at creation. Duplicate: `Error: Sub Group "<name>" may already exist.` |
| **Ledger** | Name*, Address, City* (open list, self-learning), State* (36-entry list), Country, Pincode* (`^[1-9][0-9]{5}$`), Mobile, Email, PAN, Aadhar, Under Group* (any group or sub group), Sales Exec, Reg. Type (Regular/Composition/Unregistered/Consumer/Overseas), GSTIN, Opening Balance, Dr/Cr (default Dr) | Code `AC0001`… Duplicate: `Name is Already Exists..`. **Delete is blocked if the ledger is used**: `"<name>" is used in <n> voucher line(s) and cannot be removed. Mark it inactive instead.` The label reads "Opening balance (on 1-Apr-YY)". |
| **Godown** | Name* | Duplicate per type: `Godown Name Already Exists..` |
| **Unit** | Name* | `Unit Name Already Exists..`; Misc_Pname = long name |
| **Stock Group** | Name*, GST Rate (text), HSN | Stored only. Nothing cascades down to items. |
| **Stock Sub Group** | Name*, Under* (stock group) | |
| **Stock Item** | Code*, Name*, Print Name, Under Sub Group, Unit, Tax Type (Taxable/Non GST/Nil Rated/Exempt), GST Rate (shown only when Taxable: 0, 0.25, 1.5, 3, 5, 6, 9, 12, 18, 28 %), HSN | The code cannot change. Duplicates: `Item Code "<code>" already exists.` / `Item Name is Already Exists..`. Changing Tax Type away from Taxable clears GST Rate. |
| **Sale Type** | Sale Name*, Prefix (`[A-Za-z0-9\-/]`, max 6, uppercased), Sale By* (Counter/Challan/Invoice/Delivery/Direct/Online, or free text) | Duplicate: `Sale Type "<name>" already exists.` Delete is blocked when used on bills: `"<name>" is used on <n> bill(s) and cannot be removed`. Uses an inline list, not a View dialog. |
| **City** | (implicit) | `addIfNew`: a case-insensitive match returns the stored spelling, so "pune" typed against "Pune" gives "Pune". |

**Party lists used by vouchers:**

| Screen | Ledgers listed |
|---|---|
| Sale customer | GrpCode `A007` or a group whose ParentGrp is `A007`; active only; ordered by name |
| Purchase supplier | Same, with `L007` |
| Receipt/Payment cash or bank account | Exact `A003` / `A002` |
| Receipt/Payment party | All ledgers |
| Debit Note party | Exact `L007` (falls back to all ledgers) |
| Credit Note party | Exact `A007` (falls back to all ledgers) |

---

## 8. Users, roles and auth

**Login:**
- Username plus password. Only active users can log in.
- Error messages: `Invalid username or password` / `Login failed. Please try again.`
- "Remember me" stores the **username only**.

**Forced password change:** shown when `must_change_password` is set.
- At least 6 characters, must not be `admin`, and the confirmation must match.
- The dialog cannot be dismissed. Cancelling gives `Password change is required to continue.`

**User management (Admin only):**
- Creating a user needs a password of at least 4 characters plus confirmation.
- A blank password on update keeps the current password.
- You cannot delete yourself.
- You cannot delete the last active Admin.
- Every change is written to the audit log.

**Role matrix.** This is **displayed on the User Management screen only and not enforced**, ported as is (Q-12). The only access check is Admin-only save/update/delete inside User Management.

| Feature | Admin | Manager | Operator | Viewer |
|---|---|---|---|---|
| Masters | ✓ | ✓ | – | – |
| Vouchers | ✓ | ✓ | ✓ | – |
| Transactions | ✓ | ✓ | ✓ | – |
| Reports | ✓ | ✓ | – | ✓ |
| GST Reports | ✓ | ✓ | – | ✓ |
| Tools & Settings | ✓ | – | – | – |
| User Management | ✓ | – | – | – |

**Legacy password format:** `pbkdf2$<iter>$<saltB64>$<hashB64>`, PBKDF2-HMAC-SHA256, 20000 iterations, 32-byte key. Anything without the prefix is legacy plain text. Verify both formats in the importer path.

---

## 9. Validation messages (verbatim)

Keep these exact strings. Users of the desktop app already know them.

**Posting gate:**
- `Voucher type is missing.`
- `Voucher date is outside the open financial year (<label>).`
- `A voucher needs at least one ledger line.`
- `Every line must have a ledger selected.`
- `Amounts cannot be negative.`
- `A line cannot be both debit and credit (<code>).`
- `Voucher amount cannot be zero.`
- `Debit and credit do not match. Difference: x.xx`
- `Voucher number "X" is already used. Save again to take the next free number.`
- `Voucher not found.`
- `A cancelled voucher cannot be edited.`

**Sale:**
- `Bill No. is required.`
- `Customer name is required.`
- `A credit sale must be booked against a customer ledger.`
- `Bill date is outside the open financial year (…).`
- `Add at least one item.`
- `Every line must have an item.`
- `Quantity must be more than zero for X.`
- `Rate cannot be negative for X.`
- `Discount is more than the value of X.`
- `Bill value cannot be zero or negative.`
- `Bill No. "X" already exists. Save again to take the next free number.`
- `Sale does not balance. Difference: …`
- `A credit sale needs a customer ledger.`
- `Sale not found.`
- `A cancelled sale cannot be edited.`
- Page-level: `Select an item first`, `Required Qty must be more than zero`, `Sale type is required`, `Customer is required`, `No sale types found. Create them under Masters > Inventory Masters > Sale Type.`

**Purchase:**
- `Purchase No. is required.`
- `Select a supplier.`
- `Purchase date is outside the open financial year (…).`
- The line rules are the same as for sale.
- `Purchase value cannot be zero.`
- `Purchase No. "X" already exists. …`
- `Purchase does not balance. …`
- Page-level: `Select the supplier first - it decides CGST/SGST vs IGST`, `Quantity must be more than zero`, `No supplier ledgers found. Create them under Masters > Ledger Creation with the group "Sundry Creditors".`

**Vouchers:**
- `Select account`, `Select party`, `Required`, `Enter valid amount`
- `No cash/bank accounts — create ledger first`
- `Not balanced. Difference: ₹x`
- `Select reason`, `Select ledger`

**Statutory field formats:**
- `GSTIN must be 15 characters`
- `Invalid GSTIN format` (`^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$`)
- `Invalid GSTIN check digit` (mod-36: the factor alternates 1/2; `sum += p/36 + p%36`; check digit = `chars[(36 − sum%36) % 36]`)
- `PAN must look like AAAAA9999A`
- `HSN/SAC must be 4 to 8 digits`
- `Enter a 10 digit mobile number` (`^[6-9][0-9]{9}$`)
- `Enter a valid email address`
- `PIN code must be 6 digits`

---

## 10. Keyboard and entry behaviour

The redesign changes how things **look**, not how fast data entry feels. These behaviours are part of the product.

**Field navigation:**
- **Enter moves to the next field** on every form. Enter on the focused Save/Update button runs it.
- In multi-line Address boxes, Shift+Enter inserts a new line.
- Remove and Cancel are **not** reachable by Enter, to prevent accidents. Sale Type is the exception.
- On the invoice forms:
  - Enter on a date field opens the picker.
  - Picking from a lookup auto-advances.
  - Number boxes select all on focus and accept `[0-9.]` only.
- **Focus order:** follow the original screen's order.
  - **Sale:** Sale Type → Date → Location → Customer → Area → City → Address → State → Mobile → GST No → Item → Qty → Rate → Disc% → Disc Amt → Add → Bill Disc% → Bill Disc Amt → Save. The page opens on Sale Type. Picking a customer jumps to Area; picking an item jumps to Qty; Add returns to Item.
  - **Purchase:** Purchase Date → Supply With (initial focus) → Supp Inv No → Supp Inv Date → Order No → Order Date → Order Type → Goods Rec No → Rec Date → Supplier → Transporter → Narration → Item → Qty → Rate → Disc% → Disc Amt → Add → Save → … → Location last (Q-35).
  - **Ledger:** Name → Address → City → State → Country → Pincode → Mobile → Email → PAN → Aadhar → Under Group → Sales Exec → Reg Type → GSTIN → Opening Balance → Save.

**View lists:**
- ↓/↑ move the selection. The first ↓ selects row 0 and the first ↑ selects the last row.
- Enter loads the selected row; double-click also loads.
- Esc closes.

**`LookupBox` commit rules** (from `_SearchDD`). When the field loses focus:
1. **Empty text:** the value becomes null.
2. **Exact match** (case-insensitive): that item is chosen, with the stored spelling.
3. **Exactly one substring match:** that item is chosen.
4. **Open list** (City): the typed text is accepted and saved as a new entry.
5. **Otherwise:** the text reverts to the last valid choice.

Invoice item and party lookups show nothing until you type, and match by "contains" on code or name.

**New keyboard features:** a working Ctrl+K command palette (open any screen or record), Alt+S Save, Alt+N New, Alt+V View, and Esc to close any dialog.

---

## 11. Company and financial year

**Company:**
- Name is required. GSTIN and PAN are optional, but validated if entered. Mobile, email and PIN are not validated (Q-10).
- Code = `'C'` + the first 6 alphanumerics of the name (uppercase) + `'_'` + epoch milliseconds.
- StateCode = the first 2 characters of the GSTIN. It is not cross-checked against the State dropdown.
- Fin. Year From and Books From are free text (default `1-Apr-26`) and are not used to open a book.
- Bank details are printed on invoices.
- Delete removes the company and its year rows.

**Financial year:**
- YearName must match `^\d{4}-\d{4}$`.
- YearCode is the last two digits of each half, so `2026-2027` gives `2627`.
- From and To dates are required, picked within 2000–2100. They are not otherwise checked (Q-06).
- `UNIQUE(company, YearCode)` → `Year … already exists for this company`.
- Creating a year creates and seeds its book (§3).

**Creating a company** does not create a year (Q-05).

**FY guard:**
- Date pickers are limited to `fyFrom..fyTo`.
- The default date is today, or `fyFrom` if today falls outside the year.
- Services reject dates outside the year.
- Exception: the purchase Order Date is not limited.

---

## 12. Dashboard (`dashboard_service.dart`)

| KPI | Formula |
|---|---|
| Stock value | For each active item: (OpQty + Σ(In−Out)) × rate, where rate = PurRate if above 0, else SaleRate. Opening = OpValue if above 0, else OpQty × rate. Trend = % change versus opening, or the signed ₹ movement if opening is 0. |
| Today's sales | Σ NetAmount of active `sales` for today. Trend versus yesterday. A 7-day series (today is the 7th day) feeds the bar chart. |
| Cash balance | Σ ±OpBal of ledgers directly in A003 + Σ(Dr−Cr) on active vouchers for those ledgers. Trend = today's movement. |
| Pending bills | BillRef `New` rows are bills raised; all other RefTypes are settlements, summed per party and applied to bills **oldest first**. A bill is open if more than 0.005 remains unpaid. It is overdue if BillDate + ledger CreditDays is before today. |
| Recent transactions | The 5 newest active vouchers. Party = the ledger, falling back to the sale CustName, then the purchase supplier. Direction comes from the kind map (SAL, RCP, BNK, JNL, DRN, PRT, STJ count as inflow). Time label: "Just now / Nm ago / Nh ago / Yesterday / N days ago / dd-mm-yyyy". |

**Quick actions:** New Purchase, New Sale, Receipt, Payment, Journal Entry, New Party.

**Formatting:** Indian grouping (`18,42,350`); compact form K / L / Cr. The greeting depends on the hour: before 12 morning, before 17 afternoon, otherwise evening.

---

## 13. Printing

**Receipt / Payment voucher** (`voucher_print.dart:292-462`). A4 page, 28 pt margin, one bordered box.

1. **Company block:**
   - Name in upper case, bold, underlined
   - Address and City/State
   - Phone, Mobile, Email
   - `GSTIN: … PAN: …`
2. **Title:** Cash Receipt, Bank Receipt, Cash Payment or Bank Payment.
3. **Body:**
   - Voucher No., Date (`dd-MM-yyyy`)
   - For bank receipts only: "Debited in A/c <BANK>"
   - Party label: "Received On Account Of" or "Payment Made On Account Of"
   - Party details: name, Father's Name, address, contact, email
   - "A Sum Of" followed by the amount in words
   - "By Cash/Bank" and the amount
   - "On Account Of" followed by the narration, or `Amount received|paid[ Ag. <RefNo>]`
4. **Footer:** "For <COMPANY>" and "(Authorised Signatory)". Below the box: a timestamp. MDA's "An MDA Softwares" line is **left out** (§15).
5. **Errors:** printing a cancelled voucher is refused: `… has been cancelled and cannot be printed.`

**Amount in words:**
- Format: `Rupees <words>[ and <paise> Paise] Only`.
- Units: Crore (recursive), Lakh, Thousand, Hundred.
- Paise = round((amount − floor) × 100).

**New templates** (MDA had placeholders): GST tax invoice for sales, Journal/DN/CN vouchers, and master lists.

---

## 14. Quirk register — all kept as is

**Owner decision (2026-10-02):** everything in MDA was kept deliberately, so **every behaviour below is ported exactly as it is.** Nothing changes unless the owner asks for it. When a change is requested, update the row here and the code in the same PR.

The register stays as a map of non-obvious behaviours, so no one "fixes" them by accident.

**How the few platform differences are handled.** Where a behaviour physically cannot exist on the web, we use the closest equivalent:
- **Q-01:** `exit(0)` closes the app on desktop; in a browser, Back returns to the login screen.
- **Q-02:** a Flutter debug assertion has no browser equivalent. The New User form opens with role `User` preselected, which is the value Flutter would have stored.

| # | MDA behaviour (ported as is) |
|---|---|
| Q-01 | Back on Manage Years / Company select exits the app |
| Q-02 | New User role defaults to `User`, which is not in the role list |
| Q-03 | Users are stored per company-year book; a new year starts with only `admin`/`admin` (forced password change) |
| Q-04 | No login lockout |
| Q-05 | Creating a company does not create a year; one must be added in Manage Years before anyone can log in |
| Q-06 | FY dates are not checked (From < To, overlaps, match with the name) |
| Q-07 | Editing a sale or purchase deletes its voucher and reposts it with a new SAL/PUR voucher number; the bill number is kept |
| Q-08 | `SALEBILL`/`PURBILL.LastNo` are never updated; bill numbering runs on the highest existing number + 1 |
| Q-09 | The ledger form never sets StateCode; the party state falls back to the GSTIN prefix, or to "unknown", which counts as intra-state |
| Q-10 | Company mobile/email/PIN and ledger GSTIN/PAN/mobile are not validated |
| Q-11 | Ledger Country, Aadhar, Sales Exec and Reg. Type are shown but not saved |
| Q-12 | The role matrix is shown in User Management but not enforced; only User Management itself checks for Admin |
| Q-13 | Updating a Receipt, Payment, DN or CN removes its BillRef |
| Q-14 | DN/CN reason is not restored on load |
| Q-15 | Duplicate-name checks are case-sensitive (City is the exception) |
| Q-16 | Group: Update/Remove are disabled for top-level groups by mouse, but Enter on the Update button still updates |
| Q-17 | Only Ledger and Sale Type check usage before delete; elsewhere a delete either fails on the foreign key with no message or leaves orphans |
| Q-18 | Re-parenting a sub group keeps its old GrpType |
| Q-19 | The Stock Item unit list is hard-coded and differs from the Unit Master |
| Q-20 | The Stock Item form doesn't show rates, opening stock, MRP, barcode, cess or levels |
| Q-21 | The preview number is passed to save; after a clash it is not refreshed, so the user must press New/Clear |
| Q-22 | Sale form validation text is hidden (font size 0); only the red border shows |
| Q-23 | The bank payment PDF says "By Cash" |
| Q-24 | Receipt/Payment party lists include inactive ledgers |
| Q-25 | Editing the State text on a sale does not change the GST split; only the ledger's state does |
| Q-26 | Customer/supplier lists go one level below A007/L007 only; cash, bank and note lists use an exact group match |
| Q-27 | The sale stock check covers all godowns |
| Q-28 | Bill discount is applied after tax and posted to Discount Allowed |
| Q-29 | Cancel keeps ledger lines and BillRefs; reports filter on Status |
| Q-30 | A cash sale posts to the first A003 ledger by code |
| Q-31 | Cash balance counts only ledgers directly in A003 |
| Q-32 | Journal shows as an inflow on the dashboard |
| Q-33 | Stock Group GST/HSN are stored but not used as item defaults |
| Q-34 | The ledger opening-balance label uses today's date, not the open FY |
| Q-35 | Purchase line Location comes last in the Tab order (reachable by mouse or by picking) |
| Q-36 | Dashboard "View all →" (Recent Transactions) looks like a link but opens nothing; shown as plain text |
| Q-37 | Unit Master's and Godown's Update has no duplicate-name check, so two can share a name; its "This Name Already Exists" never appears |
| Q-38 | Unit Master's and Godown's Save and Update write the name into Misc_Pname too, so updating a seeded unit replaces its long name ("Numbers" becomes "Nos") |
| Q-39 | Unit Master's and Godown's Remove doesn't check whether a stock item or purchase uses it |
| Q-40 | Stock Group's Remove doesn't check whether a stock sub group sits under it |

## 15. Branding

**Owner decision (2026-10-02): the product ships unbranded until the build is complete.**
- No company or product name appears on screens or printouts. That means no "An MDA Softwares" footer and no "MDA Inventory" in the status bar.
- Every product-facing name, logo and footer line comes from one config file, `packages/core/src/brand.ts`. All its values are empty or neutral for now: the app title is plain "Inventory", and printouts have no footer line.
- Branding is added at the end by filling in that one file.
- The *customer's* company details (their name, GSTIN, bank) still print on their invoices. That is their data, not our branding.
