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
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { v7 as uuidv7 } from 'uuid';

const id = () => uuid('id').primaryKey().$defaultFn(() => uuidv7());
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
