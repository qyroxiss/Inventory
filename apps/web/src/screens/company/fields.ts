// The Company Creation form, exactly as MDA lays it out (company_creation_page.dart:556-694):
// section titles, labels, hints and lists are MDA's. Keys are the API's field names.

import type { CompanyCreate } from '@qi/contract';

export type CompanyForm = Required<CompanyCreate>;
export type FieldKey = keyof CompanyForm;

/** MDA's State list (company_creation_page.dart:24-35). */
export const STATES = [
  'Not Applicable', 'Andaman & Nicobar Islands', 'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar',
  'Chandigarh', 'Chhattisgarh', 'Dadra & Nagar Haveli and Daman & Diu', 'Delhi', 'Goa', 'Gujarat', 'Haryana',
  'Himachal Pradesh', 'Jammu & Kashmir', 'Jharkhand', 'Karnataka', 'Kerala', 'Ladakh', 'Lakshadweep',
  'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Puducherry',
  'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand',
  'West Bengal',
]; // prettier-ignore
export const COUNTRIES = ['India', 'Others'];

export type Field = {
  key: FieldKey;
  label: string;
  hint?: string;
  required?: boolean;
  /** Shown in capitals; MDA upper-cases these on save. */
  upper?: boolean;
  multiline?: boolean;
  options?: string[];
};

export type Section = { title: string; fields: Field[] };

/** Read-only rows of MDA's BASE CURRENCY block. */
export const BASE_CURRENCY: [string, string][] = [
  ['Symbol', '₹'],
  ['Formal Name', 'Indian Rupees'],
  ['Symbol Suffix', 'No'],
  ['Decimal Places', '2'],
  ['In Millions', 'No'],
  ['Decimal Word', 'Paise'],
];

/**
 * Three columns, read top-to-bottom then left-to-right in MDA's own field order, so the whole
 * form fits one screen. An empty title continues the previous column's section (Company
 * Information runs on into the second column).
 */
export const COLUMNS: Section[][] = [
  [
    {
      title: 'COMPANY INFORMATION',
      fields: [
        { key: 'compName', label: 'Company Name', hint: 'Enter company name', required: true },
        { key: 'mailName', label: 'Mailing Name', hint: 'Mailing name' },
        { key: 'add1', label: 'Address', hint: 'Company address', multiline: true },
        { key: 'state', label: 'State', options: STATES },
        { key: 'country', label: 'Country', options: COUNTRIES },
        { key: 'pinCode', label: 'Pincode', hint: '000 000' },
        { key: 'phone', label: 'Telephone', hint: '+91 00000 00000' },
      ],
    },
  ],
  [
    {
      title: '',
      fields: [
        { key: 'mobile', label: 'Mobile', hint: '+91 00000 00000' },
        { key: 'fax', label: 'Fax', hint: 'Fax number' },
        { key: 'email', label: 'E-mail', hint: 'company@example.com' },
        { key: 'website', label: 'Website', hint: 'www.example.com' },
      ],
    },
    {
      title: 'STATUTORY DETAILS',
      fields: [
        { key: 'gstin', label: 'GSTIN', hint: '27AAAAA0000A1Z5', upper: true },
        { key: 'pan', label: 'PAN', hint: 'AAAAA0000A', upper: true },
        { key: 'cin', label: 'CIN', hint: 'Corporate Identity Number (optional)', upper: true },
      ],
    },
  ],
  [
    {
      title: 'BANK DETAILS (PRINTED ON INVOICES)',
      fields: [
        { key: 'bankName', label: 'Bank Name', hint: 'Bank name' },
        { key: 'bankBranch', label: 'Branch', hint: 'Branch name' },
        { key: 'bankAcNo', label: 'A/c Number', hint: 'Account number' },
        { key: 'bankIfsc', label: 'IFSC Code', hint: 'ABCD0123456', upper: true },
      ],
    },
    {
      title: 'FINANCIAL YEAR',
      fields: [
        { key: 'finYrFrom', label: 'Fin. Year From', hint: '1-Apr-26' },
        { key: 'booksFrom', label: 'Books From', hint: '1-Apr-26' },
      ],
    },
  ],
];

/** Every input in order, for Enter-to-next-field. */
export const FIELD_ORDER: FieldKey[] = COLUMNS.flat().flatMap((s) => s.fields.map((f) => f.key));

/** A cleared form (MDA _clearForm, company_creation_page.dart:155-179). */
export const EMPTY_FORM: CompanyForm = {
  compName: '', mailName: '', add1: '', state: 'Not Applicable', country: 'India', pinCode: '',
  phone: '', mobile: '', fax: '', email: '', website: '', gstin: '', pan: '', cin: '', bankName: '',
  bankBranch: '', bankAcNo: '', bankIfsc: '', finYrFrom: '1-Apr-26', booksFrom: '1-Apr-26',
}; // prettier-ignore

/** core's field keys → the form's. */
export const ERROR_KEY: Record<string, FieldKey> = { name: 'compName', gstin: 'gstin', pan: 'pan' };
