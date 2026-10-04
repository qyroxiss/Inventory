// Ledger Creation — MDA's "Ledger Creation" page (ledger_creation_page.dart), the third
// Accounting Master. Creates/edits actual accounts (ledgers): customers, suppliers, cash, bank,
// expense accounts, and so on. Its Under Group list is every group AND sub group by name — not
// just top-level groups like Sub Group Master's own Under Group list.
//
// Three fields — Aadhar No., Sales Executive and Reg. Type — are shown but MDA never saves them
// (no matching column in Maacct); kept in the form for look and feel, never sent to the API.
// Unlike Group/Sub Group Master, Cancel here always navigates back to Masters (MDA's own
// `_cancel` is `Navigator.pop`), rather than just clearing the form, and it's always shown, not
// only while editing.

import {
  brand,
  COUNTRIES,
  DR_CR,
  INDIAN_STATES,
  ledgerMessages,
  MISC_TYPE_CITY,
  REG_TYPES,
  SALES_EXECUTIVES,
  type DrCr,
} from '@qi/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useRef, useState } from 'react';
import { ApiError, api, unwrap, type OkBody } from '../../api.ts';
import { BackButton } from '../../components/BackButton.tsx';
import { ConfirmDelete, ConfirmUpdate, Dialog, MessageDialog } from '../../components/Dialog.tsx';
import { Heading } from '../../components/ledger.tsx';
import { SearchSelect, type SearchOption } from '../../components/SearchSelect.tsx';

type Ledger = OkBody<Awaited<ReturnType<typeof api.api.ledgers.$get>>>[number];
type Form = {
  name: string;
  address: string;
  city: string;
  state: string;
  country: string;
  pincode: string;
  mobile: string;
  email: string;
  pan: string;
  aadhar: string;
  under: string;
  salesExec: string;
  regType: string;
  gstin: string;
  openingBalance: string;
  drCr: DrCr;
};

const EMPTY_FORM: Form = {
  name: '',
  address: '',
  city: '',
  state: '',
  country: 'India',
  pincode: '',
  mobile: '',
  email: '',
  pan: '',
  aadhar: '',
  under: '',
  salesExec: '',
  regType: 'Regular',
  gstin: '',
  openingBalance: '',
  drCr: 'Dr',
};

const BAR_BTN =
  'flex h-12 cursor-pointer items-center border-[1.5px] border-foreground px-5 text-[15px] font-semibold disabled:opacity-60 disabled:cursor-not-allowed';

