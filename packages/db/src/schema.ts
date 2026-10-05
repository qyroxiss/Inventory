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
