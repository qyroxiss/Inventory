// Stock Item — MDA's "Stock Item" page (stock_item_page.dart). Fields two to a line, in MDA's
// order: Item Code | Item Name, Print Name | Under Sub Group, Unit | Tax Type, then GST Rate |
// HSN No. when the Tax Type is Taxable, or HSN No. alone. Enter moves through them in that order
// and on to Save Item (or Update). The code can't be changed once saved.
// Logic and quirks: packages/services/src/stock-items.ts.

import { ITEM_GST_RATES, ITEM_UNITS, TAXABLE, TAX_TYPES, stockItemMessages as msg } from '@qi/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState, type KeyboardEvent } from 'react';
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

type Item = OkBody<Awaited<ReturnType<(typeof api.api)['stock-items']['$get']>>>[number];
type Form = {
  code: string;
  name: string;
  printName: string;
  subGrpCode: string;
  unit: string;
  regType: string;
  gstRate: string;
  hsn: string;
};
type Errors = { code?: string; name?: string };
type Message = { kind: 'ok' | 'error'; title: [string, string]; text: string };

const EMPTY: Form = {
  code: '',
  name: '',
  printName: '',
  subGrpCode: '',
  unit: '',
  regType: '',
  gstRate: '',
  hsn: '',
};
const TITLE = 'Stock Item';
const asOptions = (list: readonly string[]) => list.map((v) => ({ value: v, label: v }));

const viewColumns: Column<Item>[] = [
  { head: 'Code', width: '75px', cell: (i) => i.code, mono: true },
  { head: 'Item Name', width: 'minmax(0,1fr)', cell: (i) => i.name },
  { head: 'Sub Group', width: '130px', cell: (i) => i.subGrpName, wide: true },
  { head: 'Unit', width: '55px', cell: (i) => i.unit },
  { head: 'GST Rate', width: '70px', cell: (i) => i.gstRate, wide: true },
  { head: 'HSN No.', width: '80px', cell: (i) => i.hsn, wide: true },
];
const printColumns: Column<Item>[] = [
  { head: 'Code', width: '', cell: (i) => i.code },
  { head: 'Item Name', width: '', cell: (i) => i.name },
  { head: 'Print Name', width: '', cell: (i) => i.printName },
  { head: 'Sub Group', width: '', cell: (i) => i.subGrpName },
  { head: 'Unit', width: '', cell: (i) => i.unit },
  { head: 'Reg Type', width: '', cell: (i) => i.regType },
  { head: 'GST Rate', width: '', cell: (i) => i.gstRate },
  { head: 'HSN No.', width: '', cell: (i) => i.hsn },
];

const focusId = (id: string) => setTimeout(() => document.getElementById(id)?.focus(), 0);

