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

/** Unit Master and Godown (one field each). */
export const miscMasterSave = z.object({ name: z.string() });

/** Stock Group: GST Rate and HSN No. are free text, as MDA stores them. */
export const stockGroupSave = z.object({ name: z.string(), gstRate: opt, hsn: opt });

/** Stock Sub Group: `under` is the Stock Group's code. */
export const stockSubGroupSave = z.object({ name: z.string(), under: opt });

export const saleTypeSave = z.object({ name: z.string(), prefix: opt, saleBy: opt });

/** Stock Item: `code` is ignored on update (it can't change once saved). */
export const stockItemSave = z.object({
  code: z.string(),
  name: z.string(),
  printName: opt,
  subGrpCode: opt,
  unit: opt,
  regType: opt,
  gstRate: opt,
  hsn: opt,
});

/** A voucher as the tabs build it (receiptDraft, journalDraft, …). Rules are checked in @qi/core. */
const voucherLine = z.object({
  accCode: z.string(),
  dr: z.number(),
  cr: z.number(),
  narration: z.string().optional(),
});
export const voucherSave = z.object({
  vchrType: z.string(),
  vchrNo: opt,
  /** yyyy-MM-dd */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  partyCode: z.string().nullable().optional(),
  refNo: opt,
  narration: opt,
  lines: z.array(voucherLine),
  bills: z
    .array(
      z.object({
        accCode: z.string(),
        billNo: z.string(),
        refType: z.string(),
        amount: z.number(),
      }),
    )
    .optional(),
});
export const voucherUpdate = voucherSave.omit({ vchrType: true, vchrNo: true, bills: true });

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
export type MdaImportBody = z.infer<typeof mdaImport>;

export type ErrorBody = { message: string; fieldErrors?: Record<string, string> };

/** Import from MDA: rows of MDA's SQLite tables exactly as the browser read them (MDA's own
 *  column names). Mapping and checks are in @qi/services (mda-import.ts). */
const mdaRows = z.array(z.record(z.string(), z.unknown())).optional();
export const mdaImport = z.object({
  companies: z.array(
    z.object({
      company: z.record(z.string(), z.unknown()),
      years: z.array(
        z.object({
          year: z.record(z.string(), z.unknown()),
          book: z
            .object({
              User: mdaRows,
              Maacct2: mdaRows,
              Maacct: mdaRows,
              Misc_Master: mdaRows,
              Part_Master: mdaRows,
              VchrSeries: mdaRows,
              VchrHdr: mdaRows,
              VchrAcct: mdaRows,
              BillRef: mdaRows,
              AuditLog: mdaRows,
            })
            .nullable(),
        }),
      ),
    }),
  ),
});
