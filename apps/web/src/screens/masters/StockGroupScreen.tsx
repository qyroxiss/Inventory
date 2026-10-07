// Stock Group — MDA's "Stock Group" page (stock_group_page.dart). Three fields: Group Name,
// GST Rate and HSN No.; Enter moves down through them and then to Save Group (or Update).
// Buttons as in Unit Master. Logic and quirks: packages/services/src/stock-groups.ts.

import { stockGroupMessages as msg } from '@qi/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState, type KeyboardEvent, type RefObject } from 'react';
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

type Group = OkBody<Awaited<ReturnType<(typeof api.api)['stock-groups']['$get']>>>[number];
type Form = { name: string; gstRate: string; hsn: string };
type Message = { kind: 'ok' | 'error'; title: [string, string]; text: string };

const EMPTY: Form = { name: '', gstRate: '', hsn: '' };
const TITLE = 'Stock Group';

const columns: Column<Group>[] = [
  { head: 'Code', width: '90px', cell: (g) => g.code, mono: true },
  { head: 'Group Name', width: 'minmax(0,1fr)', cell: (g) => g.name },
  { head: 'GST Rate', width: '100px', cell: (g) => g.gstRate },
  { head: 'HSN No.', width: '140px', cell: (g) => g.hsn, wide: true },
];

export function StockGroupScreen() {
  const queryClient = useQueryClient();
  const groups = useQuery({
    queryKey: ['stock-groups'],
    queryFn: () => unwrap(api.api['stock-groups'].$get()),
  });

  const [form, setForm] = useState<Form>(EMPTY);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<Group | null>(null);
  const [busy, setBusy] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [updateConfirm, setUpdateConfirm] = useState(false);
  const [removeConfirm, setRemoveConfirm] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);

  const nameRef = useRef<HTMLInputElement>(null);
  const gstRef = useRef<HTMLInputElement>(null);
  const hsnRef = useRef<HTMLInputElement>(null);
  const actionRef = useRef<HTMLButtonElement>(null);
  const focusName = () => setTimeout(() => nameRef.current?.focus(), 0);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['stock-groups'] });

  /** Enter moves to the next field, as MDA's onSubmitted does. */
  const enterTo = (next: RefObject<HTMLElement | null>) => (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      next.current?.focus();
    }
  };

  const clearForm = () => {
    setForm(EMPTY);
    setError('');
    setEditing(null);
    focusName();
  };

  const validate = () => {
    const ok = !!form.name.trim();
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
        title: [TITLE, 'Error'],
        text: err instanceof Error ? err.message : String(err),
      });
    }
  };

  async function save() {
    if (!validate()) return;
    setBusy(true);
    try {
      const g = await unwrap(api.api['stock-groups'].$post({ json: form }));
      await refresh();
      setMessage({ kind: 'ok', title: [TITLE, 'Saved'], text: msg.saved(g.name, g.code) });
      clearForm();
    } catch (err) {
      failed(err);
    }
    setBusy(false);
  }

  // MDA asks first, then checks the name (stock_group_page.dart:124-148).
  async function doUpdate() {
    if (!editing) return;
    setBusy(true);
    try {
      const g = await unwrap(
        api.api['stock-groups'][':code'].$put({ param: { code: editing.code }, json: form }),
      );
      await refresh();
      setMessage({ kind: 'ok', title: [TITLE, 'Updated'], text: msg.updated(g.name) });
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
      await unwrap(api.api['stock-groups'][':code'].$delete({ param: { code: editing.code } }));
      await refresh();
      // MDA shows this success in its error colour (stock_group_page.dart:182-185).
      setMessage({ kind: 'error', title: [TITLE, 'Removed'], text: msg.removed(editing.name) });
      clearForm();
    } catch (err) {
      failed(err);
    }
    setRemoveConfirm(false);
    setBusy(false);
  }

  const pick = (g: Group) => {
    setListOpen(false);
    setEditing(g);
    setError('');
    setForm({ name: g.name, gstRate: g.gstRate, hsn: g.hsn });
    focusName();
  };

  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    if (k === 'name') setError('');
  };

  return (
    <>
      <MasterPage crumb={TITLE} title={['Stock', 'Group']}>
        <FormBlock heading="STOCK GROUP DETAILS">
          <FieldRow id="sg-name" label="Group Name" required error={error}>
            <input
              id="sg-name"
              ref={nameRef}
              value={form.name}
              placeholder="Enter stock group name"
              autoComplete="off"
              autoFocus
              onChange={set('name')}
              onKeyDown={enterTo(gstRef)}
              className={inputClass(error)}
            />
          </FieldRow>
          <FieldRow id="sg-gst" label="GST Rate">
            <input
              id="sg-gst"
              ref={gstRef}
              value={form.gstRate}
              placeholder="e.g. 18%"
              inputMode="decimal"
              autoComplete="off"
              onChange={set('gstRate')}
              onKeyDown={enterTo(hsnRef)}
              className={inputClass()}
            />
          </FieldRow>
          <FieldRow id="sg-hsn" label="HSN No.">
            <input
              id="sg-hsn"
              ref={hsnRef}
              value={form.hsn}
              placeholder="HSN / SAC code"
              autoComplete="off"
              onChange={set('hsn')}
              // Enter moves to Save Group, or to Update while a group is open (MDA).
              onKeyDown={enterTo(actionRef)}
              className={inputClass()}
            />
          </FieldRow>
        </FormBlock>
        <ActionBar
          editing={!!editing}
          busy={busy}
          saveLabel="Save Group"
          actionRef={actionRef}
          onView={() => setListOpen(true)}
          onCancel={clearForm}
          onSave={() => void save()}
          onUpdate={() => validate() && setUpdateConfirm(true)}
          onRemove={() => setRemoveConfirm(true)}
        />
      </MasterPage>

      <RecordList
        title={['Stock', 'Group']}
        noneFound={msg.noneFound}
        hint="↑ ↓ to navigate  •  Enter to select  •  Double-click row  •  Esc to close"
        open={listOpen}
        rows={groups.data ?? []}
        rowKey={(g) => g.code}
        columns={columns}
        onPick={pick}
        onClose={() => setListOpen(false)}
      />
      <ConfirmUpdate
        open={updateConfirm}
        title={['Update', TITLE]}
        text={msg.updateConfirm(form.name.trim())}
        onCancel={() => setUpdateConfirm(false)}
        onConfirm={doUpdate}
        busy={busy}
      />
      <ConfirmDelete
        open={removeConfirm}
        title={['Remove', TITLE]}
        text={msg.deleteConfirm(editing?.name ?? '')}
        confirmLabel="Remove"
        onCancel={() => setRemoveConfirm(false)}
        onConfirm={doRemove}
        busy={busy}
      />
      <PrintList
        title="Stock Group List"
        rows={groups.data ?? []}
        rowKey={(g) => g.code}
        columns={columns}
      />
      <MessageDialog
        open={!!message}
        kind={message?.kind}
        title={message?.title ?? [TITLE, '']}
        text={message?.text ?? ''}
        onClose={() => setMessage(null)}
      />
    </>
  );
}
