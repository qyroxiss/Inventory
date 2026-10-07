// Sale Type Master — MDA's "Sale Type Master" page (sale_type_master_page.dart). Laid out
// differently from the other masters, as in MDA: the form (Sale Name, Sale Prefix, Sale By with
// its "…" picker), then the saved types listed right underneath (Job Name · Job Work) — click a
// row to edit it. Save, or Update / Remove / Clear while a type is open; Update saves without
// asking. MDA's own Back button at the bottom is the Back at the top-left here (layout rule 3).
// Logic and quirks: packages/services/src/sale-types.ts.

import { SALE_BY_OPTIONS, cleanSalePrefix, saleTypeMessages as msg } from '@qi/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import { ApiError, api, unwrap, type OkBody } from '../../api.ts';
import { ConfirmDelete, Dialog, MessageDialog } from '../../components/Dialog.tsx';
import { FieldRow, FormBlock, MasterPage, inputClass } from '../../components/master.tsx';

type SaleType = OkBody<Awaited<ReturnType<(typeof api.api)['sale-types']['$get']>>>[number];
type Form = { name: string; prefix: string; saleBy: string };
type Errors = { name?: string; saleBy?: string };
type Message = { kind: 'ok' | 'error'; title: [string, string]; text: string };

const EMPTY: Form = { name: '', prefix: '', saleBy: '' };
const TITLE = 'Sale Type';
const BTN =
  'flex h-12 cursor-pointer items-center justify-center border-[1.5px] px-5 text-[15px] font-semibold disabled:cursor-wait disabled:opacity-70 max-sm:flex-1';

