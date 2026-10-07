// Database schema (Postgres dialect; same schema on cloud Postgres and desktop PGlite).
// Table-by-table mapping from MDA-Inventory is in docs/LOGIC-SPEC.md §2.
//
// How MDA's files map here:
//   MDA_Registry.db  CompanyMaster  -> companies
//                    Company_Year   -> financial_years   (the registry row)
//   <CompCode>/MDA_Inv2627.db       -> books             (one row per year "file")
//   [User] inside each year file    -> book_users        (scoped by book_id)
// Deleting a financial_years row keeps its book, exactly as MDA keeps the .db file;
// adding the same year again re-attaches to it.

import {
  bigint,
  boolean,
  date,
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { v7 as uuidv7 } from 'uuid';

const id = () =>
  uuid('id')
    .primaryKey()
    .$defaultFn(() => uuidv7());
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

// ── Account layer (better-auth). Web/mobile only; desktop uses accountId 'local'. ──
// Field names are what better-auth expects; columns are snake_case.

export const user = pgTable('auth_user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const session = pgTable('auth_session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  token: text('token').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
});

export const account = pgTable('auth_account', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const verification = pgTable('auth_verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── Registry (MDA_Registry.db) ──────────────────────────────────────────────────

export const companies = pgTable(
  'companies',
  {
    id: id(),
    /** better-auth user id of the owning account; 'local' on desktop. */
    accountId: text('account_id').notNull(),
    compCode: text('comp_code').notNull(),
    compName: text('comp_name').notNull(),
    mailName: text('mail_name'),
    add1: text('add1'),
    add2: text('add2'),
    city: text('city'),
    state: text('state'),
    stateCode: text('state_code'),
    country: text('country').default('India'),
    pinCode: text('pin_code'),
    phone: text('phone'),
    mobile: text('mobile'),
    fax: text('fax'),
    email: text('email'),
    website: text('website'),
    gstin: text('gstin'),
    pan: text('pan'),
    cin: text('cin'),
    bankName: text('bank_name'),
    bankBranch: text('bank_branch'),
    bankAcNo: text('bank_ac_no'),
    bankIfsc: text('bank_ifsc'),
    /** Free text, default '1-Apr-26'; stored only, never used to open a book (as in MDA). */
    finYrFrom: text('fin_yr_from'),
    booksFrom: text('books_from'),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('companies_account_code').on(t.accountId, t.compCode),
    index('companies_account_name').on(t.accountId, t.compName),
  ],
);

/** One row per MDA year database file. Not deleted when its year row is. */
export const books = pgTable(
  'books',
  {
    id: id(),
    /** No foreign key on purpose: MDA keeps a company's files after the company is deleted. */
    companyId: uuid('company_id').notNull(),
    yearCode: text('year_code').notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('books_company_year').on(t.companyId, t.yearCode)],
);

export const financialYears = pgTable(
  'financial_years',
  {
    id: id(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    bookId: uuid('book_id')
      .notNull()
      .references(() => books.id),
    yearCode: text('year_code').notNull(),
    yearName: text('year_name').notNull(),
    fromDate: date('from_date').notNull(),
    toDate: date('to_date').notNull(),
  },
  (t) => [uniqueIndex('financial_years_company_code').on(t.companyId, t.yearCode)],
);

// ── Book tables (inside each MDA year file) ─────────────────────────────────────

export const bookUsers = pgTable(
  'book_users',
  {
    id: id(),
    bookId: uuid('book_id')
      .notNull()
      .references(() => books.id),
    userCode: text('user_code').notNull(),
    /** Case-sensitive unique, like SQLite's UNIQUE in MDA. */
    userName: text('user_name').notNull(),
    /** `pbkdf2$...` hash, or legacy plain text (rehashed on next login). */
    password: text('password').notNull(),
    role: text('role').notNull().default('User'),
    isActive: boolean('is_active').notNull().default(true),
    mustChangePassword: boolean('must_change_password').notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('book_users_code').on(t.bookId, t.userCode),
    uniqueIndex('book_users_name').on(t.bookId, t.userName),
  ],
);

/** Maacct2: accounting groups and sub groups, one table for both (docs/LOGIC-SPEC.md §2). */
export const accountGroups = pgTable(
  'account_groups',
  {
    id: id(),
    bookId: uuid('book_id')
      .notNull()
      .references(() => books.id),
    grpCode: text('grp_code').notNull(),
    grpName: text('grp_name').notNull(),
    grpType: text('grp_type').notNull(),
    /** `'Parent'` = top level; otherwise another row's grpCode. */
    parentGrp: text('parent_grp').notNull(),
    isLedger: text('is_ledger').notNull().default('No'),
    sortOrder: bigint('sort_order', { mode: 'number' }).notNull().default(0),
    /** MDA's Clr column: stored and carried over on import, never read by any screen. */
    clr: text('clr'),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('account_groups_book_code').on(t.bookId, t.grpCode),
    // Case-sensitive, like MDA's SQLite UNIQUE (docs/LOGIC-SPEC.md Q-15).
    uniqueIndex('account_groups_book_name').on(t.bookId, t.grpName),
  ],
);

/** Maacct: ledgers (actual accounts — customers, suppliers, cash, bank, expense, ...). */
export const ledgers = pgTable(
  'ledgers',
  {
    id: id(),
    bookId: uuid('book_id')
      .notNull()
      .references(() => books.id),
    accCode: text('acc_code').notNull(),
    accName: text('acc_name').notNull(),
    /** The owning group or sub group's grpCode (account_groups), resolved from its name. */
    grpCode: text('grp_code').notNull(),
    opBal: numeric('op_bal', { precision: 14, scale: 2 }).notNull().default('0'),
    drCr: text('dr_cr').notNull().default('Dr'),
    add1: text('add1'),
    /** In the schema like MDA's Maacct, but no screen has ever written to it. */
    add2: text('add2'),
    city: text('city'),
    state: text('state'),
    stateCode: text('state_code'),
    pinCode: text('pin_code'),
    /** In the schema like MDA's Maacct, but no screen has ever written to it. */
    phone: text('phone'),
    mobile: text('mobile'),
    email: text('email'),
    gstin: text('gstin'),
    pan: text('pan'),
    creditDays: bigint('credit_days', { mode: 'number' }).notNull().default(0),
    creditLimit: numeric('credit_limit', { precision: 14, scale: 2 }).notNull().default('0'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('ledgers_book_code').on(t.bookId, t.accCode),
    // Case-sensitive, like MDA's SQLite UNIQUE on AccName.
    uniqueIndex('ledgers_book_name').on(t.bookId, t.accName),
  ],
);

/** Misc_Master: small name lists that learn new entries as they're typed (City first; later
 *  Unit, Godown, Stock Group and Sale Type share this same table, as MDA's does). */
export const miscList = pgTable(
  'misc_list',
  {
    id: id(),
    bookId: uuid('book_id')
      .notNull()
      .references(() => books.id),
    miscCode: text('misc_code').notNull(),
    miscName: text('misc_name').notNull(),
    miscType: text('misc_type').notNull(),
    // The rest of MDA's Misc_Master columns. What each holds depends on the type (Unit: full
    // name in Pname; Stock Sub Group: its group's code in Pname; Sale Type: short name in Pname,
    // Sname, ...); their screens read them as they're built.
    miscPname: text('misc_pname'),
    miscSname: text('misc_sname'),
    miscGen1: text('misc_gen1'),
    miscGen2: text('misc_gen2'),
    miscGen3: text('misc_gen3'),
    miscGen4: text('misc_gen4'),
    miscGen5: text('misc_gen5'),
    miscGen6: text('misc_gen6'),
    miscDate: text('misc_date'),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('misc_list_book_code').on(t.bookId, t.miscCode),
    // No DB constraint on the name itself, as in MDA's Misc_Master: addIfNew() does its own
    // case-insensitive lookup before inserting, so duplicates never reach this table.
    index('misc_list_book_type_name').on(t.bookId, t.miscType, t.miscName),
  ],
);

/** Part_Master: stock items. Every column of MDA's table; the Stock Item screen writes code,
 *  name, print name, sub group, unit, tax type, GST rate and HSN; the rest is carried over from
 *  MDA imports and used by later screens (rates, opening stock, levels, barcode). */
export const stockItems = pgTable(
  'stock_items',
  {
    id: id(),
    bookId: uuid('book_id')
      .notNull()
      .references(() => books.id),
    /** Typed by the user, and never changed afterwards (stock_item_page.dart:483). */
    partCode: text('part_code').notNull(),
    partName: text('part_name').notNull(),
    printName: text('print_name'),
    /** A Stock Sub Group's misc code, or '' for none. */
    subGrpCode: text('sub_grp_code'),
    unit: text('unit'),
    altUnit: text('alt_unit'),
    convFactor: numeric('conv_factor', { precision: 14, scale: 4 }).notNull().default('0'),
    /** Tax Type: Taxable, Non GST, Nil Rated or Exempt. */
    regType: text('reg_type'),
    /** Text such as "18%", as MDA stores it. */
    gstRate: text('gst_rate'),
    cessRate: numeric('cess_rate', { precision: 8, scale: 2 }).notNull().default('0'),
    hsnNo: text('hsn_no'),
    purRate: numeric('pur_rate', { precision: 14, scale: 2 }).notNull().default('0'),
    saleRate: numeric('sale_rate', { precision: 14, scale: 2 }).notNull().default('0'),
    mrp: numeric('mrp', { precision: 14, scale: 2 }).notNull().default('0'),
    opQty: numeric('op_qty', { precision: 14, scale: 3 }).notNull().default('0'),
    opValue: numeric('op_value', { precision: 14, scale: 2 }).notNull().default('0'),
    reorderLevel: numeric('reorder_level', { precision: 14, scale: 3 }).notNull().default('0'),
    minLevel: numeric('min_level', { precision: 14, scale: 3 }).notNull().default('0'),
    maxLevel: numeric('max_level', { precision: 14, scale: 3 }).notNull().default('0'),
    barcode: text('barcode'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('stock_items_book_code').on(t.bookId, t.partCode),
    // Case-sensitive, like MDA's SQLite UNIQUE on PartName.
    uniqueIndex('stock_items_book_name').on(t.bookId, t.partName),
  ],
);

// ── Vouchers (posting_service.dart; docs/LOGIC-SPEC.md §6) ──────────────────────

/** VchrHdr: one row per voucher of any type (RCP, BNK, PAY, BPAY, JNL, DRN, CRN, PUR, SAL, …).
 *  Never deleted: cancelling sets Status 'Cancelled' and keeps the rows for audit. Ids are
 *  UUIDv7, so ordering by id is ordering by creation, like MDA's VchrId. */
export const vouchers = pgTable(
  'vouchers',
  {
    id: id(),
    bookId: uuid('book_id')
      .notNull()
      .references(() => books.id),
    vchrNo: text('vchr_no').notNull(),
    vchrType: text('vchr_type').notNull(),
    vchrDate: date('vchr_date').notNull(),
    partyCode: text('party_code'),
    refNo: text('ref_no'),
    refDate: text('ref_date'),
    narration: text('narration'),
    placeOfSupply: text('place_of_supply'),
    taxableAmt: numeric('taxable_amt', { precision: 14, scale: 2 }).notNull().default('0'),
    cgstAmt: numeric('cgst_amt', { precision: 14, scale: 2 }).notNull().default('0'),
    sgstAmt: numeric('sgst_amt', { precision: 14, scale: 2 }).notNull().default('0'),
    igstAmt: numeric('igst_amt', { precision: 14, scale: 2 }).notNull().default('0'),
    cessAmt: numeric('cess_amt', { precision: 14, scale: 2 }).notNull().default('0'),
    otherChrg: numeric('other_chrg', { precision: 14, scale: 2 }).notNull().default('0'),
    roundOff: numeric('round_off', { precision: 14, scale: 2 }).notNull().default('0'),
    netAmount: numeric('net_amount', { precision: 14, scale: 2 }).notNull().default('0'),
    /** 'Active' or 'Cancelled'. */
    status: text('status').notNull().default('Active'),
    createdBy: text('created_by'),
    createdAt: createdAt(),
    modifiedBy: text('modified_by'),
    modifiedAt: timestamp('modified_at', { withTimezone: true }),
    cancelledBy: text('cancelled_by'),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('vouchers_book_type_no').on(t.bookId, t.vchrType, t.vchrNo),
    index('vouchers_book_date').on(t.bookId, t.vchrDate),
  ],
);

/** VchrAcct: the double entry. ΣDr equals ΣCr for every voucher (the posting gate checks). */
export const voucherLines = pgTable(
  'voucher_lines',
  {
    id: id(),
    voucherId: uuid('voucher_id')
      .notNull()
      .references(() => vouchers.id, { onDelete: 'cascade' }),
    lineNo: bigint('line_no', { mode: 'number' }).notNull(),
    accCode: text('acc_code').notNull(),
    drAmount: numeric('dr_amount', { precision: 14, scale: 2 }).notNull().default('0'),
    crAmount: numeric('cr_amount', { precision: 14, scale: 2 }).notNull().default('0'),
    narration: text('narration'),
  },
  (t) => [index('voucher_lines_voucher').on(t.voucherId), index('voucher_lines_acc').on(t.accCode)],
);

/** BillRef: bill-wise references (New / Against / On Account / Advance). */
export const billRefs = pgTable(
  'bill_refs',
  {
    id: id(),
    voucherId: uuid('voucher_id')
      .notNull()
      .references(() => vouchers.id, { onDelete: 'cascade' }),
    accCode: text('acc_code').notNull(),
    billNo: text('bill_no').notNull(),
    refType: text('ref_type').notNull().default('New'),
    billDate: text('bill_date'),
    dueDate: text('due_date'),
    amount: numeric('amount', { precision: 14, scale: 2 }).notNull().default('0'),
  },
  (t) => [index('bill_refs_voucher').on(t.voucherId)],
);

/** VchrSeries: each voucher type's prefix, width and last number used. */
export const voucherSeries = pgTable(
  'voucher_series',
  {
    id: id(),
    bookId: uuid('book_id')
      .notNull()
      .references(() => books.id),
    vchrType: text('vchr_type').notNull(),
    vchrName: text('vchr_name'),
    prefix: text('prefix'),
    width: bigint('width', { mode: 'number' }).notNull().default(3),
    lastNo: bigint('last_no', { mode: 'number' }).notNull().default(0),
  },
  (t) => [uniqueIndex('voucher_series_book_type').on(t.bookId, t.vchrType)],
);

/** VchrItem: the item side of a purchase or sale voucher, with its tax split. */
export const voucherItems = pgTable(
  'voucher_items',
  {
    id: id(),
    voucherId: uuid('voucher_id')
      .notNull()
      .references(() => vouchers.id, { onDelete: 'cascade' }),
    lineNo: bigint('line_no', { mode: 'number' }).notNull(),
    partCode: text('part_code').notNull(),
    godownCode: text('godown_code'),
    qty: numeric('qty', { precision: 14, scale: 3 }).notNull().default('0'),
    unit: text('unit'),
    rate: numeric('rate', { precision: 14, scale: 2 }).notNull().default('0'),
    discPct: numeric('disc_pct', { precision: 8, scale: 2 }).notNull().default('0'),
    discAmt: numeric('disc_amt', { precision: 14, scale: 2 }).notNull().default('0'),
    hsnNo: text('hsn_no'),
    gstRate: numeric('gst_rate', { precision: 8, scale: 2 }).notNull().default('0'),
    cessRate: numeric('cess_rate', { precision: 8, scale: 2 }).notNull().default('0'),
    taxableAmt: numeric('taxable_amt', { precision: 14, scale: 2 }).notNull().default('0'),
    cgstAmt: numeric('cgst_amt', { precision: 14, scale: 2 }).notNull().default('0'),
    sgstAmt: numeric('sgst_amt', { precision: 14, scale: 2 }).notNull().default('0'),
    igstAmt: numeric('igst_amt', { precision: 14, scale: 2 }).notNull().default('0'),
    cessAmt: numeric('cess_amt', { precision: 14, scale: 2 }).notNull().default('0'),
    lineTotal: numeric('line_total', { precision: 14, scale: 2 }).notNull().default('0'),
  },
  (t) => [index('voucher_items_voucher').on(t.voucherId)],
);

/** StockTrn: every quantity movement. Stock in hand = opening + Σ(In − Out). Cancelling a bill
 *  deletes its rows, so its quantities stop counting at once. */
export const stockTrn = pgTable(
  'stock_trn',
  {
    id: id(),
    bookId: uuid('book_id')
      .notNull()
      .references(() => books.id),
    voucherId: uuid('voucher_id').references(() => vouchers.id, { onDelete: 'cascade' }),
    vchrType: text('vchr_type'),
    /** The bill number, not the voucher number. */
    vchrNo: text('vchr_no'),
    trnDate: date('trn_date').notNull(),
    partCode: text('part_code').notNull(),
    godownCode: text('godown_code'),
    inQty: numeric('in_qty', { precision: 14, scale: 3 }).notNull().default('0'),
    outQty: numeric('out_qty', { precision: 14, scale: 3 }).notNull().default('0'),
    rate: numeric('rate', { precision: 14, scale: 2 }).notNull().default('0'),
    value: numeric('value', { precision: 14, scale: 2 }).notNull().default('0'),
    remarks: text('remarks'),
  },
  (t) => [
    index('stock_trn_book_part').on(t.bookId, t.partCode),
    index('stock_trn_voucher').on(t.voucherId),
  ],
);

// ── Purchase document (purchase_service.dart; docs/LOGIC-SPEC.md §6.2) ─────────────

/** PurcMaster: the purchase bill, unique by bill number within a book. Its accounting and stock
 *  effect live on the PUR voucher it points at. */
export const purchases = pgTable(
  'purchases',
  {
    id: id(),
    bookId: uuid('book_id')
      .notNull()
      .references(() => books.id),
    billNo: text('bill_no').notNull(),
    billDate: date('bill_date').notNull(),
    suppCode: text('supp_code').notNull(),
    suppInvNo: text('supp_inv_no'),
    /** Free text, as MDA's box takes it. */
    suppInvDate: text('supp_inv_date'),
    supplyWith: text('supply_with'),
    orderNo: text('order_no'),
    /** yyyy-MM-dd from the picker. */
    orderDate: text('order_date'),
    orderType: text('order_type'),
    goodsRecNo: text('goods_rec_no'),
    /** Free text, as MDA's box takes it. */
    recDate: text('rec_date'),
    transporter: text('transporter'),
    narration: text('narration'),
    isInterState: boolean('is_inter_state').notNull().default(false),
    totalQty: numeric('total_qty', { precision: 14, scale: 3 }).notNull().default('0'),
    subTotal: numeric('sub_total', { precision: 14, scale: 2 }).notNull().default('0'),
    discAmt: numeric('disc_amt', { precision: 14, scale: 2 }).notNull().default('0'),
    sgstAmt: numeric('sgst_amt', { precision: 14, scale: 2 }).notNull().default('0'),
    cgstAmt: numeric('cgst_amt', { precision: 14, scale: 2 }).notNull().default('0'),
    igstAmt: numeric('igst_amt', { precision: 14, scale: 2 }).notNull().default('0'),
    roundOff: numeric('round_off', { precision: 14, scale: 2 }).notNull().default('0'),
    netAmount: numeric('net_amount', { precision: 14, scale: 2 }).notNull().default('0'),
    voucherId: uuid('voucher_id').references(() => vouchers.id),
    /** 'Active' or 'Cancelled'. */
    status: text('status').notNull().default('Active'),
    createdBy: text('created_by'),
    createdAt: createdAt(),
    modifiedBy: text('modified_by'),
    modifiedAt: timestamp('modified_at', { withTimezone: true }),
    cancelledBy: text('cancelled_by'),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('purchases_book_bill').on(t.bookId, t.billNo),
    index('purchases_book_date').on(t.bookId, t.billDate),
  ],
);

/** PurcDetail: one row per item of a purchase bill. */
export const purchaseLines = pgTable(
  'purchase_lines',
  {
    id: id(),
    purchaseId: uuid('purchase_id')
      .notNull()
      .references(() => purchases.id, { onDelete: 'cascade' }),
    lineNo: bigint('line_no', { mode: 'number' }).notNull(),
    itemCode: text('item_code').notNull(),
    itemName: text('item_name'),
    hsnNo: text('hsn_no'),
    unit: text('unit'),
    location: text('location'),
    qty: numeric('qty', { precision: 14, scale: 3 }).notNull().default('0'),
    rate: numeric('rate', { precision: 14, scale: 2 }).notNull().default('0'),
    disP: numeric('dis_p', { precision: 8, scale: 2 }).notNull().default('0'),
    disA: numeric('dis_a', { precision: 14, scale: 2 }).notNull().default('0'),
    amount: numeric('amount', { precision: 14, scale: 2 }).notNull().default('0'),
    sgstP: numeric('sgst_p', { precision: 8, scale: 2 }).notNull().default('0'),
    sgstA: numeric('sgst_a', { precision: 14, scale: 2 }).notNull().default('0'),
    cgstP: numeric('cgst_p', { precision: 8, scale: 2 }).notNull().default('0'),
    cgstA: numeric('cgst_a', { precision: 14, scale: 2 }).notNull().default('0'),
    igstP: numeric('igst_p', { precision: 8, scale: 2 }).notNull().default('0'),
    igstA: numeric('igst_a', { precision: 14, scale: 2 }).notNull().default('0'),
    lineTotal: numeric('line_total', { precision: 14, scale: 2 }).notNull().default('0'),
  },
  (t) => [uniqueIndex('purchase_lines_purchase_line').on(t.purchaseId, t.lineNo)],
);

// ── Sale document (sale_service.dart; docs/LOGIC-SPEC.md §6.1) ─────────────────────

/** SaleMaster: the sale bill, unique by bill number within a book. The customer's address block
 *  is copied on, so a reprint shows it as it was when the bill was raised. */
export const sales = pgTable(
  'sales',
  {
    id: id(),
    bookId: uuid('book_id')
      .notNull()
      .references(() => books.id),
    billNo: text('bill_no').notNull(),
    billDate: date('bill_date').notNull(),
    /** The sale type's name. */
    saleType: text('sale_type'),
    /** 'Cash' or 'Credit'. */
    payMode: text('pay_mode').notNull().default('Cash'),
    custCode: text('cust_code'),
    custName: text('cust_name'),
    address: text('address'),
    area: text('area'),
    city: text('city'),
    state: text('state'),
    stateCode: text('state_code'),
    mobile: text('mobile'),
    gstNo: text('gst_no'),
    location: text('location'),
    narration: text('narration'),
    isInterState: boolean('is_inter_state').notNull().default(false),
    totalQty: numeric('total_qty', { precision: 14, scale: 3 }).notNull().default('0'),
    subTotal: numeric('sub_total', { precision: 14, scale: 2 }).notNull().default('0'),
    itemDiscAmt: numeric('item_disc_amt', { precision: 14, scale: 2 }).notNull().default('0'),
    billDiscPct: numeric('bill_disc_pct', { precision: 8, scale: 2 }).notNull().default('0'),
    billDiscAmt: numeric('bill_disc_amt', { precision: 14, scale: 2 }).notNull().default('0'),
    sgstAmt: numeric('sgst_amt', { precision: 14, scale: 2 }).notNull().default('0'),
    cgstAmt: numeric('cgst_amt', { precision: 14, scale: 2 }).notNull().default('0'),
    igstAmt: numeric('igst_amt', { precision: 14, scale: 2 }).notNull().default('0'),
    roundOff: numeric('round_off', { precision: 14, scale: 2 }).notNull().default('0'),
    netAmount: numeric('net_amount', { precision: 14, scale: 2 }).notNull().default('0'),
    voucherId: uuid('voucher_id').references(() => vouchers.id),
    status: text('status').notNull().default('Active'),
    createdBy: text('created_by'),
    createdAt: createdAt(),
    modifiedBy: text('modified_by'),
    modifiedAt: timestamp('modified_at', { withTimezone: true }),
    cancelledBy: text('cancelled_by'),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('sales_book_bill').on(t.bookId, t.billNo),
    index('sales_book_date').on(t.bookId, t.billDate),
  ],
);

/** SaleDetail: one row per item of a sale bill. */
export const saleLines = pgTable(
  'sale_lines',
  {
    id: id(),
    saleId: uuid('sale_id')
      .notNull()
      .references(() => sales.id, { onDelete: 'cascade' }),
    lineNo: bigint('line_no', { mode: 'number' }).notNull(),
    itemCode: text('item_code').notNull(),
    itemName: text('item_name'),
    hsnNo: text('hsn_no'),
    unit: text('unit'),
    location: text('location'),
    qty: numeric('qty', { precision: 14, scale: 3 }).notNull().default('0'),
    rate: numeric('rate', { precision: 14, scale: 2 }).notNull().default('0'),
    disP: numeric('dis_p', { precision: 8, scale: 2 }).notNull().default('0'),
    disA: numeric('dis_a', { precision: 14, scale: 2 }).notNull().default('0'),
    amount: numeric('amount', { precision: 14, scale: 2 }).notNull().default('0'),
    sgstP: numeric('sgst_p', { precision: 8, scale: 2 }).notNull().default('0'),
    sgstA: numeric('sgst_a', { precision: 14, scale: 2 }).notNull().default('0'),
    cgstP: numeric('cgst_p', { precision: 8, scale: 2 }).notNull().default('0'),
    cgstA: numeric('cgst_a', { precision: 14, scale: 2 }).notNull().default('0'),
    igstP: numeric('igst_p', { precision: 8, scale: 2 }).notNull().default('0'),
    igstA: numeric('igst_a', { precision: 14, scale: 2 }).notNull().default('0'),
    lineTotal: numeric('line_total', { precision: 14, scale: 2 }).notNull().default('0'),
  },
  (t) => [uniqueIndex('sale_lines_sale_line').on(t.saleId, t.lineNo)],
);

// ── Stock Journal (not built in MDA; docs/design/TRANSACTIONS.md) ───────────────────

/** A stock journal's lines; its header is its STJ voucher. `side` is 'out' (Consumption /
 *  Source) or 'in' (Production / Destination). Kept when cancelled, so it can still be opened;
 *  only its stock_trn rows go. */
export const stockJournalLines = pgTable(
  'stock_journal_lines',
  {
    id: id(),
    voucherId: uuid('voucher_id')
      .notNull()
      .references(() => vouchers.id, { onDelete: 'cascade' }),
    lineNo: bigint('line_no', { mode: 'number' }).notNull(),
    side: text('side').notNull(),
    itemCode: text('item_code').notNull(),
    itemName: text('item_name'),
    unit: text('unit'),
    godown: text('godown'),
    qty: numeric('qty', { precision: 14, scale: 3 }).notNull().default('0'),
    rate: numeric('rate', { precision: 14, scale: 2 }).notNull().default('0'),
    amount: numeric('amount', { precision: 14, scale: 2 }).notNull().default('0'),
  },
  (t) => [uniqueIndex('stock_journal_lines_voucher_line').on(t.voucherId, t.lineNo)],
);

export const auditLog = pgTable(
  'audit_log',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    bookId: uuid('book_id')
      .notNull()
      .references(() => books.id),
    logAt: timestamp('log_at', { withTimezone: true }).notNull().defaultNow(),
    userName: text('user_name'),
    action: text('action'),
    tableName: text('table_name'),
    recordKey: text('record_key'),
    details: text('details'),
  },
  (t) => [index('audit_log_book_at').on(t.bookId, t.logAt)],
);
