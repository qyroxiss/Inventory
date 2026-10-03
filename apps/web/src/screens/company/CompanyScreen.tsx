// New Company — MDA's "Company Creation" / "Company Update" page (company_creation_page.dart),
// approved design M1 (docs/design/MASTERS-SCREENS.md). Save goes back to Company & Year Setup,
// Update stays, Delete clears the form, Cancel and Back go back — all as in MDA.

import { brand, companyFieldErrors, companyMessages } from '@qi/core';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { ApiError, api, unwrap, type OkBody } from '../../api.ts';
import { AppHeader } from '../../components/AppHeader.tsx';
import { ConfirmDelete, Dialog } from '../../components/Dialog.tsx';
import { Heading } from '../../components/ledger.tsx';
import { toast } from '../../components/Toast.tsx';
import {
  BASE_CURRENCY,
  COLUMNS,
  EMPTY_FORM,
  ERROR_KEY,
  FIELD_ORDER,
  type CompanyForm,
  type Field,
  type FieldKey,
} from './fields.ts';

type Company = OkBody<Awaited<ReturnType<typeof api.api.companies.$get>>>[number];

const fromRecord = (c: Company): CompanyForm => {
  const form = { ...EMPTY_FORM };
  for (const k of Object.keys(form) as FieldKey[]) form[k] = (c[k] as string | null) ?? '';
  if (!form.state) form.state = EMPTY_FORM.state;
  if (!form.country) form.country = EMPTY_FORM.country;
  return form;
};

/** MDA shows codes longer than 12 characters cut short with "…". */
const shortCode = (code: string) => (code.length > 12 ? `${code.substring(0, 12)}…` : code);

const BAR_BTN =
  'flex h-12 cursor-pointer items-center border-[1.5px] border-foreground px-5 text-[15px] font-semibold disabled:opacity-60';