export function StockItemScreen() {
  const queryClient = useQueryClient();
  const items = useQuery({
    queryKey: ['stock-items'],
    queryFn: () => unwrap(api.api['stock-items'].$get()),
  });
  const subGroups = useQuery({
    queryKey: ['stock-sub-groups'],
    queryFn: () => unwrap(api.api['stock-sub-groups'].$get()),
  });
  const subGroupOptions = (subGroups.data ?? []).map((g) => ({ value: g.code, label: g.name }));

  const [form, setForm] = useState<Form>(EMPTY);
  const [errors, setErrors] = useState<Errors>({});
  const [editing, setEditing] = useState<Item | null>(null);
  const [busy, setBusy] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [updateConfirm, setUpdateConfirm] = useState(false);
  const [removeConfirm, setRemoveConfirm] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);

  const actionRef = useRef<HTMLButtonElement>(null);
  // The Tax Type just picked, for Enter's next stop: the GST Rate field only exists once the
  // re-render that follows the pick has happened, so the state can't be read yet.
  const regTypeRef = useRef('');
  const taxable = form.regType === TAXABLE;
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['stock-items'] });
  const set = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }));

  /** Enter moves to the next field, as MDA's onSubmitted does. */
  const enterTo = (next: string | (() => void)) => (e: KeyboardEvent) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (typeof next === 'string') focusId(next);
    else next();
  };
  const toAction = () => actionRef.current?.focus();

  const clearForm = () => {
    regTypeRef.current = '';
    setForm(EMPTY);
    setErrors({});
    setEditing(null);
    focusId('si-code');
  };

  const validate = () => {
    const e: Errors = {};
    if (!form.code.trim()) e.code = msg.required;
    if (!form.name.trim()) e.name = msg.required;
    setErrors(e);
    if (e.code) focusId('si-code');
    else if (e.name) focusId('si-name');
    return !e.code && !e.name;
  };

  const failed = (err: unknown) => {
    const fe = err instanceof ApiError && err.status === 422 ? err.body.fieldErrors : undefined;
    if (fe?.code || fe?.name) {
      setErrors({ code: fe.code, name: fe.name });
      focusId(fe.code ? 'si-code' : 'si-name');
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
      const i = await unwrap(api.api['stock-items'].$post({ json: form }));
      await refresh();
      setMessage({ kind: 'ok', title: [TITLE, 'Saved'], text: msg.saved(i.name) });
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
      const i = await unwrap(
        api.api['stock-items'][':code'].$put({ param: { code: editing.code }, json: form }),
      );
      await refresh();
      setMessage({ kind: 'ok', title: [TITLE, 'Updated'], text: msg.updated(i.name) });
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
      await unwrap(api.api['stock-items'][':code'].$delete({ param: { code: editing.code } }));
      await refresh();
      // MDA shows this success in its error colour (stock_item_page.dart:232).
      setMessage({ kind: 'error', title: [TITLE, 'Removed'], text: msg.removed(editing.name) });
      clearForm();
    } catch (err) {
      failed(err);
    }
    setRemoveConfirm(false);
    setBusy(false);
  }

  const pick = (i: Item) => {
    setListOpen(false);
    setEditing(i);
    setErrors({});
    regTypeRef.current = i.regType;
    setForm({
      code: i.code,
      name: i.name,
      printName: i.printName,
      subGrpCode: i.subGrpCode,
      unit: i.unit,
      regType: i.regType,
      gstRate: i.gstRate,
      hsn: i.hsn,
    });
    focusId('si-code');
  };

  const hsnField = (
    <FieldRow id="si-hsn" label="HSN No.">
      <input
        id="si-hsn"
        value={form.hsn}
        placeholder="HSN / SAC code"
        autoComplete="off"
        onChange={(e) => set({ hsn: e.target.value })}
        // Enter moves to Save Item, or to Update while an item is open (MDA).
        onKeyDown={enterTo(toAction)}
        className={inputClass()}
      />
    </FieldRow>
  );

  return (
    <>
      <MasterPage crumb={TITLE} title={['Stock', 'Item']}>
        <FormBlock heading="STOCK ITEM DETAILS" pairs>
          <FieldRow id="si-code" label="Item Code" required error={errors.code}>
            <input
              id="si-code"
              value={form.code}
              placeholder="Unique item code"
              autoComplete="off"
              autoFocus
              readOnly={!!editing}
              onChange={(e) => {
                set({ code: e.target.value });
                setErrors((x) => ({ ...x, code: undefined }));
              }}
              onKeyDown={enterTo('si-name')}
              className={`${inputClass(errors.code)} read-only:text-muted-foreground`}
            />
          </FieldRow>
          <FieldRow id="si-name" label="Item Name" required error={errors.name}>
            <input
              id="si-name"
              value={form.name}
              placeholder="Item name"
              autoComplete="off"
              onChange={(e) => {
                set({ name: e.target.value });
                setErrors((x) => ({ ...x, name: undefined }));
              }}
              onKeyDown={enterTo('si-print')}
              className={inputClass(errors.name)}
            />
          </FieldRow>
          <FieldRow id="si-print" label="Print Name">
            <input
              id="si-print"
              value={form.printName}
              placeholder="Name to print on bills"
              autoComplete="off"
              onChange={(e) => set({ printName: e.target.value })}
              onKeyDown={enterTo('si-subgrp')}
              className={inputClass()}
            />
          </FieldRow>
          <FieldRow id="si-subgrp" label="Under Sub Group">
            <SearchSelect
              id="si-subgrp"
              value={form.subGrpCode}
              options={subGroupOptions}
              placeholder="Select sub group…"
              onCommit={(code) => set({ subGrpCode: code })}
              onNext={() => focusId('si-unit')}
            />
          </FieldRow>
          <FieldRow id="si-unit" label="Unit">
            <SearchSelect
              id="si-unit"
              value={form.unit}
              options={asOptions(ITEM_UNITS)}
              placeholder="Select unit…"
              freeText
              onCommit={(unit) => set({ unit })}
              onNext={() => focusId('si-tax')}
            />
          </FieldRow>
          <FieldRow id="si-tax" label="Tax Type">
            <SearchSelect
              id="si-tax"
              value={form.regType}
              options={asOptions(TAX_TYPES)}
              placeholder="Select tax type…"
              // Away from Taxable, the GST Rate is cleared (stock_item_page.dart:592-596).
              onCommit={(regType) => {
                regTypeRef.current = regType;
                set(regType === TAXABLE ? { regType } : { regType, gstRate: '' });
              }}
              onNext={() => focusId(regTypeRef.current === TAXABLE ? 'si-gst' : 'si-hsn')}
            />
          </FieldRow>
          {taxable && (
            <FieldRow id="si-gst" label="GST Rate">
              <SearchSelect
                id="si-gst"
                value={form.gstRate}
                options={asOptions(ITEM_GST_RATES)}
                placeholder="Select GST rate…"
                freeText
                onCommit={(gstRate) => set({ gstRate })}
                onNext={() => focusId('si-hsn')}
              />
            </FieldRow>
          )}
          {hsnField}
        </FormBlock>
        <ActionBar
          wide
          editing={!!editing}
          busy={busy}
          saveLabel="Save Item"
          actionRef={actionRef}
          onView={() => setListOpen(true)}
          onCancel={clearForm}
          onSave={() => void save()}
          onUpdate={() => validate() && setUpdateConfirm(true)}
          onRemove={() => setRemoveConfirm(true)}
        />
      </MasterPage>

      <RecordList
        title={['Stock', 'Item']}
        noneFound={msg.noneFound}
        hint="↑ ↓ navigate  •  Enter select  •  Double-click row  •  Esc close"
        open={listOpen}
        rows={items.data ?? []}
        rowKey={(i) => i.code}
        columns={viewColumns}
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
        title="Stock Item List"
        rows={items.data ?? []}
        rowKey={(i) => i.code}
        columns={printColumns}
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
