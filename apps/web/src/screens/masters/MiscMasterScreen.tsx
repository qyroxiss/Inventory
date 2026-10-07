// Unit Master and Godown — MDA's "Unit Master" and "Godown Master" pages (unit_master_page.dart,
// godown_master_page.dart), which are the same screen with the word swapped. One field; Print
// and View on the left; Save, or Cancel / Update / Remove while a row is open. Unlike Group
// Master, every button works by mouse or touch, and both Update and Remove clear the form
// afterwards, as in MDA. Logic and quirks: packages/services/src/misc-masters.ts.

import { MISC_MASTERS, miscMasterMessages, type MiscMasterKind } from '@qi/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { ApiError, api, unwrap, type OkBody } from '../../api.ts';
import { ConfirmDelete, ConfirmUpdate, MessageDialog } from '../../components/Dialog.tsx';
import {
  ActionBar,
  FieldRow,
  FormBlock,
  MasterPage,
  PrintList,
  RecordList,
  inputClass,
  type Column,
} from '../../components/master.tsx';

const endpoint = api.api['misc-masters'][':kind'];
const byCode = api.api['misc-masters'][':kind'][':code'];
type Row = OkBody<Awaited<ReturnType<typeof endpoint.$get>>>[number];
type Message = { kind: 'ok' | 'error'; title: [string, string]; text: string };

export function MiscMasterScreen({ kind }: { kind: MiscMasterKind }) {
  const { label } = MISC_MASTERS[kind];
  const msg = miscMasterMessages(kind);
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
      setMessage({ kind: 'ok', title: [label, 'Saved'], text: msg.saved(u.name, u.code) });
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
      const u = await unwrap(byCode.$put({ param: { kind, code: editing.code }, json: { name } }));
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
      await unwrap(byCode.$delete({ param: { kind, code: editing.code } }));
      await refresh();
      // MDA shows this success in its error colour (unit_master_page.dart:161-164).
      setMessage({ kind: 'error', title: [label, 'Removed'], text: msg.removed(editing.name) });
      clearForm();
    } catch (err) {
      failed(err);
    }
    setRemoveConfirm(false);
    setBusy(false);
  }

  const pick = (u: Row) => {
    setListOpen(false);
    setEditing(u);
    setError('');
    setName(u.name);
    focusName();
  };

  const columns: Column<Row>[] = [
    { head: 'Code', width: '90px', cell: (r) => r.code, mono: true },
    { head: `${label} Name`, width: 'minmax(0,1fr)', cell: (r) => r.name },
  ];

  return (
    <>
      <MasterPage crumb={`${label} Master`} title={[label, 'Master']}>
        <FormBlock heading={`${label.toUpperCase()} DETAILS`}>
          <FieldRow id="master-name" label={`${label} Name`} required error={error}>
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
              className={inputClass(error)}
            />
          </FieldRow>
        </FormBlock>
        <ActionBar
          editing={!!editing}
          busy={busy}
          saveLabel={`Save ${label}`}
          actionRef={actionRef}
          onView={() => setListOpen(true)}
          onCancel={clearForm}
          onSave={() => void save()}
          onUpdate={() => validate() && setUpdateConfirm(true)}
          onRemove={() => setRemoveConfirm(true)}
        />
      </MasterPage>

      <RecordList
        title={[label, 'Master']}
        noneFound={msg.noneFound}
        hint="↑ ↓ to navigate  •  Enter to select  •  Double-click row"
        open={listOpen}
        rows={rows.data ?? []}
        rowKey={(r) => r.code}
        columns={columns}
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
      <PrintList
        title={`${label} Master List`}
        rows={rows.data ?? []}
        rowKey={(r) => r.code}
        columns={columns}
      />
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
