// Stock Group, ported from MDA-Inventory lib/stock_group_page.dart. Stock groups are Misc_Master
// rows of type 'StockGroup': the name, GST Rate in Misc_Gen1 and HSN No. in Misc_Gen2, both free
// text as MDA stores them (e.g. "18%"). They're stored only; no item takes them as defaults
// (docs/LOGIC-SPEC.md Q-33).

export const STOCK_GROUP_TYPE = 'StockGroup';
/** `SG` + 4 digits, highest existing Stock Group code + 1 (stock_group_page.dart:96-98). */
export const STOCK_GROUP_CODE_PREFIX = 'SG';
export const STOCK_GROUP_CODE_WIDTH = 4;

export const stockGroupMessages = {
  nameRequired: 'Group name is required',
  /** Verbatim, on Save and on Update alike (stock_group_page.dart:91, 143). Case-sensitive. */
  duplicate: 'Name is Already Exists..',
  saved: (name: string, code: string) => `Stock Group "${name}" saved (Code: ${code})`,
  updated: (name: string) => `Stock Group "${name}" updated`,
  /** MDA shows this with the error/red colour even though it is a success message. */
  removed: (name: string) => `Stock Group "${name}" removed`,
  updateConfirm: (name: string) => `Update record "${name}"?`,
  deleteConfirm: (name: string) => `Remove "${name}"?\nThis cannot be undone.`,
  noneFound: 'No stock groups saved yet.',
};

export function stockGroupFieldErrors(input: { name?: string }) {
  const errors: Record<string, string> = {};
  if (!(input.name ?? '').trim()) errors.name = stockGroupMessages.nameRequired;
  return errors;
}
