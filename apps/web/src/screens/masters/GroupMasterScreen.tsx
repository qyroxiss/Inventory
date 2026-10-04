// Group Master — MDA's "Group Master" page (group_master_page.dart), approved design
// docs/design/MASTERS-SCREENS.md (Group Master section), built the same way as M1/M2.
// Always top-level groups (ParentGrp='Parent'); Sub Group Master, built separately, handles
// the rest of this same table.

import { brand, GROUP_TYPES, LEDGER_OPTIONS, groupMessages, type GroupType } from '@qi/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useRef, useState } from 'react';
import { ApiError, api, unwrap, type OkBody } from '../../api.ts';
import { ConfirmDelete, ConfirmUpdate, Dialog, MessageDialog } from '../../components/Dialog.tsx';
import { Heading } from '../../components/ledger.tsx';

type Group = OkBody<Awaited<ReturnType<typeof api.api.groups.$get>>>[number];
type Form = { name: string; type: GroupType | ''; isLedger: 'Yes' | 'No' };

const EMPTY_FORM: Form = { name: '', type: '', isLedger: 'No' };
const BAR_BTN =
  'flex h-12 cursor-pointer items-center border-[1.5px] border-foreground px-5 text-[15px] font-semibold disabled:opacity-60 disabled:cursor-not-allowed';

