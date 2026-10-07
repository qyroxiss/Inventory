// Import from MDA: copies the companies, years and books of an MDA-Inventory data folder into
// this account. The browser reads MDA's SQLite files and sends their rows as they are, with
// MDA's own column names; this file maps them onto our tables.
//
// Covered today: CompanyMaster, Company_Year, and per year User, Maacct2, Maacct, Misc_Master,
// Part_Master and AuditLog. The purchase, sale and voucher tables are added here as their
// screens land. A company whose CompCode this account already has is skipped, so importing the same
// folder twice changes nothing.

import { SEED_ADMIN, hashPassword, importMessages, parseDate } from '@qi/core';
import { and, eq, schema, type Db } from '@qi/db';
import { UserError } from './errors.ts';
import { seedBook } from './years.ts';

const {
  accountGroups,
  auditLog,
  bookUsers,
  books,
  companies,
  financialYears,
  ledgers,
  miscList,
  stockItems,
} = schema;

type Row = Record<string, unknown>;

export type MdaBook = {
  User?: Row[];
  Maacct2?: Row[];
  Maacct?: Row[];
  Misc_Master?: Row[];
  Part_Master?: Row[];
  AuditLog?: Row[];
};
export type MdaImport = {
  companies: {
    company: Row;
    /** `book` is null when the year's .db file wasn't found; MDA would create a fresh one. */
    years: { year: Row; book: MdaBook | null }[];
  }[];
};
export type MdaImportResult = {
  imported: { compName: string; years: number }[];
  skipped: string[];
};

/** A text column: null/empty stays null, everything else as text. */
const str = (v: unknown): string | null =>
  v === null || v === undefined || v === '' ? null : String(v);
const num = (v: unknown): number => (typeof v === 'number' ? v : Number(v ?? 0) || 0);
/** SQLite stores booleans as 0/1; a missing value takes the column's MDA default. */
const bool = (v: unknown, dflt: boolean): boolean =>
  v === null || v === undefined || v === '' ? dflt : num(v) !== 0;
/** MDA writes local times without a zone (Dart `DateTime.now().toIso8601String()`); MDA runs
 * in India, so they're read as IST. Unreadable values fall back to the import time. */
const stamp = (v: unknown): Date | undefined => {
  const s = str(v);
  if (!s) return undefined;
  const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : `${s}+05:30`);
  return Number.isNaN(d.getTime()) ? undefined : d;
};

export async function importMda(
  db: Db,
  accountId: string,
  data: MdaImport,
): Promise<MdaImportResult> {
  const result: MdaImportResult = { imported: [], skipped: [] };
  const list = data.companies.filter((c) => str(c.company.CompCode) && str(c.company.CompName));
  if (!list.length) throw new UserError(importMessages.nothing);
  const adminPassword = await hashPassword(SEED_ADMIN.password);

  for (const { company: c, years } of list) {
    const compCode = str(c.CompCode)!;
    const compName = str(c.CompName)!;
    const [existing] = await db
      .select({ id: companies.id })
      .from(companies)
      .where(and(eq(companies.accountId, accountId), eq(companies.compCode, compCode)));
    if (existing) {
      result.skipped.push(compName);
      continue;
    }

    let count = 0;
    await db.transaction(async (raw) => {
      const tx = raw as unknown as Db;
      const [company] = await tx
        .insert(companies)
        .values({
          accountId,
          compCode,
          compName,
          mailName: str(c.MailName),
          add1: str(c.Add1),
          add2: str(c.Add2),
          city: str(c.City),
          state: str(c.State),
          stateCode: str(c.StateCode),
          country: str(c.Country) ?? 'India',
          pinCode: str(c.PinCode),
          phone: str(c.Phone),
          mobile: str(c.Mobile),
          fax: str(c.Fax),
          email: str(c.Email),
          website: str(c.Website),
          gstin: str(c.GSTIN),
          pan: str(c.PAN),
          cin: str(c.CIN),
          bankName: str(c.BankName),
          bankBranch: str(c.BankBranch),
          bankAcNo: str(c.BankAcNo),
          bankIfsc: str(c.BankIfsc),
          finYrFrom: str(c.FinYrFrom),
          booksFrom: str(c.BooksFrom),
          createdAt: stamp(c.CreatedAt),
        })
        .returning();

      for (const { year: y, book: data } of years) {
        const yearCode = str(y.YearCode);
        const yearName = str(y.YearName);
        const fromDate = parseDate(str(y.FromDate));
        const toDate = parseDate(str(y.ToDate));
        if (!yearCode || !yearName || !fromDate || !toDate) continue;

        const [book] = await tx
          .insert(books)
          .values({ companyId: company!.id, yearCode })
          .returning();
        const bookId = book!.id;
        if (data) await copyBook(tx, bookId, data);
        else await seedBook(tx, bookId, adminPassword);

        await tx
          .insert(financialYears)
          .values({ companyId: company!.id, bookId, yearCode, yearName, fromDate, toDate });
        count++;
      }
    });
    result.imported.push({ compName, years: count });
  }
  return result;
}

