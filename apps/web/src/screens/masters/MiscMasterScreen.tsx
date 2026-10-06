// Unit Master and Godown — MDA's "Unit Master" and "Godown Master" pages (unit_master_page.dart,
// godown_master_page.dart), which are the same screen with the word swapped. In the layout of
// Group Master: one field; Print and View on the left; Save, or Cancel / Update / Remove while a
// row is open. Unlike Group Master, every button works by mouse or touch, and both Update and
// Remove clear the form afterwards, as in MDA. Logic and quirks: packages/services/src/misc-masters.ts.

import { MISC_MASTERS, brand, miscMasterMessages, type MiscMasterKind } from '@qi/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useRef, useState } from 'react';
import { ApiError, api, unwrap, type OkBody } from '../../api.ts';
import { BackButton } from '../../components/BackButton.tsx';
import { ConfirmDelete, ConfirmUpdate, Dialog, MessageDialog } from '../../components/Dialog.tsx';
import { Heading } from '../../components/ledger.tsx';

const endpoint = api.api['misc-masters'][':kind'];
type Row = OkBody<Awaited<ReturnType<typeof endpoint.$get>>>[number];
type Message = { kind: 'ok' | 'error'; title: [string, string]; text: string };

const BAR_BTN =
  'flex h-12 cursor-pointer items-center border-[1.5px] border-foreground px-5 text-[15px] font-semibold disabled:opacity-60 disabled:cursor-not-allowed max-sm:flex-[1_1_40%] max-sm:justify-center';
const MAIN_BTN =
  'flex h-12 min-w-[220px] cursor-pointer items-center justify-between gap-4 bg-primary px-[22px] text-[15px] font-semibold text-primary-foreground disabled:cursor-wait disabled:opacity-70 max-sm:order-last max-sm:w-full max-sm:min-w-0';

