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
  /** Most characters the box takes (added; MDA's boxes take any length). */
  maxLength?: number;
  /** Characters the box accepts; anything else typed or pasted is dropped. */
  allow?: RegExp;
  inputMode?: 'numeric' | 'tel';
  /** A mobile number with its country code picker. */
  mobile?: boolean;
};

export type Section = { title: string; fields: Field[] };

/** Telephone and Fax: digits, spaces, +, - and brackets. */
const LANDLINE = /[0-9+\-() ]/;
const DIGITS = /[0-9]/;
const ALNUM = /[0-9A-Za-z]/;

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
        // A landline: STD code and number (added format; see packages/core/src/contact.ts).
        {
          key: 'phone',
          label: 'Telephone',
          hint: '022 2345 6789',
          maxLength: 20,
          allow: LANDLINE,
          inputMode: 'tel',
        },
      ],
    },
  ],
  [
    {
      title: '',
      fields: [
        { key: 'mobile', label: 'Mobile', mobile: true },
        {
          key: 'fax',
          label: 'Fax',
          hint: '022 2345 6790',
          maxLength: 20,
          allow: LANDLINE,
          inputMode: 'tel',
        },
        { key: 'email', label: 'E-mail', hint: 'company@example.com' },
        { key: 'website', label: 'Website', hint: 'www.example.com' },
      ],
    },
    {
      title: 'STATUTORY DETAILS',
      fields: [
        {
          key: 'gstin',
          label: 'GSTIN',
          hint: '27AAAAA0000A1Z5',
          upper: true,
          maxLength: 15,
          allow: ALNUM,
        },
        { key: 'pan', label: 'PAN', hint: 'AAAAA0000A', upper: true, maxLength: 10, allow: ALNUM },
        {
          key: 'cin',
          label: 'CIN',
          hint: 'U12345MH2020PTC123456 (optional)',
          upper: true,
          maxLength: 21,
          allow: ALNUM,
        },
      ],
    },
  ],
  [
    {
      title: 'BANK DETAILS (PRINTED ON INVOICES)',
      fields: [
        { key: 'bankName', label: 'Bank Name', hint: 'Bank name' },
        { key: 'bankBranch', label: 'Branch', hint: 'Branch name' },
        {
          key: 'bankAcNo',
          label: 'A/c Number',
          hint: '9 to 18 digits',
          maxLength: 18,
          allow: DIGITS,
          inputMode: 'numeric',
        },
        {
          key: 'bankIfsc',
          label: 'IFSC Code',
          hint: 'SBIN0001234',
          upper: true,
          maxLength: 11,
          allow: ALNUM,
        },
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

/** core's field keys → the form's, where they differ. */
export const ERROR_KEY: Record<string, FieldKey> = { name: 'compName' };