export function GroupMasterScreen() {
  const queryClient = useQueryClient();
  const groups = useQuery({
    queryKey: ['groups'],
    queryFn: () => unwrap(api.api.groups.$get()),
  });

  const [form, setForm] = useState<Form>(EMPTY_FORM);
  const [errors, setErrors] = useState<Partial<Record<'name' | 'type', string>>>({});
  const [editing, setEditing] = useState<Group | null>(null);
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
  const typeRef = useRef<HTMLSelectElement>(null);
  const ledgerRef = useRef<HTMLSelectElement>(null);
  const saveRef = useRef<HTMLButtonElement>(null);
  const focusName = () => setTimeout(() => nameRef.current?.focus(), 0);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['groups'] });

  const clearForm = () => {
    setForm(EMPTY_FORM);
    setErrors({});
    setEditing(null);
    focusName();
  };

  const validate = () => {
    const e: Partial<Record<'name' | 'type', string>> = {};
    if (!form.name.trim()) e.name = groupMessages.nameRequired;
    if (!form.type) e.type = groupMessages.typeRequired;
    setErrors(e);
    if (e.name) nameRef.current?.focus();
    else if (e.type) typeRef.current?.focus();
    return !e.name && !e.type;
  };

  const failed = (err: unknown) => {
    if (err instanceof ApiError && err.status === 422 && err.body.fieldErrors?.name) {
      setErrors((e) => ({ ...e, name: err.body.fieldErrors!.name }));
      nameRef.current?.focus();
    } else {
      setMessage({
        kind: 'error',
        title: ['Group', 'Error'],
        text: err instanceof Error ? err.message : String(err),
      });
    }
  };

  async function save() {
    if (!validate()) return;
    setBusy(true);
    try {
      const g = await unwrap(
        api.api.groups.$post({
          json: { name: form.name, type: form.type || undefined, isLedger: form.isLedger },
        }),
      );
      await refresh();
      setMessage({
        kind: 'ok',
        title: ['Group', 'Saved'],
        text: groupMessages.saved(g.grpName, g.grpCode),
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
        api.api.groups[':grpCode'].$put({
          param: { grpCode: editing.grpCode },
          json: { name: form.name, type: form.type || undefined, isLedger: form.isLedger },
        }),
      );
      setEditing(g);
      await refresh();
      setMessage({
        kind: 'ok',
        title: ['Group', 'Updated'],
        text: groupMessages.updated(g.grpName),
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
      await unwrap(api.api.groups[':grpCode'].$delete({ param: { grpCode: editing.grpCode } }));
      await refresh();
      setMessage({
        kind: 'ok',
        title: ['Group', 'Removed'],
        text: groupMessages.removed(editing.grpName),
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
    if ((groups.data?.length ?? 0) === 0) {
      setMessage({ kind: 'error', title: ['Group', 'Error'], text: groupMessages.noneFound });
      return;
    }
    setListOpen(true);
  }

  const pick = (g: Group) => {
    setListOpen(false);
    setEditing(g);
    setErrors({});
    setForm({
      name: g.grpName,
      type: g.grpType as GroupType,
      isLedger: g.isLedger as 'Yes' | 'No',
    });
    focusName();
  };

  // Every group loaded here is top-level — MDA disables Update/Remove by mouse once one is
  // loaded, but Enter on Update still works (docs/LOGIC-SPEC.md Q-16). Kept exactly as is.
  const editingTopLevel = !!editing;

  return (
    <>
      <section className="ledger-paper relative flex min-h-full flex-col gap-6 border border-border pb-10 pl-[76px] pr-12 pt-8 print:hidden">
        <div aria-hidden="true" className="absolute inset-y-0 left-[46px] w-px bg-ledger-margin" />
        <div aria-hidden="true" className="absolute inset-y-0 left-[50px] w-px bg-ledger-margin" />

        <div className="flex flex-col gap-2 border-b-2 border-foreground pb-4">
          <div className="flex items-center gap-3">
            <span className="font-mono text-xs uppercase tracking-[0.12em] text-muted-foreground">
              Masters&nbsp;&nbsp;›&nbsp;&nbsp;Group Master
            </span>
            <span className="flex-1" />
            <span className="rounded-full border border-primary-text/30 bg-accent px-2.5 py-1 text-[11px] font-semibold text-primary-text">
              Accounting Master
            </span>
          </div>
          <Heading as="h1" lead="Group" tail="Master" className="text-[46px]" />
        </div>

        <div className="flex flex-col gap-6">
          <div className="flex max-w-[460px] flex-col gap-1">
            <h2 className="m-0 mb-1.5 font-mono text-xs font-medium tracking-[0.12em] text-primary-text">
              GROUP DETAILS
            </h2>

            <Row label="Group Name" required error={errors.name}>
              <input
                id="grp-name"
                ref={nameRef}
                value={form.name}
                placeholder="Enter group name"
                autoComplete="off"
                autoFocus
                onChange={(e) => {
                  setForm((f) => ({ ...f, name: e.target.value }));
                  setErrors((er) => ({ ...er, name: undefined }));
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    typeRef.current?.focus();
                  }
                }}
                className={`h-[42px] w-full rounded-none border-0 border-b-[1.5px] bg-transparent px-0.5 text-base text-foreground outline-none focus-visible:outline-none ${errors.name ? 'border-destructive' : 'border-input'}`}
              />
            </Row>

            <Row label="Group Type" required error={errors.type}>
              <select
                id="grp-type"
                ref={typeRef}
                value={form.type}
                onChange={(e) => {
                  setForm((f) => ({ ...f, type: e.target.value as GroupType }));
                  setErrors((er) => ({ ...er, type: undefined }));
                  ledgerRef.current?.focus();
                }}
                className={`h-[42px] w-full cursor-pointer rounded-none border-0 border-b-[1.5px] bg-transparent px-0.5 text-base text-foreground outline-none focus-visible:outline-none ${errors.type ? 'border-destructive' : 'border-input'}`}
              >
                <option value="" disabled>
                  Select group type
                </option>
                {GROUP_TYPES.map((t) => (
                  <option key={t} value={t} className="bg-card text-foreground">
                    {t}
                  </option>
                ))}
              </select>
            </Row>

            <Row label="Group Ledger">
              <select
                id="grp-ledger"
                ref={ledgerRef}
                value={form.isLedger}
                onChange={(e) => {
                  setForm((f) => ({ ...f, isLedger: e.target.value as 'Yes' | 'No' }));
                  saveRef.current?.focus();
                }}
                className="h-[42px] w-full cursor-pointer rounded-none border-0 border-b-[1.5px] border-input bg-transparent px-0.5 text-base text-foreground outline-none focus-visible:outline-none"
              >
                {LEDGER_OPTIONS.map((o) => (
                  <option key={o} value={o} className="bg-card text-foreground">
                    {o}
                  </option>
                ))}
              </select>
            </Row>
          </div>

          <div className="flex max-w-[640px] flex-none items-center gap-2.5 border-t-[3px] border-double border-foreground bg-background py-3.5">
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
              /* Q-16: every group here is top-level, and MDA never lets Remove reach one from
                 this screen — truly inert, mouse or keyboard, unlike Update just below. */
              <button
                type="button"
                disabled
                className={`${BAR_BTN} border-destructive text-destructive`}
              >
                Remove
              </button>
            )}
            <button
              type="button"
              ref={saveRef}
              aria-disabled={editingTopLevel ? 'true' : undefined}
              onClick={editingTopLevel ? undefined : save}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                e.preventDefault();
                if (editingTopLevel) setUpdateConfirm(true);
                else void save();
              }}
              disabled={busy}
              className={`flex h-12 min-w-[220px] cursor-pointer items-center justify-between gap-4 bg-primary px-[22px] text-[15px] font-semibold text-primary-foreground disabled:cursor-wait ${editingTopLevel ? 'opacity-60' : 'disabled:opacity-70'}`}
            >
              <span>{editing ? 'Update' : 'Save Group'}</span>
              <span aria-hidden="true" className="text-xl">
                →
              </span>
            </button>
          </div>
        </div>

        <Link
          to="/app/section/$section"
          params={{ section: 'masters' }}
          className="mt-2 flex min-h-11 items-center self-start text-sm underline underline-offset-4"
        >
          ← Masters
        </Link>
      </section>

      <SelectGroup
        open={listOpen}
        rows={groups.data ?? []}
        onPick={pick}
        onClose={() => setListOpen(false)}
      />
      <ConfirmUpdate
        open={updateConfirm}
        title={['Update', 'Group']}
        text={groupMessages.updateConfirm(form.name)}
        onCancel={() => setUpdateConfirm(false)}
        onConfirm={doUpdate}
        busy={busy}
      />
      <ConfirmDelete
        open={deleteConfirm}
        title={['Remove', 'Group']}
        text={groupMessages.deleteConfirm(editing?.grpName ?? '')}
        confirmLabel="Remove"
        onCancel={() => setDeleteConfirm(false)}
        onConfirm={doRemove}
        busy={busy}
      />
      <PrintSheet rows={groups.data ?? []} />
      <MessageDialog
        open={!!message}
        kind={message?.kind}
        title={message?.title ?? ['Group', '']}
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
    <div className="grid grid-cols-[140px_14px_minmax(0,1fr)] items-start gap-1">
      <label
        htmlFor={`grp-${label.toLowerCase().replace(/\s+/g, '-')}`}
        className="pt-3 text-sm text-muted-foreground"
      >
        {label}
        {required && <span className="text-destructive"> *</span>}
      </label>
      <span aria-hidden="true" className="pt-3 text-sm text-muted-foreground">
        :
      </span>
      <div className="flex flex-col gap-1">
        {children}
        {error && <span className="text-[13px] text-destructive">{error}</span>}
      </div>
    </div>
  );
}

