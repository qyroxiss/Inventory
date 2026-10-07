# Accounting Vouchers

**Status:** built 2026-10-07 from `accounting_vouchers_page.dart`, `posting_service.dart`,
`voucher_print.dart` and `code_gen.dart` (docs/LOGIC-SPEC.md §4.2, §6.3-6.9, §9, §13).

MDA has one page with five tabs; here each tab has its menu item's own address. The tab rail is
on the right on laptops, as in MDA, and a row above the form on tablets and phones. Each tab
keeps an unsaved entry while you look at another one, as MDA's tabs do.

| Tab | Address | Types | Code |
|---|---|---|---|
| Receipt | `/app/receipt` | RCP (cash), BNK (bank) | `apps/web/src/screens/vouchers/CashBankTab.tsx` |
| Payment | `/app/payment` | PAY, BPAY | same file |
| Journal | `/app/journal-voucher` | JNL | `JournalTab.tsx` |
| Debit Note | `/app/debit-note` | DRN | `NoteTab.tsx` |
| Credit Note | `/app/credit-note` | CRN | same file |

- **Shared code:**
  - `shared.tsx`: the page, the tab rail, the date limited to the open year, drop-downs and amount boxes.
  - `lists.tsx`: the View lists.
  - `print.tsx`: Receipt/Payment printing.
- **Server:**
  - `packages/services/src/vouchers.ts` is the single write path: the posting gate,
    numbering, save, update, cancel, lists and the print lookup.
  - `packages/core/src/vouchers.ts` holds the seeds, the messages, how each tab builds its
    lines, and amount in words.
- **API:** `/api/vouchers` (list, save), `/api/vouchers/next`, `/api/vouchers/:id/lines`,
  `/api/vouchers/:id` (update), `/api/vouchers/:id/cancel`, `/api/vouchers/print`.
- **Tables:** `vouchers` (VchrHdr), `voucher_lines` (VchrAcct), `bill_refs` (BillRef) and
  `voucher_series` (VchrSeries).

## Every book now carries (MDA's seeds)

- **Voucher series:** RCP-, BNK-, PAY-, BPAY-, JNL-, DRN-, CRN-, PUR-, SAL-, PRT-, SRT- and STJ-
  (3 digits), plus PB- and SB- (4 digits).
- **System ledgers:** TAX001–TAX006 (Input/Output CGST, SGST, IGST), TAX007 Round Off, SAL001
  Sales A/c and PUR001 Purchase A/c. Each is added only under a group the book has, and never
  over an existing code or name.
- New books get them when created. Books made earlier get them at their next sign-in, as MDA
  does when it opens an older year file.

## Posting (all tabs)

- **The posting gate**, MDA's messages verbatim:
  - The date must be inside the open financial year.
  - Every line needs a ledger. No negative amounts, and no line both debit and credit.
  - The amount can't be zero, and debit must equal credit (within half a paisa).
- **Numbering:** the number shown is the higher of the series counter and the highest number
  used, plus one. Saving records it.
  - If another voucher took it meanwhile: `Voucher number "X" is already used. Save again to
    take the next free number.` (the screen keeps the number: Q-44).
- **Update** keeps the number and type and replaces the lines. It writes no bill reference
  (Q-43).
- **Cancel** never deletes. The voucher is marked Cancelled with who and when; its lines and
  references stay; lists show it struck through or marked "Cancelled"; balances skip it.
  - **The confirmation:** "Cancel Voucher": "Cancel receipt RCP-001? The voucher stays in the
    books marked "Cancelled" so the audit trail is preserved, and it stops affecting balances
    and stock." The buttons are **Keep it** and **Cancel voucher**.
  - A cancelled voucher opens for viewing (its Save is refused: Q-45).
- Every save, update and cancel writes an audit-log entry.
- **Ledger Creation** now really refuses to remove a ledger used in any voucher line,
  cancelled or not: `"X" is used in N voucher line(s) and cannot be removed. Mark it inactive
  instead.`

## Receipt and Payment

- **Type:** Cash or Bank, chosen first. Each has its own series, and the type can't be switched
  while editing.
