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

export type CompanyCreate = z.infer<typeof companyCreate>;
export type YearCreate = z.infer<typeof yearCreate>;
export type BookLoginInput = z.infer<typeof bookLogin>;
export type ChangePasswordInput = z.infer<typeof changePassword>;

/** Body of every 422 response. */
export type ErrorBody = { message: string; fieldErrors?: Record<string, string> };
