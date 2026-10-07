// Stock Item, ported from MDA-Inventory lib/stock_item_page.dart (Part_Master).

/**
 * The Unit list, hard-coded in the Stock Item page and not read from Unit Master: it differs
 * from the seeded units ("Kg" here, "Kgs" there; "Pack", "Carton", "Gross" only here)
 * (docs/LOGIC-SPEC.md Q-19). The field also takes any typed text.
 */
export const ITEM_UNITS = [
  'Nos', 'Pcs', 'Kg', 'Gm', 'Ltr', 'Ml', 'Mtr', 'Cm',
  'Box', 'Set', 'Pair', 'Roll', 'Sheet', 'Pack', 'Bag',
  'Carton', 'Dozen', 'Gross',
]; // prettier-ignore

/** "Tax Type" (stored as RegType). */
export const TAX_TYPES = ['Taxable', 'Non GST', 'Nil Rated', 'Exempt'] as const;
export const TAXABLE = 'Taxable';

/** GST Rate, shown only when the Tax Type is Taxable. The field also takes typed text. */
export const ITEM_GST_RATES = ['0%', '0.25%', '1.5%', '3%', '5%', '6%', '9%', '12%', '18%', '28%'];

export const stockItemMessages = {
  required: 'Required',
  duplicateCode: (code: string) => `Item Code "${code}" already exists.`,
  /** Verbatim, double period and all. Case-sensitive. */
  duplicateName: 'Item Name is Already Exists..',
  /** No code in this one, unlike the other masters (stock_item_page.dart:169). */
  saved: (name: string) => `Stock Item "${name}" saved`,
  updated: (name: string) => `Stock Item "${name}" updated`,
  /** MDA shows this with the error/red colour even though it is a success message. */
  removed: (name: string) => `Stock Item "${name}" removed`,
  updateConfirm: (name: string) => `Update record "${name}"?`,
  deleteConfirm: (name: string) => `Remove "${name}"?\nThis cannot be undone.`,
  noneFound: 'No stock items saved yet.',
};

export function stockItemFieldErrors(input: { code?: string; name?: string }) {
  const errors: Record<string, string> = {};
  if (!(input.code ?? '').trim()) errors.code = stockItemMessages.required;
  if (!(input.name ?? '').trim()) errors.name = stockItemMessages.required;
  return errors;
}