export function LedgerCreationScreen() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const ledgers = useQuery({
    queryKey: ['ledgers'],
    queryFn: () => unwrap(api.api.ledgers.$get()),
  });
  const groups = useQuery({
    queryKey: ['groups', 'all'],
    queryFn: () => unwrap(api.api.groups.all.$get()),
  });
  const cities = useQuery({
    queryKey: ['misc-list', MISC_TYPE_CITY],
    queryFn: () => unwrap(api.api['misc-list'].$get({ query: { type: MISC_TYPE_CITY } })),
  });

  const [form, setForm] = useState<Form>(EMPTY_FORM);
  const [errors, setErrors] = useState<
    Partial<Record<'name' | 'city' | 'state' | 'under' | 'pincode', string>>
  >({});
  const [editing, setEditing] = useState<Ledger | null>(null);
  const [busy, setBusy] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [updateConfirm, setUpdateConfirm] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [message, setMessage] = useState<{
    kind: 'ok' | 'error';
    title: [string, string];
    text: string;
  } | null>(null);

  const nameRef = useRef<HTMLInputElement>(null);
  const pincodeRef = useRef<HTMLInputElement>(null);
  const mobileRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const panRef = useRef<HTMLInputElement>(null);
  const aadharRef = useRef<HTMLInputElement>(null);
  const gstinRef = useRef<HTMLInputElement>(null);
  const openingBalRef = useRef<HTMLInputElement>(null);
  const saveRef = useRef<HTMLButtonElement>(null);
  const focusName = () => setTimeout(() => nameRef.current?.focus(), 0);
  const focusId = (id: string) => setTimeout(() => document.getElementById(id)?.focus(), 0);

  const groupOptions: SearchOption[] = (groups.data ?? []).map((g) => ({
    value: g.grpCode,
    label: g.grpName,
  }));
  const cityOptions: SearchOption[] = (cities.data ?? []).map((c) => ({ value: c, label: c }));
  const stateOptions: SearchOption[] = INDIAN_STATES.map((s) => ({ value: s, label: s }));
  const salesExecOptions: SearchOption[] = SALES_EXECUTIVES.map((s) => ({ value: s, label: s }));

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['ledgers'] });

  /** Cancel always leaves the screen in MDA — it never just clears the form here. */
  const cancel = () =>
    void navigate({ to: '/app/section/$section', params: { section: 'masters' } });

  /** After Save/Update/Remove, MDA resets everything, including Country/Reg. Type/Dr-Cr defaults. */
  const clearForm = () => {
    setForm(EMPTY_FORM);
    setErrors({});
    setEditing(null);
    focusName();
  };

  const validate = () => {
    const e: typeof errors = {};
    if (!form.name.trim()) e.name = ledgerMessages.nameRequired;
    if (!form.city.trim()) e.city = ledgerMessages.cityRequired;
    if (!form.state.trim()) e.state = ledgerMessages.stateRequired;
    if (!form.under) e.under = ledgerMessages.underRequired;
    if (!form.pincode.trim()) e.pincode = ledgerMessages.pincodeRequired;
    else if (!/^[1-9][0-9]{5}$/.test(form.pincode.trim())) e.pincode = ledgerMessages.pincodeFormat;
    setErrors(e);
    if (e.name) nameRef.current?.focus();
    else if (e.city) focusId('ledger-city');
    else if (e.state) focusId('ledger-state');
    else if (e.pincode) pincodeRef.current?.focus();
    else if (e.under) focusId('ledger-under');
    return Object.keys(e).length === 0;
  };

  const failed = (err: unknown) => {
    if (err instanceof ApiError && err.status === 422 && err.body.fieldErrors?.name) {
      setErrors((e) => ({ ...e, name: err.body.fieldErrors!.name }));
      nameRef.current?.focus();
    } else {
      setMessage({
        kind: 'error',
        title: ['Ledger', 'Error'],
        text: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const payload = () => ({
    name: form.name,
    address: form.address || undefined,
    city: form.city || undefined,
    state: form.state || undefined,
    pincode: form.pincode || undefined,
    mobile: form.mobile || undefined,
    email: form.email || undefined,
    pan: form.pan || undefined,
    under: form.under || undefined,
    gstin: form.gstin || undefined,
    openingBalance: form.openingBalance || undefined,
    drCr: form.drCr,
  });

  async function save() {
    if (!validate()) return;
    setBusy(true);
    try {
      const l = await unwrap(api.api.ledgers.$post({ json: payload() }));
      await refresh();
      setMessage({
        kind: 'ok',
        title: ['Ledger', 'Saved'],
        text: ledgerMessages.saved(l.accName, l.accCode),
      });
      clearForm();
    } catch (err) {
      failed(err);
    }
    setBusy(false);
  }

  async function doUpdate() {
    if (!editing || !validate()) return;
    setBusy(true);
    try {
      const l = await unwrap(
        api.api.ledgers[':accCode'].$put({ param: { accCode: editing.accCode }, json: payload() }),
      );
      setEditing({ ...l, grpName: groupOptions.find((g) => g.value === l.grpCode)?.label ?? null });
      await refresh();
      setMessage({
        kind: 'ok',
        title: ['Ledger', 'Updated'],
        text: ledgerMessages.updated(l.accName),
      });
    } catch (err) {
      failed(err);
    }
    setUpdateConfirm(false);
    setBusy(false);
  }

  async function doRemove() {
    if (!editing) return;
    setBusy(true);
    try {
      await unwrap(api.api.ledgers[':accCode'].$delete({ param: { accCode: editing.accCode } }));
      await refresh();
      setMessage({
        kind: 'error',
        title: ['Ledger', 'Removed'],
        text: ledgerMessages.removed(editing.accName),
      });
      setDeleteConfirm(false);
      clearForm();
    } catch (err) {
      setDeleteConfirm(false);
      failed(err);
    }
    setBusy(false);
  }

  function view() {
    if ((ledgers.data?.length ?? 0) === 0) {
      setMessage({ kind: 'error', title: ['Ledger', 'Error'], text: ledgerMessages.noneFound });
      return;
    }
    setListOpen(true);
  }

  /** Loading a different ledger for edit leaves Aadhar/Sales Executive/Reg. Type/Country exactly
   * as they are — MDA's own `_loadForEdit` never touches them, since nothing is ever saved there. */
  const pick = (l: Ledger) => {
    setListOpen(false);
    setEditing(l);
    setErrors({});
    setForm((f) => ({
      ...f,
      name: l.accName,
      address: l.add1 ?? '',
      city: l.city ?? '',
      state: l.state ?? '',
      pincode: l.pinCode ?? '',
      mobile: l.mobile ?? '',
      email: l.email ?? '',
      pan: l.pan ?? '',
      under: l.grpCode,
      gstin: l.gstin ?? '',
      openingBalance: l.opBal,
      drCr: l.drCr as DrCr,
    }));
    focusName();
  };

  return (
    <>
      <section className="ledger-paper relative flex min-h-full flex-col gap-6 border border-border pb-8 pl-[76px] pr-12 pt-6 print:hidden max-md:px-4 max-md:pb-6 max-md:pt-4">
        <div
          aria-hidden="true"
          className="absolute inset-y-0 left-[46px] w-px bg-ledger-margin max-md:hidden"
        />
        <div
          aria-hidden="true"
          className="absolute inset-y-0 left-[50px] w-px bg-ledger-margin max-md:hidden"
        />

        <div className="flex flex-col gap-2 border-b-2 border-foreground pb-4">
          <div className="flex flex-wrap items-center gap-4 max-md:gap-x-3 max-md:gap-y-2">
            <BackButton onClick={cancel} />
            <span className="font-mono text-xs uppercase tracking-[0.12em] text-muted-foreground">
              Masters&nbsp;&nbsp;›&nbsp;&nbsp;Ledger Creation
            </span>
            <span className="flex-1" />
            <span className="rounded-full border border-primary-text/30 bg-accent px-2.5 py-1 text-[11px] font-semibold text-primary-text">
              Accounting Master
            </span>
          </div>
          <Heading
            as="h1"
            lead="Ledger"
            tail="Creation"
            className="text-[46px] max-md:text-[34px]"
          />
        </div>

        <div className="grid grid-cols-1 gap-8 max-lg:gap-1 lg:grid-cols-2">
          {/* MDA's field order, split 7 / 8 so both columns are used and nothing scrolls:
              left Name…Mobile No., right Email…GSTIN, then Opening Balance. */}
          <div className="flex max-w-[460px] flex-col gap-1">
            <Row label="Name" required error={errors.name}>
              <input
                id="ledger-name"
                ref={nameRef}
                value={form.name}
                placeholder="Ledger name"
                autoComplete="off"
                autoFocus
                onChange={(e) => {
                  setForm((f) => ({ ...f, name: e.target.value }));
                  setErrors((er) => ({ ...er, name: undefined }));
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    focusId('ledger-address');
                  }
                }}
                className={fieldClass(!!errors.name)}
              />
            </Row>

            <Row label="Address">
              <textarea
                id="ledger-address"
                value={form.address}
                placeholder="Address"
                rows={2}
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                className="w-full resize-none rounded-none border-0 border-b-[1.5px] border-input bg-transparent px-0.5 py-1.5 text-base text-foreground outline-none focus-visible:outline-none"
              />
            </Row>

            <Row label="City" required error={errors.city}>
              <SearchSelect
                id="ledger-city"
                value={form.city}
                options={cityOptions}
                placeholder="Search or type city…"
                allowNew
                error={!!errors.city}
                onCommit={(value) => {
                  setForm((f) => ({ ...f, city: value }));
                  setErrors((er) => ({ ...er, city: undefined }));
                }}
                onNext={() => focusId('ledger-state')}
              />
            </Row>

            <Row label="State" required error={errors.state}>
              <SearchSelect
                id="ledger-state"
                value={form.state}
                options={stateOptions}
                placeholder="Search state…"
                error={!!errors.state}
                onCommit={(value) => {
                  setForm((f) => ({ ...f, state: value }));
                  setErrors((er) => ({ ...er, state: undefined }));
                }}
                onNext={() => focusId('ledger-country')}
              />
            </Row>

            <Row label="Country">
              <select
                id="ledger-country"
                value={form.country}
                onChange={(e) => {
                  setForm((f) => ({ ...f, country: e.target.value }));
                  pincodeRef.current?.focus();
                }}
                className={selectClass()}
              >
                {COUNTRIES.map((c) => (
                  <option key={c} value={c} className="bg-card text-foreground">
                    {c}
                  </option>
                ))}
              </select>
            </Row>

            <Row label="Pincode" required error={errors.pincode}>
              <input
                id="ledger-pincode"
                ref={pincodeRef}
                value={form.pincode}
                placeholder="Pincode"
                inputMode="numeric"
                autoComplete="off"
                onChange={(e) => {
                  setForm((f) => ({ ...f, pincode: e.target.value }));
                  setErrors((er) => ({ ...er, pincode: undefined }));
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    mobileRef.current?.focus();
                  }
                }}
                className={fieldClass(!!errors.pincode)}
              />
            </Row>

            <Row label="Mobile No.">
              <input
                id="ledger-mobile"
                ref={mobileRef}
                value={form.mobile}
                placeholder="10-digit mobile"
                inputMode="numeric"
                autoComplete="off"
                onChange={(e) => setForm((f) => ({ ...f, mobile: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    emailRef.current?.focus();
                  }
                }}
                className={fieldClass(false)}
              />
            </Row>
          </div>

          <div className="flex max-w-[460px] flex-col gap-1">
            <Row label="Email">
              <input
                id="ledger-email"
                ref={emailRef}
                value={form.email}
                placeholder="example@email.com"
                type="email"
                autoComplete="off"
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    panRef.current?.focus();
                  }
                }}
                className={fieldClass(false)}
              />
            </Row>

            <Row label="PAN No.">
              <input
                id="ledger-pan"
                ref={panRef}
                value={form.pan}
                placeholder="ABCDE1234F"
                autoComplete="off"
                onChange={(e) => setForm((f) => ({ ...f, pan: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    aadharRef.current?.focus();
                  }
                }}
                className={fieldClass(false)}
              />
            </Row>

            <Row label="Aadhar No.">
              <input
                id="ledger-aadhar"
                ref={aadharRef}
                value={form.aadhar}
                placeholder="12-digit Aadhar"
                inputMode="numeric"
                autoComplete="off"
                onChange={(e) => setForm((f) => ({ ...f, aadhar: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    focusId('ledger-under');
                  }
                }}
                className={fieldClass(false)}
              />
            </Row>

            <Row label="Under Group" required error={errors.under}>
              <SearchSelect
                id="ledger-under"
                value={form.under}
                options={groupOptions}
                placeholder="Search group…"
                error={!!errors.under}
                onCommit={(value) => {
                  setForm((f) => ({ ...f, under: value }));
                  setErrors((er) => ({ ...er, under: undefined }));
                }}
                onNext={() => focusId('ledger-sales-exec')}
              />
            </Row>

            <Row label="Sales Executive">
              <SearchSelect
                id="ledger-sales-exec"
                value={form.salesExec}
                options={salesExecOptions}
                placeholder="Search executive…"
                onCommit={(value) => setForm((f) => ({ ...f, salesExec: value }))}
                onNext={() => focusId('ledger-reg-type')}
              />
            </Row>

            <Row label="Reg. Type">
              <select
                id="ledger-reg-type"
                value={form.regType}
                onChange={(e) => {
                  setForm((f) => ({ ...f, regType: e.target.value }));
                  gstinRef.current?.focus();
                }}
                className={selectClass()}
              >
                {REG_TYPES.map((r) => (
                  <option key={r} value={r} className="bg-card text-foreground">
                    {r}
                  </option>
                ))}
              </select>
            </Row>

            <Row label="GSTIN / UIN">
              <input
                id="ledger-gstin"
                ref={gstinRef}
                value={form.gstin}
                placeholder="22AAAAA0000A1Z5"
                autoComplete="off"
                onChange={(e) => setForm((f) => ({ ...f, gstin: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    openingBalRef.current?.focus();
                  }
                }}
                className={fieldClass(false)}
              />
            </Row>

            <Row label="Opening Balance">
              <div className="flex items-center gap-3">
                <input
                  id="ledger-opening-balance"
                  ref={openingBalRef}
                  value={form.openingBalance}
                  placeholder="0.00"
                  inputMode="decimal"
                  autoComplete="off"
                  onChange={(e) => setForm((f) => ({ ...f, openingBalance: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      saveRef.current?.focus();
                    }
                  }}
                  className={`${fieldClass(false)} min-w-0 flex-1`}
                />
                <select
                  aria-label="Dr / Cr"
                  value={form.drCr}
                  onChange={(e) => setForm((f) => ({ ...f, drCr: e.target.value as DrCr }))}
                  className={`h-[42px] w-[72px] flex-none cursor-pointer rounded-none border-[1.5px] border-input bg-transparent px-1.5 text-base font-semibold outline-none focus-visible:outline-none ${form.drCr === 'Dr' ? 'text-primary-text' : 'text-destructive'}`}
                >
                  {DR_CR.map((o) => (
                    <option key={o} value={o} className="bg-card text-foreground">
                      {o}
                    </option>
                  ))}
                </select>
              </div>
              <span className="text-[12px] text-muted-foreground">
                (on {openingBalanceFyLabel()})
              </span>
            </Row>
          </div>
        </div>

        <div className="flex flex-none items-center gap-2.5 border-t-[3px] max-sm:flex-wrap border-double border-foreground bg-background py-3.5">
          <button type="button" onClick={() => window.print()} className={BAR_BTN}>
            Print
          </button>
          <button type="button" onClick={view} className={BAR_BTN}>
            View
          </button>
          <span className="flex-1" />
          {/* Cancel always leaves the screen in MDA, and is always shown, unlike Group/Sub Group Master. */}
          <button type="button" onClick={cancel} className={BAR_BTN}>
            Cancel
          </button>
          {editing && (
            <button
              type="button"
              onClick={() => setDeleteConfirm(true)}
              className={`${BAR_BTN} border-destructive text-destructive`}
            >
              Remove Ledger
            </button>
          )}
          <button
            type="button"
            ref={saveRef}
            onClick={() => (editing ? setUpdateConfirm(true) : void save())}
            disabled={busy}
            className="flex h-12 min-w-[180px] cursor-pointer max-sm:order-last max-sm:w-full max-sm:min-w-0 items-center justify-between gap-4 bg-primary px-[22px] text-[15px] font-semibold text-primary-foreground disabled:cursor-wait disabled:opacity-70"
          >
            <span>{editing ? 'Update Ledger' : 'Save Ledger'}</span>
            <span aria-hidden="true" className="text-xl">
              →
            </span>
          </button>
        </div>
      </section>

      <SelectLedger
        open={listOpen}
        rows={ledgers.data ?? []}
        onPick={pick}
        onClose={() => setListOpen(false)}
      />
      <ConfirmUpdate
        open={updateConfirm}
        title={['Update', 'Ledger']}
        text={ledgerMessages.updateConfirm(form.name)}
        onCancel={() => setUpdateConfirm(false)}
        onConfirm={doUpdate}
        busy={busy}
      />
      <ConfirmDelete
        open={deleteConfirm}
        title={['Remove', 'Ledger']}
        text={ledgerMessages.deleteConfirm(editing?.accName ?? '')}
        confirmLabel="Remove"
        onCancel={() => setDeleteConfirm(false)}
        onConfirm={doRemove}
        busy={busy}
      />
      <PrintSheet rows={ledgers.data ?? []} />
      <MessageDialog
        open={!!message}
        kind={message?.kind}
        title={message?.title ?? ['Ledger', '']}
        text={message?.text ?? ''}
        onClose={() => setMessage(null)}
      />
    </>
  );
}

const fieldClass = (error: boolean) =>
  `h-[42px] w-full rounded-none border-0 border-b-[1.5px] bg-transparent px-0.5 text-base text-foreground outline-none focus-visible:outline-none ${error ? 'border-destructive' : 'border-input'}`;

const selectClass = () =>
  'h-[42px] w-full cursor-pointer rounded-none border-0 border-b-[1.5px] border-input bg-transparent px-0.5 text-base text-foreground outline-none focus-visible:outline-none';

/** "1-Apr-26" — MDA computes this live from today's date, independent of the open book's own
 * financial year (ledger_creation_page.dart:1288-1292), kept as is. */
function openingBalanceFyLabel(): string {
  const now = new Date();
  const fy = now.getMonth() + 1 >= 4 ? now.getFullYear() : now.getFullYear() - 1;
  return `1-Apr-${String(fy % 100).padStart(2, '0')}`;
}

function Row({
  label,
  required,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[120px_14px_minmax(0,1fr)] items-start gap-1 max-sm:grid-cols-1 max-sm:gap-0">
      <label className="pt-3 text-sm text-muted-foreground max-sm:pt-2">
        {label}
        {required && <span className="text-destructive"> *</span>}
      </label>
      <span aria-hidden="true" className="pt-3 text-sm text-muted-foreground max-sm:hidden">
        :
      </span>
      <div className="flex flex-col gap-1">
        {children}
        {error && <span className="text-[13px] text-destructive">{error}</span>}
      </div>
    </div>
  );
}

/**
 * MDA's "Ledger List — N record(s)" (ledger_creation_page.dart:1655-1824). Unlike Group/Sub
 * Group Master's own list dialogs, there is no Enter-to-select here in MDA — only ↑↓ to
 * highlight, double-click (or click then the same row again) to open, and Esc to close.
 */
function SelectLedger({
  open,
  rows,
  onPick,
  onClose,
}: {
  open: boolean;
  rows: Ledger[];
  onPick: (l: Ledger) => void;
  onClose: () => void;
}) {
  const [hi, setHi] = useState(0);
  const n = rows.length;
  return (
    <Dialog open={open} onClose={onClose} title={['Ledger', 'List']} className="w-[760px]">
      <span className="absolute right-[26px] top-[30px] font-mono text-xs text-muted-foreground">
        {n} record{n === 1 ? '' : 's'}
      </span>
      <div
        className="mt-3.5 grid grid-cols-[90px_minmax(0,1fr)_170px_90px_55px] max-sm:grid-cols-[minmax(0,1fr)_88px_32px] max-sm:gap-2.5 max-sm:px-4 gap-4 border-y border-border px-[26px] py-2.5 font-mono text-xs uppercase tracking-[0.08em] text-muted-foreground"
        tabIndex={0}
        autoFocus
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHi((h) => Math.min(h + 1, n - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHi((h) => Math.max(h - 1, 0));
          } else if (e.key === 'Escape') {
            onClose();
          }
        }}
      >
        <span className="max-sm:hidden">Code</span>
        <span>Ledger Name</span>
        <span className="max-sm:hidden">Under Group</span>
        <span>Op. Bal</span>
        <span>Dr/Cr</span>
      </div>
      <div className="max-h-[50vh] overflow-y-auto">
        {rows.length === 0 && (
          <p className="m-0 px-[26px] py-4 text-sm text-muted-foreground">
            {ledgerMessages.noneFound}
          </p>
        )}
        {rows.map((l, k) => (
          <div
            key={l.id}
            onClick={() => setHi(k)}
            onDoubleClick={() => onPick(l)}
            // Touch screens: tapping the highlighted row again stands in for the double-click.
            onPointerUp={(e) => {
              if (e.pointerType === 'touch' && k === hi) onPick(l);
            }}
            className={`grid min-h-[46px] w-full cursor-pointer grid-cols-[90px_minmax(0,1fr)_170px_90px_55px] max-sm:grid-cols-[minmax(0,1fr)_88px_32px] max-sm:gap-2.5 max-sm:px-4 items-center gap-4 border-b border-border px-[26px] text-left text-[15px] hover:bg-accent ${k === hi ? 'bg-accent' : ''}`}
          >
            <span className="font-mono text-xs text-muted-foreground max-sm:hidden">
              {l.accCode}
            </span>
            <span className="truncate">{l.accName}</span>
            <span className="truncate text-sm text-muted-foreground max-sm:hidden">
              {l.grpName ?? '—'}
            </span>
            <span className="text-sm text-muted-foreground">{Number(l.opBal).toFixed(2)}</span>
            <span className="text-sm text-muted-foreground">{l.drCr}</span>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between border-t border-border px-[26px] py-3">
        <span className="font-mono text-xs text-muted-foreground pointer-coarse:hidden">
          ↑ ↓ to navigate&nbsp;&nbsp;•&nbsp;&nbsp;Esc to close
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

/** Print: same 5 columns as the View dialog, MDA's own "Ledger Master List" title. */
function PrintSheet({ rows }: { rows: Ledger[] }) {
  const now = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  const stamp = `${p(now.getDate())}/${p(now.getMonth() + 1)}/${now.getFullYear()}  ${p(now.getHours())}:${p(now.getMinutes())}`;
  return (
    <div className="hidden min-h-[calc(100vh-80px)] flex-col bg-white p-10 font-sans text-black print:flex">
      <div className="mb-[22px] border-b-[3px] border-double border-black px-4 pb-3.5">
        <div className="text-[18pt] font-bold">Ledger Master List</div>
        <div className="mt-[3px] text-[12pt] text-neutral-600">Total Records: {rows.length}</div>
      </div>
      <table className="w-full border-collapse text-[10pt]">
        <thead>
          <tr className="border-b-2 border-black text-left">
            <th className="py-1.5 pr-3 font-bold">Code</th>
            <th className="py-1.5 pr-3 font-bold">Ledger Name</th>
            <th className="py-1.5 pr-3 font-bold">Under Group</th>
            <th className="py-1.5 pr-3 font-bold">Op. Bal</th>
            <th className="py-1.5 font-bold">Dr/Cr</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((l) => (
            <tr key={l.id} className="border-b border-neutral-300">
              <td className="py-1.5 pr-3">{l.accCode}</td>
              <td className="py-1.5 pr-3">{l.accName}</td>
              <td className="py-1.5 pr-3">{l.grpName ?? '—'}</td>
              <td className="py-1.5 pr-3">{Number(l.opBal).toFixed(2)}</td>
              <td className="py-1.5">{l.drCr}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex-1" />
      <hr className="border-neutral-300" />
      <div className="flex justify-between pt-1 text-[8pt] text-neutral-500">
        <span>Printed by {brand.appName}</span>
        <span>{stamp}</span>
      </div>
    </div>
  );
}