/** One year file's rows into its book. */
async function copyBook(db: Db, bookId: string, b: MdaBook): Promise<void> {
  const users = (b.User ?? []).filter((r) => str(r.UserCode) && str(r.UserName) && str(r.Password));
  if (users.length)
    await db.insert(bookUsers).values(
      users.map((r) => ({
        bookId,
        userCode: str(r.UserCode)!,
        userName: str(r.UserName)!,
        password: str(r.Password)!,
        role: str(r.Role) ?? 'User',
        isActive: bool(r.IsActive, true),
        mustChangePassword: bool(r.MustChangePwd, false),
        createdAt: stamp(r.CreatedAt),
      })),
    );

  const groups = (b.Maacct2 ?? []).filter((r) => str(r.GrpCode) && str(r.GrpName));
  if (groups.length)
    await db.insert(accountGroups).values(
      groups.map((r) => ({
        bookId,
        grpCode: str(r.GrpCode)!,
        grpName: str(r.GrpName)!,
        grpType: str(r.GrpType) ?? '',
        parentGrp: str(r.ParentGrp) ?? '',
        isLedger: str(r.IsLedger) ?? 'No',
        sortOrder: num(r.SortOrder),
        clr: str(r.Clr),
      })),
    );

  const accounts = (b.Maacct ?? []).filter((r) => str(r.AccCode) && str(r.AccName));
  if (accounts.length)
    await db.insert(ledgers).values(
      accounts.map((r) => ({
        bookId,
        accCode: str(r.AccCode)!,
        accName: str(r.AccName)!,
        grpCode: str(r.GrpCode) ?? '',
        opBal: num(r.OpBal).toFixed(2),
        drCr: str(r.DrCr) ?? 'Dr',
        add1: str(r.Add1),
        add2: str(r.Add2),
        city: str(r.City),
        state: str(r.State),
        stateCode: str(r.StateCode),
        pinCode: str(r.PinCode),
        phone: str(r.Phone),
        mobile: str(r.Mobile),
        email: str(r.Email),
        gstin: str(r.GSTIN),
        pan: str(r.PAN),
        creditDays: num(r.CreditDays),
        creditLimit: num(r.CreditLimit).toFixed(2),
        isActive: bool(r.IsActive, true),
        createdAt: stamp(r.CreatedAt),
      })),
    );

  const misc = (b.Misc_Master ?? []).filter((r) => str(r.Misc_Code));
  if (misc.length)
    await db.insert(miscList).values(
      misc.map((r) => ({
        bookId,
        miscCode: str(r.Misc_Code)!,
        miscName: str(r.Misc_Name) ?? '',
        miscType: str(r.Misc_Type) ?? '',
        miscPname: str(r.Misc_Pname),
        miscSname: str(r.Misc_Sname),
        miscGen1: str(r.Misc_Gen1),
        miscGen2: str(r.Misc_Gen2),
        miscGen3: str(r.Misc_Gen3),
        miscGen4: str(r.Misc_Gen4),
        miscGen5: str(r.Misc_Gen5),
        miscGen6: str(r.Misc_Gen6),
        miscDate: str(r.Misc_Date),
      })),
    );

  const items = (b.Part_Master ?? []).filter((r) => str(r.PartCode) && str(r.PartName));
  if (items.length)
    await db.insert(stockItems).values(
      items.map((r) => ({
        bookId,
        partCode: str(r.PartCode)!,
        partName: str(r.PartName)!,
        printName: str(r.PrintName),
        subGrpCode: str(r.SubGrpCode) ?? '',
        unit: str(r.Unit),
        altUnit: str(r.AltUnit),
        convFactor: String(num(r.ConvFactor)),
        regType: str(r.RegType),
        gstRate: str(r.GstRate),
        cessRate: num(r.CessRate).toFixed(2),
        hsnNo: str(r.HsnNo),
        purRate: num(r.PurRate).toFixed(2),
        saleRate: num(r.SaleRate).toFixed(2),
        mrp: num(r.Mrp).toFixed(2),
        opQty: String(num(r.OpQty)),
        opValue: num(r.OpValue).toFixed(2),
        reorderLevel: String(num(r.ReorderLevel)),
        minLevel: String(num(r.MinLevel)),
        maxLevel: String(num(r.MaxLevel)),
        barcode: str(r.Barcode),
        isActive: bool(r.IsActive, true),
        createdAt: stamp(r.CreatedAt),
      })),
    );

  const log = b.AuditLog ?? [];
  if (log.length)
    await db.insert(auditLog).values(
      log.map((r) => ({
        bookId,
        logAt: stamp(r.LogAt),
        userName: str(r.UserName),
        action: str(r.Action),
        tableName: str(r.TableName),
        recordKey: str(r.RecordKey),
        details: str(r.Details),
      })),
    );
}
