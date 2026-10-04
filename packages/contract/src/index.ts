// @qi/contract — request shapes shared by apps/api (validation) and apps/web (forms).
// Only the *shape* is checked here; business rules and their exact messages stay in
// @qi/core so the wording matches MDA everywhere.

import { z } from 'zod';

const opt = z.string().optional();

export const companyCreate = z.object({
  compName: z.string(),
  mailName: opt,
  add1: opt,
  state: opt,
  country: opt,
  pinCode: opt,
  phone: opt,
  mobile: opt,
  fax: opt,
  email: opt,
  website: opt,
  gstin: opt,
  pan: opt,
  cin: opt,
  bankName: opt,
  bankBranch: opt,
  bankAcNo: opt,
  bankIfsc: opt,
  finYrFrom: opt,
  booksFrom: opt,
});

export const yearCreate = z.object({
  yearName: z.string(),
  /** dd/MM/yyyy as MDA's date picker writes it, or ISO yyyy-MM-dd. */
  fromDate: z.string(),
  toDate: z.string(),
});

export const bookLogin = z.object({
  yearId: z.string().uuid(),
  username: z.string(),
  password: z.string(),
});

export const changePassword = z.object({
  newPassword: z.string(),
  confirmPassword: z.string(),
});

export const groupCreate = z.object({
  name: z.string(),
  type: z.enum(['Liabilities', 'Expenses', 'Assets', 'Income']).optional(),
  isLedger: z.enum(['Yes', 'No']).optional(),
});

export const subGroupCreate = z.object({
  name: z.string(),
  under: z.string().optional(),
});

/** Only the fields Maacct actually stores — Aadhar/Sales Executive/Reg. Type/Country are shown
 * in Ledger Creation's form but MDA never saves them, so they're never sent here either. */
export const ledgerCreate = z.object({
  name: z.string(),
  address: opt,
  city: opt,
  state: opt,
  pincode: opt,
  mobile: opt,
  email: opt,
  pan: opt,
  under: opt,
  gstin: opt,
  openingBalance: opt,
  drCr: z.enum(['Dr', 'Cr']).optional(),
});

export const miscListAdd = z.object({
  type: z.string(),
  name: z.string(),
});

export type CompanyCreate = z.infer<typeof companyCreate>;
export type YearCreate = z.infer<typeof yearCreate>;
export type BookLoginInput = z.infer<typeof bookLogin>;
export type ChangePasswordInput = z.infer<typeof changePassword>;
export type GroupCreate = z.infer<typeof groupCreate>;
export type SubGroupCreate = z.infer<typeof subGroupCreate>;
export type LedgerCreate = z.infer<typeof ledgerCreate>;
export type MiscListAdd = z.infer<typeof miscListAdd>;

/** Body of every 422 response. */
export type ErrorBody = { message: string; fieldErrors?: Record<string, string> };
