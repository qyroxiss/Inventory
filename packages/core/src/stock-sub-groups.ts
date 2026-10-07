// Stock Sub Group, ported from MDA-Inventory lib/stock_sub_group_page.dart. Sub groups are
// Misc_Master rows of type 'StockSubGroup' whose Misc_Pname holds their Stock Group's code.

export const STOCK_SUB_GROUP_TYPE = 'StockSubGroup';
/** `SSG` + 4 digits, highest existing Stock Sub Group code + 1 (stock_sub_group_page.dart:125). */
export const STOCK_SUB_GROUP_CODE_PREFIX = 'SSG';
export const STOCK_SUB_GROUP_CODE_WIDTH = 4;

export const stockSubGroupMessages = {
  nameRequired: 'Sub group name is required',
  underRequired: 'Please select an under group',
  /** Verbatim, on Save and on Update alike. Case-sensitive. */
  duplicate: 'Name is Already Exists..',
  saved: (name: string, code: string) => `Stock Sub Group "${name}" saved (Code: ${code})`,
  updated: (name: string) => `Stock Sub Group "${name}" updated`,
  /** MDA shows this with the error/red colour even though it is a success message. */
  removed: (name: string) => `Stock Sub Group "${name}" removed`,
  updateConfirm: (name: string) => `Update record "${name}"?`,
  deleteConfirm: (name: string) => `Remove "${name}"?\nThis cannot be undone.`,
  noneFound: 'No stock sub groups saved yet.',
};

export function stockSubGroupFieldErrors(input: { name?: string; under?: string }) {
  const errors: Record<string, string> = {};
  if (!(input.name ?? '').trim()) errors.name = stockSubGroupMessages.nameRequired;
  else if (!input.under) errors.under = stockSubGroupMessages.underRequired;
  return errors;
}
