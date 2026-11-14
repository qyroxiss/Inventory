// Unit Master and Godown, ported from MDA-Inventory lib/unit_master_page.dart and
// lib/godown_master_page.dart. The two MDA screens are line-for-line the same apart from the
// word "Unit"/"Godown", the Misc_Type and the code prefix, so they share one definition here.
// Both store Misc_Master rows (our misc_list). The unit seed is lib/db_service.dart:903-932;
// MDA seeds no godowns.

import { mobileProblem } from './contact.ts';

export const MISC_MASTERS = {
  unit: { type: 'Unit', label: 'Unit', prefix: 'UN', width: 3 },
  godown: { type: 'Godown', label: 'Godown', prefix: 'GD', width: 3 },
  /** Not in MDA (its list was eight made-up names, 2026-11-14): the people a ledger is assigned
   *  to in Ledger Creation. Keeps a mobile number too (Misc_Gen1). */
  salesExec: { type: 'SalesExec', label: 'Sales Executive', prefix: 'SE', width: 3 },
} as const;
/** The kinds that keep a mobile number beside the name. */
export const MISC_MASTER_WITH_MOBILE: readonly MiscMasterKind[] = ['salesExec'];
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
    /** Not in MDA, which removed it anyway (2026-11-14). */
    inUse: (name: string, count: number) =>
      `"${name}" is used in ${count} record(s) and cannot be removed.`,
  };
};

export function miscMasterFieldErrors(
  kind: MiscMasterKind,
  input: { name?: string; mobile?: string },
) {
  const errors: Record<string, string> = {};
  if (!(input.name ?? '').trim()) errors.name = miscMasterMessages(kind).nameRequired;
  const mobile = MISC_MASTER_WITH_MOBILE.includes(kind) ? mobileProblem(input.mobile) : null;
  if (mobile) errors.mobile = mobile;
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