export function SaleTypeScreen() {
  const queryClient = useQueryClient();
  const types = useQuery({
    queryKey: ['sale-types'],
    queryFn: () => unwrap(api.api['sale-types'].$get()),
  });
  const rows = types.data ?? [];

  const [form, setForm] = useState<Form>(EMPTY);
  const [errors, setErrors] = useState<Errors>({});
  const [editing, setEditing] = useState<SaleType | null>(null);
  const [busy, setBusy] = useState(false);
  const [picker, setPicker] = useState(false);
  const [removeConfirm, setRemoveConfirm] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);

  const nameRef = useRef<HTMLInputElement>(null);
  const prefixRef = useRef<HTMLInputElement>(null);
  const saleByRef = useRef<HTMLInputElement>(null);
  const saveRef = useRef<HTMLButtonElement>(null);
  const focusName = () => setTimeout(() => nameRef.current?.focus(), 0);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['sale-types'] });
  const set = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }));

  const enterTo = (next: RefObject<HTMLElement | null>) => (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      next.current?.focus();
    }
  };

  const clearForm = () => {
    setForm(EMPTY);
    setErrors({});
    setEditing(null);
    focusName();
  };

  /** Both required fields are checked together, as MDA's form validator does. */
  const validate = () => {
    const e: Errors = {};
    if (!form.name.trim()) e.name = msg.nameRequired;
    if (!form.saleBy.trim()) e.saleBy = msg.saleByRequired;
    setErrors(e);
    if (e.name) nameRef.current?.focus();
    else if (e.saleBy) saleByRef.current?.focus();
    return !e.name && !e.saleBy;
  };

  /** MDA shows the service's refusals (duplicate, in use) as a red message, not on a field. */
  const failed = (err: unknown) =>
    setMessage({
      kind: 'error',
      title: [TITLE, 'Error'],
      text: err instanceof ApiError || err instanceof Error ? err.message : String(err),
    });

  async function saveOrUpdate() {
    if (!validate()) return;
    setBusy(true);
    try {
      if (editing) {
        const t = await unwrap(
          api.api['sale-types'][':code'].$put({ param: { code: editing.code }, json: form }),
        );
        setMessage({ kind: 'ok', title: [TITLE, 'Updated'], text: msg.updated(t.name) });
      } else {
        const t = await unwrap(api.api['sale-types'].$post({ json: form }));
        setMessage({ kind: 'ok', title: [TITLE, 'Saved'], text: msg.saved(t.name, t.code) });
      }
      await refresh();
      clearForm();
    } catch (err) {
      failed(err);
    }
    setBusy(false);
  }

  async function doRemove() {
    if (!editing) return;
    setBusy(true);
    try {
      await unwrap(api.api['sale-types'][':code'].$delete({ param: { code: editing.code } }));
      await refresh();
      // MDA shows this success in its error colour (sale_type_master_page.dart:144).
      setMessage({ kind: 'error', title: [TITLE, 'Removed'], text: msg.removed(editing.name) });
      clearForm();
    } catch (err) {
      failed(err);
    }
    setRemoveConfirm(false);
    setBusy(false);
  }

  const pick = (t: SaleType) => {
    setEditing(t);
    setErrors({});
    setForm({ name: t.name, prefix: t.prefix, saleBy: t.saleBy });
    focusName();
  };

  return (
    <>
      <MasterPage crumb="Sale Type Master" title={['Sale Type', 'Master']}>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {editing && (
            <span className="border border-primary-text/30 bg-accent px-2 py-0.5 font-mono text-[11px] font-semibold text-primary-text">
              Editing {editing.code}
            </span>
          )}
          <span className="pointer-coarse:hidden">Enter moves to the next field</span>
        </div>

        {/* Laptop: the form on the left, the saved types beside it, so nothing scrolls.
            Tablets and phones: stacked, the list under the form, as in MDA. */}
        <div className="grid grid-cols-[minmax(0,560px)_minmax(0,1fr)] items-start gap-10 max-lg:grid-cols-1 max-lg:gap-6">
          <div className="flex flex-col gap-6">
            <FormBlock heading="SALE TYPE DETAILS">
              <FieldRow id="st-name" label="Sale Name" required error={errors.name}>
                <input
                  id="st-name"
                  ref={nameRef}
                  value={form.name}
                  placeholder="e.g. Counter Sale, Tax Invoice"
                  autoComplete="off"
                  autoFocus
                  onChange={(e) => {
                    set({ name: e.target.value });
                    setErrors((x) => ({ ...x, name: undefined }));
                  }}
                  onKeyDown={enterTo(prefixRef)}
                  className={inputClass(errors.name)}
                />
              </FieldRow>
              <FieldRow id="st-prefix" label="Sale Prefix">
                <input
                  id="st-prefix"
                  ref={prefixRef}
                  value={form.prefix}
                  placeholder="e.g. CS"
                  autoComplete="off"
                  // Letters, digits, '-' and '/', at most 6 (MDA's input formatters).
                  onChange={(e) => set({ prefix: cleanSalePrefix(e.target.value) })}
                  onKeyDown={enterTo(saleByRef)}
                  className={`${inputClass()} max-w-[140px]`}
                />
              </FieldRow>
              <FieldRow id="st-saleby" label="Sale By" required error={errors.saleBy}>
                <div className="flex gap-2">
                  <input
                    id="st-saleby"
                    ref={saleByRef}
                    value={form.saleBy}
                    placeholder="e.g. Counter, Challan"
                    autoComplete="off"
                    onChange={(e) => {
                      set({ saleBy: e.target.value });
                      setErrors((x) => ({ ...x, saleBy: undefined }));
                    }}
                    onKeyDown={enterTo(saveRef)}
                    className={inputClass(errors.saleBy)}
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setPicker(true)}
                    aria-label="Select Sale By"
                    className="grid h-[42px] w-11 flex-none cursor-pointer place-items-center field-box text-base font-semibold"
                  >
                    …
                  </button>
                </div>
              </FieldRow>
            </FormBlock>

            <div className="flex flex-wrap items-center justify-end gap-2.5 border-t-[3px] border-double border-foreground bg-background py-3.5">
              {editing && (
                <>
                  <button
                    type="button"
                    onClick={() => setRemoveConfirm(true)}
                    className={`${BTN} border-destructive text-destructive`}
                  >
                    Remove
                  </button>
                  <button type="button" onClick={clearForm} className={`${BTN} border-foreground`}>
                    Clear
                  </button>
                </>
              )}
              <button
                type="button"
                ref={saveRef}
                onClick={() => void saveOrUpdate()}
                disabled={busy}
                className={`${BTN} min-w-[180px] justify-between gap-4 border-primary bg-primary px-[22px] text-primary-foreground max-sm:order-last max-sm:w-full max-sm:flex-none`}
              >
                <span>{editing ? 'Update' : 'Save'}</span>
                <span aria-hidden="true" className="text-xl">
                  →
                </span>
              </button>
            </div>
          </div>
          <div className="flex flex-col border border-border bg-card">
            <div className="grid grid-cols-[minmax(0,4fr)_minmax(0,3fr)] gap-4 border-b border-border px-4 py-2.5 font-mono text-xs uppercase tracking-[0.08em] text-muted-foreground">
              <span>Job Name</span>
              <span>Job Work</span>
            </div>
            <div className="h-[300px] overflow-y-auto max-lg:h-[240px] max-sm:h-auto max-sm:max-h-[320px]">
              {rows.length === 0 && (
                <p className="m-0 grid h-full place-items-center text-sm text-muted-foreground max-sm:py-8">
                  {msg.noneFound}
                </p>
              )}
              {rows.map((t) => (
                <button
                  key={t.code}
                  type="button"
                  tabIndex={-1}
                  onClick={() => pick(t)}
                  className={`grid min-h-11 w-full cursor-pointer grid-cols-[minmax(0,4fr)_minmax(0,3fr)] items-center gap-4 border-b border-border px-4 text-left text-[15px] hover:bg-accent ${
                    editing?.code === t.code ? 'bg-accent font-semibold' : ''
                  }`}
                >
                  <span className="truncate">{t.name}</span>
                  <span className="truncate text-muted-foreground">{t.saleBy}</span>
                </button>
              ))}
            </div>
            <div className="flex items-center justify-between border-t border-border px-4 py-2 text-xs text-muted-foreground">
              <span className="font-mono">{msg.count(rows.length)}</span>
              <span>Click a row to edit it</span>
            </div>
          </div>
        </div>
      </MasterPage>

      <SaleByPicker
        open={picker}
        onPick={(v) => {
          set({ saleBy: v });
          setErrors((x) => ({ ...x, saleBy: undefined }));
          setPicker(false);
          setTimeout(() => saveRef.current?.focus(), 0);
        }}
        onClose={() => setPicker(false)}
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

/** MDA's "Select Sale By" list behind the "…" button. */
function SaleByPicker({
  open,
  onPick,
  onClose,
}: {
  open: boolean;
  onPick: (v: string) => void;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onClose={onClose} title={['Select', 'Sale By']} className="w-[360px]">
      <div className="mt-3.5 flex flex-col border-t border-border">
        {SALE_BY_OPTIONS.map((o, k) => (
          <button
            key={o}
            type="button"
            autoFocus={k === 0}
            onClick={() => onPick(o)}
            className="min-h-11 cursor-pointer border-b border-border px-[26px] text-left text-[15px] hover:bg-accent focus-visible:bg-accent"
          >
            {o}
          </button>
        ))}
      </div>
      <div className="flex justify-end px-[26px] py-3">
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
