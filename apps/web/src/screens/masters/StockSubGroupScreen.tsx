// Stock Sub Group — MDA's "Stock Sub Group" page (stock_sub_group_page.dart). Sub Group Name and
// Under (a type-to-search list of stock groups); Enter moves from the name to Under, and picking
// a group moves on to Save Sub Group (or Update). Buttons as in Stock Group.
// Logic and quirks: packages/services/src/stock-sub-groups.ts.

import { stockSubGroupMessages as msg } from '@qi/core';
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
import { SearchSelect } from '../../components/SearchSelect.tsx';

type SubGroup = OkBody<Awaited<ReturnType<(typeof api.api)['stock-sub-groups']['$get']>>>[number];
type Errors = { name?: string; under?: string };
type Message = { kind: 'ok' | 'error'; title: [string, string]; text: string };

const TITLE = 'Stock Sub Group';

const columns: Column<SubGroup>[] = [
  { head: 'Code', width: '90px', cell: (g) => g.code, mono: true },
  { head: 'Sub Group Name', width: 'minmax(0,1fr)', cell: (g) => g.name },
  { head: 'Under Group', width: 'minmax(0,0.8fr)', cell: (g) => g.underName },
];

export function StockSubGroupScreen() {
  const queryClient = useQueryClient();
  const subGroups = useQuery({
    queryKey: ['stock-sub-groups'],
    queryFn: () => unwrap(api.api['stock-sub-groups'].$get()),
  });
  const groups = useQuery({
    queryKey: ['stock-groups'],
    queryFn: () => unwrap(api.api['stock-groups'].$get()),
  });
  const groupOptions = (groups.data ?? []).map((g) => ({ value: g.code, label: g.name }));

  const [name, setName] = useState('');
  const [under, setUnder] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [editing, setEditing] = useState<SubGroup | null>(null);
  const [busy, setBusy] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [updateConfirm, setUpdateConfirm] = useState(false);
  const [removeConfirm, setRemoveConfirm] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);

  const nameRef = useRef<HTMLInputElement>(null);
  const actionRef = useRef<HTMLButtonElement>(null);
  const focusName = () => setTimeout(() => nameRef.current?.focus(), 0);
  const focusUnder = () => document.getElementById('ssg-under')?.focus();
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['stock-sub-groups'] });

  const clearForm = () => {
    setName('');
    setUnder('');
    setErrors({});
    setEditing(null);
    focusName();
  };

  /** MDA checks the name first; Under only once the name is there. */
  const validate = () => {
    if (!name.trim()) {
      setErrors({ name: msg.nameRequired });
      nameRef.current?.focus();
      return false;
    }
    if (!under) {
      setErrors({ under: msg.underRequired });
      focusUnder();
      return false;
    }
    setErrors({});
    return true;
  };

  const failed = (err: unknown) => {
    if (err instanceof ApiError && err.status === 422 && err.body.fieldErrors?.name) {
      setErrors({ name: err.body.fieldErrors.name });
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
      const g = await unwrap(api.api['stock-sub-groups'].$post({ json: { name, under } }));
      await refresh();
      setMessage({ kind: 'ok', title: [TITLE, 'Saved'], text: msg.saved(g.name, g.code) });
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
      const g = await unwrap(
        api.api['stock-sub-groups'][':code'].$put({
          param: { code: editing.code },
          json: { name, under },
        }),
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
      await unwrap(api.api['stock-sub-groups'][':code'].$delete({ param: { code: editing.code } }));
      await refresh();
      // MDA shows this success in its error colour (stock_sub_group_page.dart:198).
      setMessage({ kind: 'error', title: [TITLE, 'Removed'], text: msg.removed(editing.name) });
      clearForm();
    } catch (err) {
      failed(err);
    }
    setRemoveConfirm(false);
    setBusy(false);
  }

  const pick = (g: SubGroup) => {
    setListOpen(false);
    setEditing(g);
    setErrors({});
    setName(g.name);
    setUnder(g.under);
    focusName();
  };

  return (
    <>
      <MasterPage crumb={TITLE} title={['Stock Sub', 'Group']}>
        <FormBlock heading="STOCK SUB GROUP DETAILS">
          <FieldRow id="ssg-name" label="Sub Group Name" required error={errors.name}>
            <input
              id="ssg-name"
              ref={nameRef}
              value={name}
              placeholder="Enter stock sub group name"
              autoComplete="off"
              autoFocus
              onChange={(e) => {
                setName(e.target.value);
                setErrors({});
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  focusUnder();
                }
              }}
              className={inputClass(errors.name)}
            />
          </FieldRow>
          <FieldRow id="ssg-under" label="Under" required error={errors.under}>
            <SearchSelect
              id="ssg-under"
              value={under}
              options={groupOptions}
              placeholder="Type to search group…"
              error={!!errors.under}
              onCommit={(code) => {
                setUnder(code);
                if (code) setErrors({});
              }}
              // Picking a group moves to Save Sub Group, or to Update while editing (MDA).
              onNext={() => actionRef.current?.focus()}
            />
          </FieldRow>
        </FormBlock>
        <ActionBar
          editing={!!editing}
          busy={busy}
          saveLabel="Save Sub Group"
          actionRef={actionRef}
          onView={() => setListOpen(true)}
          onCancel={clearForm}
          onSave={() => void save()}
          onUpdate={() => validate() && setUpdateConfirm(true)}
          onRemove={() => setRemoveConfirm(true)}
        />
      </MasterPage>

      <RecordList
        title={['Stock Sub', 'Group']}
        noneFound={msg.noneFound}
        hint="↑ ↓ to navigate  •  Enter to select  •  Double-click row  •  Esc to close"
        open={listOpen}
        rows={subGroups.data ?? []}
        rowKey={(g) => g.code}
        columns={columns}
        onPick={pick}
        onClose={() => setListOpen(false)}
      />
      <ConfirmUpdate
        open={updateConfirm}
        title={['Update', TITLE]}
        text={msg.updateConfirm(name.trim())}
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
        title="Stock Sub Group List"
        rows={subGroups.data ?? []}
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