- **Fields:**
  - Voucher No (read-only) | Date
  - **Account**: the cash (A003) or bank (A002) ledgers, an exact group match. When there are
    none: "No cash accounts — create ledger first".
  - **Received From / Paid To**: any ledger.
  - **Amount (₹)**
  - Reference No (Receipt) or Cheque / Ref No (Payment)
  - Narration
- **What gets posted:**
  - Receipt: Dr the account, Cr the party.
  - Payment: Dr the party, Cr the account.
  - Both add a bill reference: the party, the voucher number, "On Account", the amount.
- **Messages:**
  - `Select account`, `Select party`, `Required`, `Enter valid amount`.
  - `Receipt RCP-001 saved` / `updated` / `cancelled`.
- **Buttons:** View · Remove (cancels; only while editing) · Print | Clear · Save/Update.
- **View:** "Receipt Vouchers" / "Payment Vouchers", with a Cash · Bank · All filter. Columns:
  Voucher No, Date, Type, Account, Party, Amount (struck through when cancelled).
- **Print:**
  1. "Print Receipt" asks for the number (the one on screen is filled in).
  2. "Not Found" if there's no such voucher; a cancelled one is refused ("…has been cancelled
     and cannot be printed.").
  3. Otherwise the A4 voucher appears with a Print button, laid out as MDA's: company block,
     title, voucher no. and date (and "Debited in A/c" for bank receipts), party block, "A Sum
     Of" in words, the amount, "On Account Of", and the signatory footer.
  4. The footer reads "Printed by Inventory"; MDA's own line is left out.

## Journal

- Date | Voucher No, then the entries: Ledger Account · Dr/Cr · Amount. There are at least two
  lines; **+ Add Entry** adds a Dr line, and ✕ removes a line while there are more than two.
- The totals box shows Total Dr, Total Cr and "Balanced ✓", or "Diff: ₹x". Save is refused
  while it doesn't balance: `Not balanced. Difference: ₹x`.
- **Buttons:** View · Cancel Vchr · Print | Clear · Save Voucher / Update Voucher.
  - Print shows MDA's own message: "Journal printing arrives with the report module".

## Debit Note and Credit Note

- **Fields:**
  - Date | Voucher No
  - **Party Account**: Sundry Creditors (L007) for debit notes, Sundry Debtors (A007) for
    credit notes; every ledger if that group has none.
  - **Reason**
    - Debit notes: Purchase Return, Price Difference, Short Supply, Damaged Goods, Other.
    - Credit notes: Sales Return, Price Difference, Excess Supply, Discount Given, Other.
  - **Against (Ref)**
  - The entries (Ledger Account · Amount, + Add Item), with the Total
  - Narration
- **What gets posted:**
  - Debit Note: Dr the party for the total (narration = reason), Cr each entry.
  - Credit Note: Dr each entry, Cr the party for the total.
  - Both add a bill reference: "New", the total.
  - No GST and no stock effect.
- **Reopening a note** brings back its entries, party, ref and narration, but not the reason
  (Q-46).
- **Buttons:** View · Cancel Note · Print | Clear · Save Debit Note / Update Debit Note.
  - Print shows "Debit note printing arrives with the report module".

## Import from MDA

The import brings MDA's vouchers too: VchrSeries, VchrHdr, VchrAcct and BillRef, with their
numbers. Purchase and sale vouchers (PUR, SAL) come in as vouchers. Their bills, item lines and
stock arrive with the Transactions screens.

## Quirks kept

- **Q-43:** updating drops the bill reference.
- **Q-44:** a number clash keeps the same number on screen.
- **Q-45:** a cancelled voucher's Save is refused as a number clash.
- **Q-46:** the reason isn't reloaded.
- **Q-47:** bank payments print "By Cash".
- **Q-48:** the Receipt/Payment lists show yyyy-MM-dd.
- Plus Q-26: the cash, bank and party lists use an exact group match, so ledgers in sub
  groups under them aren't listed.

## Checked

- Every flow on all five tabs in the browser: save, view, reopen and update, cancel, print
  preview, refusing a cancelled print, an unbalanced journal, and the reason a note asks for
  again.
- No scrolling on 1280×720, 1366×768 and 1920×1080, or on tablets. Phones scroll, as allowed.
- Fixed in the app shell along the way: on phones, a page taller than the screen used to spill
  past its paper background. Pages now grow with their content.