export function CompanyScreen() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<CompanyForm>(EMPTY_FORM);
  const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [editing, setEditing] = useState<Company | null>(null);
  const [busy, setBusy] = useState(false);
  const [list, setList] = useState<Company[] | null>(null);
  const [confirm, setConfirm] = useState(false);
  const refs = useRef<Partial<Record<FieldKey, HTMLElement | null>>>({});
  const focusName = () => {
    setTimeout(() => refs.current.compName?.focus(), 0);
  };

  useEffect(focusName, []);

  const set = (k: FieldKey, v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => ({ ...e, [k]: undefined }));
  };
  const next = (k: FieldKey) => refs.current[FIELD_ORDER[FIELD_ORDER.indexOf(k) + 1]!]?.focus();
  const back = () => void navigate({ to: '/' });
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ['book-index'], refetchType: 'all' });

  const clearForm = () => {
    setForm(EMPTY_FORM);
    setErrors({});
    setEditing(null);
    focusName();
  };

  /** Form validation (MDA's validators), then the server's own check. */
  const validate = () => {
    const raw = companyFieldErrors({ name: form.compName, gstin: form.gstin, pan: form.pan });
    const e: Partial<Record<FieldKey, string>> = {};
    for (const [k, msg] of Object.entries(raw)) e[ERROR_KEY[k] ?? (k as FieldKey)] = msg;
    setErrors(e);
    const first = FIELD_ORDER.find((k) => e[k]);
    if (first) refs.current[first]?.focus();
    return !first;
  };

  const failed = (err: unknown, prefix: string) => {
    if (
      err instanceof ApiError &&
      err.status === 422 &&
      Object.keys(err.body.fieldErrors ?? {}).length
    ) {
      const e: Partial<Record<FieldKey, string>> = {};
      for (const [k, msg] of Object.entries(err.body.fieldErrors ?? {}))
        e[ERROR_KEY[k] ?? (k as FieldKey)] = msg;
      setErrors(e);
    } else {
      toast(`${prefix}: ${err instanceof Error ? err.message : String(err)}`, 'error');
    }
  };

  async function save() {
    if (!validate()) return;
    setBusy(true);
    try {
      const c = await unwrap(api.api.companies.$post({ json: form }));
      await refresh();
      toast(companyMessages.saved(c.compName));
      back(); // MDA closes the page after saving
    } catch (err) {
      failed(err, 'Error saving company');
      setBusy(false);
    }
  }

  async function update() {
    if (!editing || !validate()) return;
    setBusy(true);
    try {
      const c = await unwrap(
        api.api.companies[':companyId'].$put({ param: { companyId: editing.id }, json: form }),
      );
      setEditing(c);
      await refresh();
      toast(companyMessages.updated(c.compName));
    } catch (err) {
      failed(err, 'Error updating company');
    }
    setBusy(false);
  }

  async function remove() {
    if (!editing) return;
    setBusy(true);
    try {
      await unwrap(api.api.companies[':companyId'].$delete({ param: { companyId: editing.id } }));
      await refresh();
      toast(companyMessages.deleted(editing.compName), 'ok', 2000);
      setConfirm(false);
      clearForm();
    } catch (err) {
      setConfirm(false);
      failed(err, 'Error deleting company');
    }
    setBusy(false);
  }

  async function view() {
    try {
      const rows = await unwrap(api.api.companies.$get());
      if (rows.length === 0) return toast(companyMessages.noneFound, 'error');
      setList(rows);
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error');
    }
  }

  const pick = (c: Company) => {
    setList(null);
    setEditing(c);
    setErrors({});
    setForm(fromRecord(c));
    focusName();
  };

  const word = editing ? 'Update' : 'Creation';

  return (
    <>
      <div className="flex h-app-screen min-h-[600px] flex-col print:hidden">
        <AppHeader />
        <main className="ledger-paper relative flex min-h-0 flex-1 flex-col">
          <div
            aria-hidden="true"
            className="absolute inset-y-0 left-[84px] w-px bg-ledger-margin"
          />
          <div
            aria-hidden="true"
            className="absolute inset-y-0 left-[89px] w-px bg-ledger-margin"
          />

          <div className="flex flex-none items-end justify-between gap-5 border-b-2 border-foreground pb-[18px] pl-[120px] pr-12 pt-7">
            <div className="flex flex-col gap-2">
              <span className="font-mono text-xs uppercase tracking-[0.12em] text-muted-foreground">
                Masters&nbsp;&nbsp;›&nbsp;&nbsp;Company {word}
              </span>
              <Heading as="h1" lead="Company" tail={word} className="text-[52px]" />
            </div>
            <button type="button" onClick={back} className={`${BAR_BTN} h-11 px-[18px]`}>
              ← Back
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto pb-[26px] pl-[120px] pr-12 pt-[26px]">
            <div className="grid grid-cols-[minmax(0,55fr)_minmax(0,45fr)] items-start gap-14">
              {COLUMNS.map((sections, i) => (
                <div key={i} className="flex flex-col gap-[30px]">
                  {sections.map((sec) => (
                    <FormSection
                      key={sec.title}
                      title={sec.title}
                      fields={sec.fields}
                      form={form}
                      errors={errors}
                      set={set}
                      next={next}
                      refs={refs.current}
                    />
                  ))}
                  {i === 1 && <BaseCurrency />}
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-none items-center gap-2.5 border-t-[3px] border-double border-foreground bg-background py-3.5 pl-[120px] pr-12">
            <button type="button" onClick={back} className={BAR_BTN}>
              Cancel
            </button>
            {editing && (
              <button type="button" onClick={clearForm} className={BAR_BTN}>
                New
              </button>
            )}
            <button type="button" onClick={view} className={BAR_BTN}>
              View
            </button>
            <span className="flex-1" />
            {editing && (
              <>
                <button
                  type="button"
                  onClick={() => setConfirm(true)}
                  className={`${BAR_BTN} border-destructive text-destructive`}
                >
                  Delete
                </button>
                <button type="button" onClick={() => window.print()} className={BAR_BTN}>
                  Print
                </button>
              </>
            )}
            <button
              type="button"
              onClick={editing ? update : save}
              disabled={busy}
              className="flex h-12 min-w-[220px] cursor-pointer items-center justify-between gap-4 bg-primary px-[22px] text-[15px] font-semibold text-primary-foreground disabled:cursor-wait disabled:opacity-70"
            >
              <span>{editing ? 'Update Company' : 'Save Company'}</span>
              <span aria-hidden="true" className="text-xl">
                →
              </span>
            </button>
          </div>
        </main>
      </div>

      <SelectCompany rows={list} onPick={pick} onClose={() => setList(null)} />
      <ConfirmDelete
        open={confirm}
        title={['Delete', 'Company']}
        text={companyMessages.deleteConfirm(editing?.compName ?? '')}
        onCancel={() => setConfirm(false)}
        onConfirm={remove}
        busy={busy}
      />
      <PrintSheet form={form} />
    </>
  );
}

function FormSection({
  title,
  fields,
  form,
  errors,
  set,
  next,
  refs,
}: {
  title: string;
  fields: Field[];
  form: CompanyForm;
  errors: Partial<Record<FieldKey, string>>;
  set: (k: FieldKey, v: string) => void;
  next: (k: FieldKey) => void;
  refs: Partial<Record<FieldKey, HTMLElement | null>>;
}) {
  return (
    <section className="flex flex-col gap-1">
      <h2 className="m-0 mb-1.5 font-mono text-xs font-medium tracking-[0.12em] text-primary-text">
        {title}
      </h2>
      {fields.map((f) => {
        const id = `co-${f.key}`;
        const err = errors[f.key];
        const line = `w-full rounded-none border-0 border-b-[1.5px] bg-transparent px-0.5 text-base text-foreground outline-none focus-visible:outline-none ${
          err ? 'border-destructive' : 'border-input'
        }`;
        const common = {
          id,
          value: form[f.key],
          'aria-invalid': err ? true : undefined,
          'aria-describedby': err ? `${id}-err` : undefined,
          ref: (el: HTMLElement | null) => {
            refs[f.key] = el;
          },
        };
        const enterNext = (e: React.KeyboardEvent) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            next(f.key);
          }
        };
        return (
          <div key={f.key} className="grid grid-cols-[140px_14px_minmax(0,1fr)] items-start gap-1">
            <label htmlFor={id} className="pt-3 text-sm text-muted-foreground">
              {f.label}
              {f.required && <span className="text-destructive"> *</span>}
            </label>
            <span aria-hidden="true" className="pt-3 text-sm text-muted-foreground">
              :
            </span>
            <div className="flex flex-col gap-1">
              {f.options ? (
                <select
                  {...common}
                  onChange={(e) => set(f.key, e.target.value)}
                  onKeyDown={enterNext}
                  className={`${line} h-[42px] cursor-pointer`}
                >
                  {f.options.map((o) => (
                    <option key={o} value={o} className="bg-card text-foreground">
                      {o}
                    </option>
                  ))}
                </select>
              ) : f.multiline ? (
                <textarea
                  {...common}
                  rows={2}
                  placeholder={f.hint}
                  onChange={(e) => set(f.key, e.target.value)}
                  className={`${line} resize-y pb-1.5 pt-2.5 leading-normal`}
                />
              ) : (
                <input
                  {...common}
                  placeholder={f.hint}
                  autoComplete="off"
                  onChange={(e) => set(f.key, e.target.value)}
                  onKeyDown={enterNext}
                  className={`${line} h-[42px] ${f.upper ? 'uppercase placeholder:normal-case' : ''}`}
                />
              )}
              {err && (
                <span id={`${id}-err`} className="text-[13px] text-destructive">
                  {err}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </section>
  );
}

function BaseCurrency() {
  return (
    <section className="flex flex-col gap-1">
      <h2 className="m-0 mb-1.5 font-mono text-xs font-medium tracking-[0.12em] text-primary-text">
        BASE CURRENCY
      </h2>
      {BASE_CURRENCY.map(([k, v]) => (
        <div key={k} className="grid grid-cols-[140px_14px_minmax(0,1fr)] items-center gap-1">
          <span className="text-sm text-muted-foreground">{k}</span>
          <span aria-hidden="true" className="text-sm text-muted-foreground">
            :
          </span>
          <span className="flex h-[42px] items-center border-b border-dashed border-border px-0.5 font-mono text-sm text-muted-foreground">
            {v}
          </span>
        </div>
      ))}
    </section>
  );
}

/** MDA's "Select Company" list behind View (company_creation_page.dart:930-1085). */
function SelectCompany({
  rows,
  onPick,
  onClose,
}: {
  rows: Company[] | null;
  onPick: (c: Company) => void;
  onClose: () => void;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const n = rows?.length ?? 0;
  return (
    <Dialog open={!!rows} onClose={onClose} title={['Select', 'Company']} className="w-[720px]">
      <span className="absolute right-[26px] top-[30px] font-mono text-xs text-muted-foreground">
        {n} record(s)
      </span>
      <div className="mt-3.5 grid grid-cols-[120px_minmax(0,1fr)_180px] gap-4 border-y border-border px-[26px] py-2.5 font-mono text-xs uppercase tracking-[0.08em] text-muted-foreground">
        <span>Code</span>
        <span>Company Name</span>
        <span>State</span>
      </div>
      <div className="max-h-[50vh] overflow-y-auto">
        {rows?.map((c, k) => (
          <button
            key={c.id}
            type="button"
            autoFocus={k === 0}
            ref={(el) => {
              refs.current[k] = el;
            }}
            onClick={() => onPick(c)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                refs.current[Math.min(k + 1, n - 1)]?.focus();
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                refs.current[Math.max(k - 1, 0)]?.focus();
              }
            }}
            className="grid min-h-[46px] w-full cursor-pointer grid-cols-[120px_minmax(0,1fr)_180px] items-center gap-4 border-b border-border px-[26px] text-left text-[15px] hover:bg-accent focus-visible:bg-accent"
          >
            <span className="font-mono text-xs text-muted-foreground">{shortCode(c.compCode)}</span>
            <span className="truncate">{c.compName}</span>
            <span className="text-sm text-muted-foreground">{c.state}</span>
          </button>
        ))}
      </div>
      <div className="flex items-center justify-between border-t border-border px-[26px] py-3">
        <span className="font-mono text-xs text-muted-foreground">
          ↑↓ Navigate&nbsp;&nbsp;•&nbsp;&nbsp;Enter Select&nbsp;&nbsp;•&nbsp;&nbsp;Esc Close
        </span>
        <button
          type="button"
          onClick={onClose}
          className="flex h-11 cursor-pointer items-center border-[1.5px] border-foreground px-[18px] text-sm font-semibold"
        >
          Close
        </button>
      </div>
    </Dialog>
  );
}

/** Print: MDA's "COMPANY MASTER" sheet (company_creation_page.dart:367-440), shown only when printing. */
function PrintSheet({ form }: { form: CompanyForm }) {
  const now = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  const stamp = `${p(now.getDate())}/${p(now.getMonth() + 1)}/${now.getFullYear()}  ${p(now.getHours())}:${p(now.getMinutes())}`;
  const row = (label: string, value: string) => (
    <div key={label} className="flex py-[2.5px] text-[11pt]">
      <span className="w-[120px] flex-none text-neutral-600">{label}</span>
      <span className="text-neutral-400">:&nbsp;&nbsp;</span>
      <span className="whitespace-pre-line font-bold">{value || '—'}</span>
    </div>
  );
  const heading = (t: string) => (
    <>
      <div className="text-[8pt] font-bold tracking-[0.15em]">{t}</div>
      <hr className="my-1.5 border-neutral-300" />
    </>
  );
  return (
    <div className="hidden min-h-[calc(100vh-80px)] flex-col bg-white p-10 font-sans text-black print:flex">
      <div className="mb-[22px] border-b-[3px] border-double border-black px-4 pb-3.5">
        <div className="text-[18pt] font-bold">COMPANY MASTER</div>
        <div className="mt-[3px] text-[12pt] text-neutral-600">{form.compName}</div>
      </div>
      {heading('COMPANY INFORMATION')}
      {row('Company Name', form.compName)}
      {row('Mailing Name', form.mailName)}
      {row('Address', form.add1)}
      {row('State', form.state)}
      {row('Country', form.country)}
      {row('Pincode', form.pinCode)}
      {row('Telephone', form.phone)}
      {row('Mobile', form.mobile)}
      {row('Fax', form.fax)}
      {row('E-mail', form.email)}
      {row('Website', form.website)}
      <div className="h-4" />
      {heading('FINANCIAL YEAR')}
      {row('Fin. Year From', form.finYrFrom)}
      {row('Books From', form.booksFrom)}
      <div className="flex-1" />
      <hr className="border-neutral-300" />
      <div className="flex justify-between pt-1 text-[8pt] text-neutral-500">
        <span>Printed by {brand.appName}</span>
        <span>{stamp}</span>
      </div>
    </div>
  );
}