export function MiscMasterScreen({ kind }: { kind: MiscMasterKind }) {
  const { label } = MISC_MASTERS[kind];
  const msg = miscMasterMessages(kind);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const rows = useQuery({
    queryKey: ['misc-master', kind],
    queryFn: () => unwrap(endpoint.$get({ param: { kind } })),
  });

  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<Row | null>(null);
  const [busy, setBusy] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [updateConfirm, setUpdateConfirm] = useState(false);
  const [removeConfirm, setRemoveConfirm] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);

  const nameRef = useRef<HTMLInputElement>(null);
  const actionRef = useRef<HTMLButtonElement>(null);
  const focusName = () => setTimeout(() => nameRef.current?.focus(), 0);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['misc-master', kind] });

  const clearForm = () => {
    setName('');
    setError('');
    setEditing(null);
    focusName();
  };

  const validate = () => {
    const ok = !!name.trim();
    setError(ok ? '' : msg.nameRequired);
    if (!ok) nameRef.current?.focus();
    return ok;
  };

  const failed = (err: unknown) => {
    if (err instanceof ApiError && err.status === 422 && err.body.fieldErrors?.name) {
      setError(err.body.fieldErrors.name);
      nameRef.current?.focus();
    } else {
      setMessage({
        kind: 'error',
        title: [label, 'Error'],
        text: err instanceof Error ? err.message : String(err),
      });
    }
  };

  async function save() {
    if (!validate()) return;
    setBusy(true);
    try {
      const u = await unwrap(endpoint.$post({ param: { kind }, json: { name } }));
      await refresh();
      setMessage({
        kind: 'ok',
        title: [label, 'Saved'],
        text: msg.saved(u.name, u.code),
      });
      clearForm();
    } catch (err) {
      failed(err);
    }
    setBusy(false);
  }

  async function doUpdate() {
    if (!editing) return;
    setBusy(true);
    try {
      const u = await unwrap(
        api.api['misc-masters'][':kind'][':code'].$put({
          param: { kind, code: editing.code },
          json: { name },
        }),
      );
      await refresh();
      setMessage({ kind: 'ok', title: [label, 'Updated'], text: msg.updated(u.name) });
      clearForm();
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
        api.api['misc-masters'][':kind'][':code'].$delete({
          param: { kind, code: editing.code },
        }),
      );
      await refresh();
      // MDA shows this success in its error colour (unit_master_page.dart:161-164).
      setMessage({
        kind: 'error',
        title: [label, 'Removed'],
        text: msg.removed(editing.name),
      });
      clearForm();
    } catch (err) {
      failed(err);
    }
    setRemoveConfirm(false);
    setBusy(false);
  }

  const askUpdate = () => {
    if (validate()) setUpdateConfirm(true);
  };

  const pick = (u: Row) => {
    setListOpen(false);
    setEditing(u);
    setError('');
    setName(u.name);
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
              Masters&nbsp;&nbsp;›&nbsp;&nbsp;{label} Master
            </span>
            <span className="flex-1" />
            <span className="rounded-full border border-primary-text/30 bg-accent px-2.5 py-1 text-[11px] font-semibold text-primary-text">
              Inventory Master
            </span>
          </div>
          <Heading as="h1" lead={label} tail="Master" className="text-[46px] max-md:text-[34px]" />
        </div>

        <div className="flex flex-col gap-6">
          <div className="flex max-w-[460px] flex-col gap-1">
            <h2 className="m-0 mb-1.5 font-mono text-xs font-medium tracking-[0.12em] text-primary-text">
              {label.toUpperCase()} DETAILS
            </h2>
            <div className="grid grid-cols-[140px_14px_minmax(0,1fr)] items-start gap-1 max-sm:grid-cols-1 max-sm:gap-0">
              <label
                htmlFor="master-name"
                className="pt-3 text-sm text-muted-foreground max-sm:pt-2"
              >
                {label} Name<span className="text-destructive"> *</span>
              </label>
              <span aria-hidden="true" className="pt-3 text-sm text-muted-foreground max-sm:hidden">
                :
              </span>
              <div className="flex flex-col gap-1">
                <input
                  id="master-name"
                  ref={nameRef}
                  value={name}
                  placeholder={`Enter ${label.toLowerCase()} name`}
                  autoComplete="off"
                  autoFocus
                  onChange={(e) => {
                    setName(e.target.value);
                    setError('');
                  }}
                  // Enter moves to Save, or to Update while a row is open (MDA).
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      actionRef.current?.focus();
                    }
                  }}
                  className={`h-[42px] w-full field-box px-3 text-base text-foreground outline-none focus-visible:outline-none ${error ? 'field-error' : ''}`}
                />
                {error && <span className="text-[13px] text-destructive">{error}</span>}
              </div>
            </div>
          </div>

          <div className="flex max-w-[640px] flex-none items-center gap-2.5 border-t-[3px] border-double border-foreground bg-background py-3.5 max-sm:flex-wrap">
            <button type="button" onClick={() => window.print()} className={BAR_BTN}>
              Print
            </button>
            <button type="button" onClick={() => setListOpen(true)} className={BAR_BTN}>
              View
            </button>
            <span className="flex-1 max-sm:hidden" />
            {editing ? (
              <>
                <button type="button" onClick={clearForm} className={BAR_BTN}>
                  Cancel
                </button>
                <button
                  type="button"
                  ref={actionRef}
                  onClick={askUpdate}
                  disabled={busy}
                  className={MAIN_BTN}
                >
                  <span>Update</span>
                  <span aria-hidden="true" className="text-xl">
                    →
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setRemoveConfirm(true)}
                  className={`${BAR_BTN} border-destructive text-destructive`}
                >
                  Remove
                </button>
              </>
            ) : (
              <button
                type="button"
                ref={actionRef}
                onClick={() => void save()}
                disabled={busy}
                className={MAIN_BTN}
              >
                <span>Save {label}</span>
                <span aria-hidden="true" className="text-xl">
                  →
                </span>
              </button>
            )}
          </div>
        </div>
      </section>

      <List
        label={label}
        noneFound={msg.noneFound}
        open={listOpen}
        rows={rows.data ?? []}
        onPick={pick}
        onClose={() => setListOpen(false)}
      />
      <ConfirmUpdate
        open={updateConfirm}
        title={['Update', label]}
        text={msg.updateConfirm(name.trim())}
        onCancel={() => setUpdateConfirm(false)}
        onConfirm={doUpdate}
        busy={busy}
      />
      <ConfirmDelete
        open={removeConfirm}
        title={['Remove', label]}
        text={msg.deleteConfirm(editing?.name ?? '')}
        confirmLabel="Remove"
        onCancel={() => setRemoveConfirm(false)}
        onConfirm={doRemove}
        busy={busy}
      />
      <PrintSheet label={label} rows={rows.data ?? []} />
      <MessageDialog
        open={!!message}
        kind={message?.kind}
        title={message?.title ?? [label, '']}
        text={message?.text ?? ''}
        onClose={() => setMessage(null)}
      />
    </>
  );
}

