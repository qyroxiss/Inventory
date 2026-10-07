// Sale Type Master, ported from MDA-Inventory lib/sale_type_master_page.dart and
// lib/sale_type_service.dart. Sale types are Misc_Master rows of type 'SaleType':
//   Misc_Name  -> Sale Name   ("Job Name" in the list)
//   Misc_Pname -> Sale Prefix (upper-cased; drives the sale bill number)
//   Misc_Sname -> Sale By     ("Job Work" in the list)

export const SALE_TYPE = 'SaleType';
/** `ST` + 3 digits, highest existing Sale Type code + 1. */
export const SALE_TYPE_CODE_PREFIX = 'ST';
export const SALE_TYPE_CODE_WIDTH = 3;

/** "Sale By" choices behind the "…" button; the field stays typeable (sale_type_master_page.dart:26-28). */
export const SALE_BY_OPTIONS = ['Counter', 'Challan', 'Invoice', 'Delivery', 'Direct', 'Online'];

/** Sale Prefix: letters, digits, '-' and '/', at most 6 (sale_type_master_page.dart:267-270). */
export const SALE_PREFIX_MAX = 6;
export const cleanSalePrefix = (typed: string) =>
  typed.replace(/[^A-Za-z0-9\-/]/g, '').slice(0, SALE_PREFIX_MAX);

export const saleTypeMessages = {
  /** The form's own field messages. */
  nameRequired: 'Sale Name is required',
  saleByRequired: 'Sale By is required',
  /** The service's, with a full stop (sale_type_service.dart:58-59). */
  nameRequiredService: 'Sale Name is required.',
  saleByRequiredService: 'Sale By is required.',
  duplicate: (name: string) => `Sale Type "${name}" already exists.`,
  saved: (name: string, code: string) => `Sale Type "${name}" saved (Code: ${code})`,
  updated: (name: string) => `Sale Type "${name}" updated`,
  /** MDA shows this with the error/red colour even though it is a success message. */
  removed: (name: string) => `Sale Type "${name}" removed`,
  /** The screen's check, before asking (sale_type_master_page.dart:118). */
  inUse: (name: string, n: number) => `"${name}" is used on ${n} bill(s) and cannot be removed`,
  deleteConfirm: (name: string) => `Remove "${name}"?\nThis cannot be undone.`,
  noneFound: 'No sale types yet',
  count: (n: number) => `${n} sale type${n === 1 ? '' : 's'}`,
};

export function saleTypeFieldErrors(input: { name?: string; saleBy?: string }) {
  const errors: Record<string, string> = {};
  if (!(input.name ?? '').trim()) errors.name = saleTypeMessages.nameRequired;
  if (!(input.saleBy ?? '').trim()) errors.saleBy = saleTypeMessages.saleByRequired;
  return errors;
}
