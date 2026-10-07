// Import from MDA: copies the companies, years and books of an MDA-Inventory data folder into
// this account. The browser reads MDA's SQLite files and sends their rows as they are, with
// MDA's own column names; this file maps them onto our tables.
//
// Covered today: CompanyMaster, Company_Year, and per year User, Maacct2, Maacct, Misc_Master,
// Part_Master, VchrSeries, VchrHdr, VchrAcct, BillRef, VchrItem, StockTrn, PurcMaster,
// PurcDetail and AuditLog. The sale tables (SaleMaster/Detail) are added with Sales Invoice.
// A company whose CompCode this account already has is skipped, so importing the same folder
// twice changes nothing.

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
  billRefs,
  purchaseLines,
  purchases,
  stockTrn,
  voucherItems,
  voucherLines,
  voucherSeries,
  vouchers,
} = schema;

type Row = Record<string, unknown>;

export type MdaBook = {
  User?: Row[];
  Maacct2?: Row[];
  Maacct?: Row[];
  Misc_Master?: Row[];
  Part_Master?: Row[];
  VchrSeries?: Row[];
  VchrHdr?: Row[];
  VchrAcct?: Row[];
  BillRef?: Row[];
  VchrItem?: Row[];
  StockTrn?: Row[];
  PurcMaster?: Row[];
  PurcDetail?: Row[];
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

  const series = (b.VchrSeries ?? []).filter((r) => str(r.VchrType));
  if (series.length)
    await db.insert(voucherSeries).values(
      series.map((r) => ({
        bookId,
        vchrType: str(r.VchrType)!,
        vchrName: str(r.VchrName),
        prefix: str(r.Prefix),
        width: num(r.Width) || 3,
        lastNo: num(r.LastNo),
      })),
    );

  // Vouchers keep their numbers; MDA's integer VchrId maps to each new row's id for its lines.
  const ids = new Map<string, string>();
  for (const r of (b.VchrHdr ?? []).filter((h) => str(h.VchrNo) && str(h.VchrType))) {
    const date = parseDate(str(r.VchrDate)) ?? parseDate(str(r.CreatedAt));
    if (!date) continue;
    const [v] = await db
      .insert(vouchers)
      .values({
        bookId,
        vchrNo: str(r.VchrNo)!,
        vchrType: str(r.VchrType)!,
        vchrDate: date,
        partyCode: str(r.PartyCode),
        refNo: str(r.RefNo),
        refDate: str(r.RefDate),
        narration: str(r.Narration),
        placeOfSupply: str(r.PlaceOfSupply),
        taxableAmt: num(r.TaxableAmt).toFixed(2),
        cgstAmt: num(r.CgstAmt).toFixed(2),
        sgstAmt: num(r.SgstAmt).toFixed(2),
        igstAmt: num(r.IgstAmt).toFixed(2),
        cessAmt: num(r.CessAmt).toFixed(2),
        otherChrg: num(r.OtherChrg).toFixed(2),
        roundOff: num(r.RoundOff).toFixed(2),
        netAmount: num(r.NetAmount).toFixed(2),
        status: str(r.Status) ?? 'Active',
        createdBy: str(r.CreatedBy),
        createdAt: stamp(r.CreatedAt),
        modifiedBy: str(r.ModifiedBy),
        modifiedAt: stamp(r.ModifiedAt),
        cancelledBy: str(r.CancelledBy),
        cancelledAt: stamp(r.CancelledAt),
      })
      .onConflictDoNothing()
      .returning({ id: vouchers.id });
    if (v) ids.set(String(r.VchrId), v.id);
  }
  const acct = (b.VchrAcct ?? []).filter((r) => ids.has(String(r.VchrId)) && str(r.AccCode));
  if (acct.length)
    await db.insert(voucherLines).values(
      acct.map((r) => ({
        voucherId: ids.get(String(r.VchrId))!,
        lineNo: num(r.LineNo),
        accCode: str(r.AccCode)!,
        drAmount: num(r.DrAmount).toFixed(2),
        crAmount: num(r.CrAmount).toFixed(2),
        narration: str(r.Narration),
      })),
    );
  const refs = (b.BillRef ?? []).filter((r) => ids.has(String(r.VchrId)) && str(r.AccCode));
  if (refs.length)
    await db.insert(billRefs).values(
      refs.map((r) => ({
        voucherId: ids.get(String(r.VchrId))!,
        accCode: str(r.AccCode)!,
        billNo: str(r.BillNo) ?? '',
        refType: str(r.RefType) ?? 'New',
        billDate: str(r.BillDate),
        dueDate: str(r.DueDate),
        amount: num(r.Amount).toFixed(2),
      })),
    );

  // Item side and stock movements of the vouchers (purchases and sales alike).
  const vItems = (b.VchrItem ?? []).filter((r) => ids.has(String(r.VchrId)) && str(r.PartCode));
  if (vItems.length)
    await db.insert(voucherItems).values(
      vItems.map((r) => ({
        voucherId: ids.get(String(r.VchrId))!,
        lineNo: num(r.LineNo),
        partCode: str(r.PartCode)!,
        godownCode: str(r.GodownCode),
        qty: String(num(r.Qty)),
        unit: str(r.Unit),
        rate: num(r.Rate).toFixed(2),
        discPct: num(r.DiscPct).toFixed(2),
        discAmt: num(r.DiscAmt).toFixed(2),
        hsnNo: str(r.HsnNo),
        gstRate: num(r.GstRate).toFixed(2),
        cessRate: num(r.CessRate).toFixed(2),
        taxableAmt: num(r.TaxableAmt).toFixed(2),
        cgstAmt: num(r.CgstAmt).toFixed(2),
        sgstAmt: num(r.SgstAmt).toFixed(2),
        igstAmt: num(r.IgstAmt).toFixed(2),
        cessAmt: num(r.CessAmt).toFixed(2),
        lineTotal: num(r.LineTotal).toFixed(2),
      })),
    );
  // A stock row may stand without a voucher (MDA allows it); one pointing at a voucher that
  // wasn't brought over is left out.
  const moves = (b.StockTrn ?? []).filter(
    (r) =>
      str(r.PartCode) &&
      parseDate(str(r.TrnDate)) &&
      (r.VchrId === null || r.VchrId === undefined || ids.has(String(r.VchrId))),
  );
  if (moves.length)
    await db.insert(stockTrn).values(
      moves.map((r) => ({
        bookId,
        voucherId: r.VchrId === null || r.VchrId === undefined ? null : ids.get(String(r.VchrId))!,
        vchrType: str(r.VchrType),
        vchrNo: str(r.VchrNo),
        trnDate: parseDate(str(r.TrnDate))!,
        partCode: str(r.PartCode)!,
        godownCode: str(r.GodownCode),
        inQty: String(num(r.InQty)),
        outQty: String(num(r.OutQty)),
        rate: num(r.Rate).toFixed(2),
        value: num(r.Value).toFixed(2),
        remarks: str(r.Remarks),
      })),
    );

  // Purchase bills and their lines, joined on the bill number.
  const bills = new Map<string, string>();
  for (const r of (b.PurcMaster ?? []).filter((p) => str(p.BillNo) && str(p.SuppCode))) {
    const date = parseDate(str(r.BillDate));
    if (!date) continue;
    const vid = r.VchrId === null || r.VchrId === undefined ? null : ids.get(String(r.VchrId));
    const [p] = await db
      .insert(purchases)
      .values({
        bookId,
        billNo: str(r.BillNo)!,
        billDate: date,
        suppCode: str(r.SuppCode)!,
        suppInvNo: str(r.SuppInvNo),
        suppInvDate: str(r.SuppInvDate),
        supplyWith: str(r.SupplyWith),
        orderNo: str(r.OrderNo),
        orderDate: str(r.OrderDate),
        orderType: str(r.OrderType),
        goodsRecNo: str(r.GoodsRecNo),
        recDate: str(r.RecDate),
        transporter: str(r.Transporter),
        narration: str(r.Narration),
        isInterState: bool(r.IsInterState, false),
        totalQty: String(num(r.TotalQty)),
        subTotal: num(r.SubTotal).toFixed(2),
        discAmt: num(r.DiscAmt).toFixed(2),
        sgstAmt: num(r.SgstAmt).toFixed(2),
        cgstAmt: num(r.CgstAmt).toFixed(2),
        igstAmt: num(r.IgstAmt).toFixed(2),
        roundOff: num(r.RoundOff).toFixed(2),
        netAmount: num(r.NetAmount).toFixed(2),
        voucherId: vid ?? null,
        status: str(r.Status) ?? 'Active',
        createdBy: str(r.CreatedBy),
        createdAt: stamp(r.CreatedAt),
        modifiedBy: str(r.ModifiedBy),
        modifiedAt: stamp(r.ModifiedAt),
        cancelledBy: str(r.CancelledBy),
        cancelledAt: stamp(r.CancelledAt),
      })
      .onConflictDoNothing()
      .returning({ id: purchases.id });
    if (p) bills.set(str(r.BillNo)!, p.id);
  }
  const pLines = (b.PurcDetail ?? []).filter((r) => bills.has(String(r.BillNo)) && str(r.ItemCode));
  if (pLines.length)
    await db.insert(purchaseLines).values(
      pLines.map((r) => ({
        purchaseId: bills.get(String(r.BillNo))!,
        lineNo: num(r.LineNo),
        itemCode: str(r.ItemCode)!,
        itemName: str(r.ItemName),
        hsnNo: str(r.HsnNo),
        unit: str(r.Unit),
        location: str(r.Location),
        qty: String(num(r.Qty)),
        rate: num(r.Rate).toFixed(2),
        disP: num(r.DisP).toFixed(2),
        disA: num(r.DisA).toFixed(2),
        amount: num(r.Amount).toFixed(2),
        sgstP: num(r.SgstP).toFixed(2),
        sgstA: num(r.SgstA).toFixed(2),
        cgstP: num(r.CgstP).toFixed(2),
        cgstA: num(r.CgstA).toFixed(2),
        igstP: num(r.IgstP).toFixed(2),
        igstA: num(r.IgstA).toFixed(2),
        lineTotal: num(r.LineTotal).toFixed(2),
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
