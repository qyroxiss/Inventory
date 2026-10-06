// Unit Master and Godown, ported from MDA-Inventory lib/unit_master_page.dart and
// lib/godown_master_page.dart. The two MDA screens are line-for-line the same apart from the
// word "Unit"/"Godown", the Misc_Type and the code prefix, so they share one definition here.
// Both store Misc_Master rows (our misc_list). The unit seed is lib/db_service.dart:903-932;
// MDA seeds no godowns.

export const MISC_MASTERS = {
  unit: { type: 'Unit', label: 'Unit', prefix: 'UN', width: 3 },
  godown: { type: 'Godown', label: 'Godown', prefix: 'GD', width: 3 },
} as const;
export type MiscMasterKind = keyof typeof MISC_MASTERS;
export const MISC_MASTER_KINDS = Object.keys(MISC_MASTERS) as MiscMasterKind[];

/** MDA's messages for each screen, the word swapped in exactly where MDA has it. */
export const miscMasterMessages = (kind: MiscMasterKind) => {
  const label = MISC_MASTERS[kind].label;
  return {
    nameRequired: `${label} name is required`,
    /** Verbatim, double period and all (unit_master_page.dart:83). Case-sensitive match. */
    duplicateOnSave: `${label} Name Already Exists..`,
    saved: (name: string, code: string) => `${label} "${name}" saved (Code: ${code})`,
    updated: (name: string) => `${label} "${name}" updated`,
    /** MDA shows this with the error/red colour even though it is a success message. */
    removed: (name: string) => `${label} "${name}" removed`,
    updateConfirm: (name: string) => `Wants to update this record "${name}"?`,
    deleteConfirm: (name: string) =>
      `Wants to remove this record "${name}"?\nThis cannot be undone.`,
    noneFound: `No ${label.toLowerCase()}s saved yet.`,
  };
};

export function miscMasterFieldErrors(kind: MiscMasterKind, input: { name?: string }) {
  const errors: Record<string, string> = {};
  if (!(input.name ?? '').trim()) errors.name = miscMasterMessages(kind).nameRequired;
  return errors;
}

/** The 18 units every new book is seeded with: code, name, long name (Misc_Pname). */
export const DEFAULT_UNITS: [code: string, name: string, longName: string][] = [
  ['UN001', 'Nos', 'Numbers'],
  ['UN002', 'Pcs', 'Pieces'],
  ['UN003', 'Kgs', 'Kilograms'],
  ['UN004', 'Gms', 'Grams'],
  ['UN005', 'Ltr', 'Litres'],
  ['UN006', 'Ml', 'Millilitres'],
  ['UN007', 'Mtr', 'Metres'],
  ['UN008', 'Cm', 'Centimetres'],
  ['UN009', 'Sqft', 'Square Feet'],
  ['UN010', 'Sqmt', 'Square Metres'],
  ['UN011', 'Box', 'Box'],
  ['UN012', 'Dzn', 'Dozen'],
  ['UN013', 'Pair', 'Pair'],
  ['UN014', 'Set', 'Set'],
  ['UN015', 'Bag', 'Bag'],
  ['UN016', 'Bndl', 'Bundle'],
  ['UN017', 'Roll', 'Roll'],
  ['UN018', 'Sheet', 'Sheet'],
];
