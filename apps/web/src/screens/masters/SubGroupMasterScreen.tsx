// Sub Group Master — MDA's "Sub Group Master" page (sub_group_master_page.dart), built the same
// way as Group Master (docs/design/ACCOUNTING-MASTERS.md). Reads and writes the rest of the same
// table Group Master uses (everything with a real parent, not ParentGrp='Parent').
//
// Unlike Group Master, Update and Remove work normally here by mouse — nothing here is ever
// top-level, so Q-16's mouse-disable never applies. The one quirk kept is Q-18: re-parenting a
// sub group (changing Under Group) never changes its GrpType, even to a parent of another type.

import { brand, subGroupMessages } from '@qi/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useRef, useState } from 'react';
import { ApiError, api, unwrap, type OkBody } from '../../api.ts';
import { BackButton } from '../../components/BackButton.tsx';
import { ConfirmDelete, ConfirmUpdate, Dialog, MessageDialog } from '../../components/Dialog.tsx';
import { Heading } from '../../components/ledger.tsx';

type Group = OkBody<Awaited<ReturnType<typeof api.api.groups.$get>>>[number];
type SubGroup = OkBody<Awaited<ReturnType<(typeof api.api)['sub-groups']['$get']>>>[number];
type Form = { name: string; under: string };

const EMPTY_FORM: Form = { name: '', under: '' };
const BAR_BTN =
  'flex h-12 cursor-pointer items-center border-[1.5px] border-foreground px-5 text-[15px] font-semibold disabled:opacity-60 disabled:cursor-not-allowed';