/**
 * MDA's "<Label> Master — N record(s)" list behind View (unit_master_page.dart:832-993). Nothing
 * is highlighted at first; ↑ ↓ highlight, Enter or a double-click opens the highlighted row,
 * Esc closes. On touch screens, tapping the highlighted row again stands in for the double-click.
 */
function List({
  label,
  noneFound,
  open,
  rows,
  onPick,
  onClose,
}: {
  label: string;
  noneFound: string;
  open: boolean;
  rows: Row[];
  onPick: (u: Row) => void;
  onClose: () => void;
}) {
  const [hi, setHi] = useState<number | null>(null);
  const n = rows.length;
  const close = () => {
    setHi(null);
    onClose();
  };
  const choose = (u: Row) => {
    setHi(null);
    onPick(u);
  };
  return (
    <Dialog open={open} onClose={close} title={[label, 'Master']} className="w-[560px]">
      <span className="absolute right-[26px] top-[30px] font-mono text-xs text-muted-foreground">
        {n} record{n === 1 ? '' : 's'}
      </span>
      <div
        className="mt-3.5 grid grid-cols-[90px_minmax(0,1fr)] gap-4 border-y border-border px-[26px] py-2.5 font-mono text-xs uppercase tracking-[0.08em] text-muted-foreground outline-none max-sm:px-4"
        tabIndex={0}
        autoFocus
        onKeyDown={(e) => {
          if (!n) return;
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHi((h) => Math.min((h ?? -1) + 1, n - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHi((h) => Math.max((h ?? n) - 1, 0));
          } else if (e.key === 'Enter' && hi !== null) {
            e.preventDefault();
            choose(rows[hi]!);
          }
        }}
      >
        <span>Code</span>
        <span>{label} Name</span>
      </div>
      <div className="max-h-[50vh] overflow-y-auto">
        {n === 0 && <p className="m-0 px-[26px] py-4 text-sm text-muted-foreground">{noneFound}</p>}
        {rows.map((u, k) => (
          <div
            key={u.code}
            ref={(el) => {
              if (k === hi) el?.scrollIntoView({ block: 'nearest' });
            }}
            onClick={() => setHi(k)}
            onDoubleClick={() => choose(u)}
            onPointerUp={(e) => {
              if (e.pointerType === 'touch' && k === hi) choose(u);
            }}
            className={`grid min-h-[46px] w-full cursor-pointer grid-cols-[90px_minmax(0,1fr)] items-center gap-4 border-b border-border px-[26px] text-left text-[15px] hover:bg-accent max-sm:px-4 ${k === hi ? 'bg-accent font-semibold' : ''}`}
          >
            <span className="font-mono text-xs text-muted-foreground">{u.code}</span>
            <span className="truncate">{u.name}</span>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between border-t border-border px-[26px] py-3 max-sm:px-4">
        <span className="font-mono text-xs text-muted-foreground pointer-coarse:hidden">
          ↑ ↓ to navigate&nbsp;&nbsp;•&nbsp;&nbsp;Enter to
          select&nbsp;&nbsp;•&nbsp;&nbsp;Double-click row
        </span>
        <button
          type="button"
          onClick={close}
          className="flex h-11 cursor-pointer items-center border-[1.5px] border-foreground px-[18px] text-sm font-semibold"
        >
          Close
        </button>
      </div>
    </Dialog>
  );
}

/** Print: MDA's "<Label> Master List" with "Total Records: N" and Code · <Label> Name. */
function PrintSheet({ label, rows }: { label: string; rows: Row[] }) {
  const now = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  const stamp = `${p(now.getDate())}/${p(now.getMonth() + 1)}/${now.getFullYear()}  ${p(now.getHours())}:${p(now.getMinutes())}`;
  return (
    <div className="hidden min-h-[calc(100vh-80px)] flex-col bg-white p-10 font-sans text-black print:flex">
      <div className="mb-[22px] px-4 pb-3.5">
        <div className="text-[18pt] font-bold">{label} Master List</div>
        <div className="mt-1.5 text-[11pt]">Total Records: {rows.length}</div>
      </div>
      <table className="w-full border-collapse text-[10pt]">
        <thead>
          <tr className="border-b-2 border-black bg-neutral-200 text-left">
            <th className="w-[110px] px-2 py-1.5 font-bold">Code</th>
            <th className="px-2 py-1.5 font-bold">{label} Name</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((u) => (
            <tr key={u.code} className="border-b border-neutral-300">
              <td className="px-2 py-1.5">{u.code}</td>
              <td className="px-2 py-1.5">{u.name}</td>
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