/** MDA's "Group Master — N record(s)" list behind View (group_master_page.dart:1034-1203). */
function SelectGroup({
  open,
  rows,
  onPick,
  onClose,
}: {
  open: boolean;
  rows: Group[];
  onPick: (g: Group) => void;
  onClose: () => void;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const n = rows.length;
  return (
    <Dialog open={open} onClose={onClose} title={['Group', 'Master']} className="w-[640px]">
      <span className="absolute right-[26px] top-[30px] font-mono text-xs text-muted-foreground">
        {n} record{n === 1 ? '' : 's'}
      </span>
      <div className="mt-3.5 grid grid-cols-[90px_minmax(0,1fr)_110px_70px] gap-4 border-y border-border px-[26px] py-2.5 font-mono text-xs uppercase tracking-[0.08em] text-muted-foreground">
        <span>Code</span>
        <span>Group Name</span>
        <span>Type</span>
        <span>Ledger</span>
      </div>
      <div className="max-h-[50vh] overflow-y-auto">
        {rows.length === 0 && (
          <p className="m-0 px-[26px] py-4 text-sm text-muted-foreground">
            {groupMessages.noneFound}
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
            className="grid min-h-[46px] w-full cursor-pointer grid-cols-[90px_minmax(0,1fr)_110px_70px] items-center gap-4 border-b border-border px-[26px] text-left text-[15px] hover:bg-accent focus-visible:bg-accent"
          >
            <span className="font-mono text-xs text-muted-foreground">{g.grpCode}</span>
            <span className="truncate">{g.grpName}</span>
            <span className="text-sm text-muted-foreground">{g.grpType}</span>
            <span className="text-sm text-muted-foreground">{g.isLedger}</span>
          </button>
        ))}
      </div>
      <div className="flex items-center justify-between border-t border-border px-[26px] py-3">
        <span className="font-mono text-xs text-muted-foreground">
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

/** Print: the top-level groups, as MDA's Export/Print sends to the system printer. */
function PrintSheet({ rows }: { rows: Group[] }) {
  const now = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  const stamp = `${p(now.getDate())}/${p(now.getMonth() + 1)}/${now.getFullYear()}  ${p(now.getHours())}:${p(now.getMinutes())}`;
  return (
    <div className="hidden min-h-[calc(100vh-80px)] flex-col bg-white p-10 font-sans text-black print:flex">
      <div className="mb-[22px] border-b-[3px] border-double border-black px-4 pb-3.5">
        <div className="text-[18pt] font-bold">GROUP MASTER</div>
        <div className="mt-[3px] text-[12pt] text-neutral-600">{rows.length} record(s)</div>
      </div>
      <table className="w-full border-collapse text-[10pt]">
        <thead>
          <tr className="border-b-2 border-black text-left">
            <th className="py-1.5 pr-3 font-bold">Code</th>
            <th className="py-1.5 pr-3 font-bold">Group Name</th>
            <th className="py-1.5 pr-3 font-bold">Type</th>
            <th className="py-1.5 font-bold">Ledger</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((g) => (
            <tr key={g.id} className="border-b border-neutral-300">
              <td className="py-1.5 pr-3">{g.grpCode}</td>
              <td className="py-1.5 pr-3">{g.grpName}</td>
              <td className="py-1.5 pr-3">{g.grpType}</td>
              <td className="py-1.5">{g.isLedger}</td>
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