export function SubGroupMasterScreen() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const groups = useQuery({
    queryKey: ['groups'],
    queryFn: () => unwrap(api.api.groups.$get()),
  });
  const subGroups = useQuery({
    queryKey: ['sub-groups'],
    queryFn: () => unwrap(api.api['sub-groups'].$get()),
  });

  const [form, setForm] = useState<Form>(EMPTY_FORM);
  const [errors, setErrors] = useState<Partial<Record<'name' | 'under', string>>>({});
  const [editing, setEditing] = useState<SubGroup | null>(null);
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
  const underRef = useRef<HTMLSelectElement>(null);
  const saveRef = useRef<HTMLButtonElement>(null);
  const focusName = () => setTimeout(() => nameRef.current?.focus(), 0);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['sub-groups'] });

  const clearForm = () => {
    setForm(EMPTY_FORM);
    setErrors({});
    setEditing(null);
    focusName();
  };

  const validate = () => {
    const e: Partial<Record<'name' | 'under', string>> = {};
    if (!form.name.trim()) e.name = subGroupMessages.nameRequired;
    if (!form.under) e.under = subGroupMessages.underRequired;
    setErrors(e);
    if (e.name) nameRef.current?.focus();
    else if (e.under) underRef.current?.focus();
    return !e.name && !e.under;
  };

  const failed = (err: unknown) => {
    if (err instanceof ApiError && err.status === 422 && err.body.fieldErrors?.name) {
      setErrors((e) => ({ ...e, name: err.body.fieldErrors!.name }));
      nameRef.current?.focus();
    } else {
      setMessage({
        kind: 'error',
        title: ['Sub Group', 'Error'],
        text: err instanceof Error ? err.message : String(err),
      });
    }
  };

  async function save() {
    if (!validate()) return;
    setBusy(true);
    try {
      const g = await unwrap(
        api.api['sub-groups'].$post({ json: { name: form.name, under: form.under || undefined } }),
      );
      await refresh();
      setMessage({
        kind: 'ok',
        title: ['Sub Group', 'Saved'],
        text: subGroupMessages.saved(g.grpName, g.grpCode),
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
      const g = await unwrap(
        api.api['sub-groups'][':grpCode'].$put({
          param: { grpCode: editing.grpCode },
          json: { name: form.name, under: form.under || undefined },
        }),
      );
      setEditing({ ...g, parentGrpName: editing.parentGrpName });
      await refresh();
      setMessage({
        kind: 'ok',
        title: ['Sub Group', 'Updated'],
        text: subGroupMessages.updated(g.grpName),
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
      await unwrap(
        api.api['sub-groups'][':grpCode'].$delete({ param: { grpCode: editing.grpCode } }),
      );
      await refresh();
      // MDA shows this one with its error/red colour, even though it succeeded — kept as a quirk.
      setMessage({
        kind: 'error',
        title: ['Sub Group', 'Removed'],
        text: subGroupMessages.removed(editing.grpName),
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
    if ((subGroups.data?.length ?? 0) === 0) {
      setMessage({
        kind: 'error',
        title: ['Sub Group', 'Error'],
        text: subGroupMessages.noneFound,
      });
      return;
    }
    setListOpen(true);
  }

  const pick = (g: SubGroup) => {
    setListOpen(false);
    setEditing(g);
    setErrors({});
    setForm({ name: g.grpName, under: g.parentGrp });
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
            <BackButton
              onClick={() =>
                void navigate({ to: '/app/section/$section', params: { section: 'masters' } })
              }
            />
            <span className="font-mono text-xs uppercase tracking-[0.12em] text-muted-foreground">
              Masters&nbsp;&nbsp;›&nbsp;&nbsp;Sub Group Master
            </span>
            <span className="flex-1" />
            <span className="rounded-full border border-primary-text/30 bg-accent px-2.5 py-1 text-[11px] font-semibold text-primary-text">
              Accounting Master
            </span>
          </div>
          <Heading
            as="h1"
            lead="Sub Group"
            tail="Master"
            className="text-[46px] max-md:text-[34px]"
          />
        </div>

        <div className="flex flex-col gap-6">
          <div className="flex max-w-[460px] flex-col gap-1">
            <h2 className="m-0 mb-1.5 font-mono text-xs font-medium tracking-[0.12em] text-primary-text">
              SUB GROUP DETAILS
            </h2>

            <Row label="Sub Group Name" required error={errors.name}>
              <input
                id="sgrp-name"
                ref={nameRef}
                value={form.name}
                placeholder="Enter sub group name"
                autoComplete="off"
                autoFocus
                onChange={(e) => {
                  setForm((f) => ({ ...f, name: e.target.value }));
                  setErrors((er) => ({ ...er, name: undefined }));
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    underRef.current?.focus();
                  }
                }}
                className={`h-[42px] w-full rounded-none border-0 border-b-[1.5px] bg-transparent px-0.5 text-base text-foreground outline-none focus-visible:outline-none ${errors.name ? 'border-destructive' : 'border-input'}`}
              />
            </Row>

            <Row label="Under Group" required error={errors.under}>
              <select
                id="sgrp-under"
                ref={underRef}
                value={form.under}
                onChange={(e) => {
                  setForm((f) => ({ ...f, under: e.target.value }));
                  setErrors((er) => ({ ...er, under: undefined }));
                  saveRef.current?.focus();
                }}
                className={`h-[42px] w-full cursor-pointer rounded-none border-0 border-b-[1.5px] bg-transparent px-0.5 text-base text-foreground outline-none focus-visible:outline-none ${errors.under ? 'border-destructive' : 'border-input'}`}
              >
                <option value="" disabled>
                  Type to search group...
                </option>
                {(groups.data ?? []).map((g: Group) => (
                  <option key={g.grpCode} value={g.grpCode} className="bg-card text-foreground">
                    {g.grpName}
                  </option>
                ))}
              </select>
            </Row>
          </div>

          <div className="flex max-w-[640px] flex-none items-center gap-2.5 border-t-[3px] max-sm:flex-wrap border-double border-foreground bg-background py-3.5">
            {editing && (
              <button type="button" onClick={clearForm} className={BAR_BTN}>
                Cancel
              </button>
            )}
            <button type="button" onClick={view} className={BAR_BTN}>
              View
            </button>
            <button type="button" onClick={() => window.print()} className={BAR_BTN}>
              Print
            </button>
            <span className="flex-1" />
            {editing && (
              <button
                type="button"
                onClick={() => setDeleteConfirm(true)}
                className={`${BAR_BTN} border-destructive text-destructive`}
              >
                Remove
              </button>
            )}
            <button
              type="button"
              ref={saveRef}
              onClick={() => (editing ? setUpdateConfirm(true) : void save())}
              disabled={busy}
              className="flex h-12 min-w-[220px] cursor-pointer max-sm:order-last max-sm:w-full max-sm:min-w-0 items-center justify-between gap-4 bg-primary px-[22px] text-[15px] font-semibold text-primary-foreground disabled:cursor-wait disabled:opacity-70"
            >
              <span>{editing ? 'Update' : 'Save Sub Group'}</span>
              <span aria-hidden="true" className="text-xl">
                →
              </span>
            </button>
          </div>
        </div>
      </section>

      <SelectSubGroup
        open={listOpen}
        rows={subGroups.data ?? []}
        onPick={pick}
        onClose={() => setListOpen(false)}
      />
      <ConfirmUpdate
        open={updateConfirm}
        title={['Update', 'Sub Group']}
        text={subGroupMessages.updateConfirm(form.name)}
        onCancel={() => setUpdateConfirm(false)}
        onConfirm={doUpdate}
        busy={busy}
      />
      <ConfirmDelete
        open={deleteConfirm}
        title={['Remove', 'Sub Group']}
        text={subGroupMessages.deleteConfirm(editing?.grpName ?? '')}
        confirmLabel="Remove"
        onCancel={() => setDeleteConfirm(false)}
        onConfirm={doRemove}
        busy={busy}
      />
      <PrintSheet rows={subGroups.data ?? []} />
      <MessageDialog
        open={!!message}
        kind={message?.kind}
        title={message?.title ?? ['Sub Group', '']}
        text={message?.text ?? ''}
        onClose={() => setMessage(null)}
      />
    </>
  );
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
    <div className="grid grid-cols-[140px_14px_minmax(0,1fr)] items-start gap-1 max-sm:grid-cols-1 max-sm:gap-0">
      <label
        htmlFor={`sgrp-${label.toLowerCase().replace(/\s+/g, '-')}`}
        className="pt-3 text-sm text-muted-foreground max-sm:pt-2"
      >
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

/** MDA's "Sub Group Master — N record(s)" list behind View (sub_group_master_page.dart:1079-1161). */
function SelectSubGroup({
  open,
  rows,
  onPick,
  onClose,
}: {
  open: boolean;
  rows: SubGroup[];
  onPick: (g: SubGroup) => void;
  onClose: () => void;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const n = rows.length;
  return (
    <Dialog open={open} onClose={onClose} title={['Sub Group', 'Master']} className="w-[640px]">
      <span className="absolute right-[26px] top-[30px] font-mono text-xs text-muted-foreground">
        {n} record{n === 1 ? '' : 's'}
      </span>
      <div className="mt-3.5 grid grid-cols-[90px_minmax(0,1fr)_minmax(0,1fr)] max-sm:grid-cols-[60px_minmax(0,1fr)_minmax(0,1fr)] max-sm:gap-2.5 max-sm:px-4 gap-4 border-y border-border px-[26px] py-2.5 font-mono text-xs uppercase tracking-[0.08em] text-muted-foreground">
        <span>Code</span>
        <span>Sub Group Name</span>
        <span>Under Group</span>
      </div>
      <div className="max-h-[50vh] overflow-y-auto">
        {rows.length === 0 && (
          <p className="m-0 px-[26px] py-4 text-sm text-muted-foreground">
            {subGroupMessages.noneFound}
          </p>
        )}
        {rows.map((g, k) => (
          <button
            key={g.id}
            type="button"
            autoFocus={k === 0}
            ref={(el) => {
              refs.current[k] = el;
            }}
            onClick={() => onPick(g)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                refs.current[Math.min(k + 1, n - 1)]?.focus();
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                refs.current[Math.max(k - 1, 0)]?.focus();
              } else if (e.key === 'Enter') {
                e.preventDefault();
                onPick(g);
              }
            }}
            className="grid min-h-[46px] w-full cursor-pointer grid-cols-[90px_minmax(0,1fr)_minmax(0,1fr)] max-sm:grid-cols-[60px_minmax(0,1fr)_minmax(0,1fr)] max-sm:gap-2.5 max-sm:px-4 items-center gap-4 border-b border-border px-[26px] text-left text-[15px] hover:bg-accent focus-visible:bg-accent"
          >
            <span className="font-mono text-xs text-muted-foreground">{g.grpCode}</span>
            <span className="truncate">{g.grpName}</span>
            <span className="truncate text-sm text-muted-foreground">{g.parentGrpName ?? '—'}</span>
          </button>
        ))}
      </div>
      <div className="flex items-center justify-between border-t border-border px-[26px] py-3">
        <span className="font-mono text-xs text-muted-foreground pointer-coarse:hidden">
          ↑ ↓ to navigate&nbsp;&nbsp;•&nbsp;&nbsp;Enter to
          select&nbsp;&nbsp;•&nbsp;&nbsp;Double-click row
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

/** Print: the sub groups, same style as Group Master's "GROUP MASTER" sheet. */
function PrintSheet({ rows }: { rows: SubGroup[] }) {
  const now = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  const stamp = `${p(now.getDate())}/${p(now.getMonth() + 1)}/${now.getFullYear()}  ${p(now.getHours())}:${p(now.getMinutes())}`;
  return (
    <div className="hidden min-h-[calc(100vh-80px)] flex-col bg-white p-10 font-sans text-black print:flex">
      <div className="mb-[22px] border-b-[3px] border-double border-black px-4 pb-3.5">
        <div className="text-[18pt] font-bold">SUB GROUP MASTER</div>
        <div className="mt-[3px] text-[12pt] text-neutral-600">{rows.length} record(s)</div>
      </div>
      <table className="w-full border-collapse text-[10pt]">
        <thead>
          <tr className="border-b-2 border-black text-left">
            <th className="py-1.5 pr-3 font-bold">Code</th>
            <th className="py-1.5 pr-3 font-bold">Sub Group Name</th>
            <th className="py-1.5 font-bold">Under Group</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((g) => (
            <tr key={g.id} className="border-b border-neutral-300">
              <td className="py-1.5 pr-3">{g.grpCode}</td>
              <td className="py-1.5 pr-3">{g.grpName}</td>
              <td className="py-1.5">{g.parentGrpName ?? '—'}</td>
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
