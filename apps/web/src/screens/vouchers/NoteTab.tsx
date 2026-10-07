// Debit Note and Credit Note tabs (accounting_vouchers_page.dart:1652-2252) — mirror images:
//   Debit Note:  Dr the party (Sundry Creditors) for the total, with the reason as its narration;
//                Cr each entry ledger.
//   Credit Note: Dr each entry ledger; Cr the party (Sundry Debtors) for the total, with the reason.
// The party list is that one group (exact match), or every ledger if the group has none. Reopening
// a note doesn't bring its reason back, so it has to be chosen again to update (Q-46). No GST or
// stock effect; printing isn't built in MDA.

import {
  CN_REASONS,
  CREDITORS_GROUP,
  DEBTORS_GROUP,
  DN_REASONS,
  amountProblem,
  cancelConfirm,
  creditNoteDraft,
  debitNoteDraft,
  fmtTotal,
  parseAmount,
  sumRaw,
  voucherMessages as vm,
} from '@qi/core';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api, unwrap } from '../../api.ts';
import { ConfirmDelete, MessageDialog } from '../../components/Dialog.tsx';
import { FieldRow, inputClass } from '../../components/master.tsx';
import { VoucherList } from './lists.tsx';
import {
  AmountBox,
  DateBox,
  ReadBox,
  SectionLabel,
  Select,
  VoucherButtons,
  VoucherPage,
  defaultVoucherDate,
  errorText,
  fetchLines,
  fetchList,
  fetchNextNo,
  ledgerOptions,
  loadDraft,
  ofGroup,
  saveDraft,
  useVoucherData,
  type Message,
  type VoucherRow,
} from './shared.tsx';

type Kind = 'debit' | 'credit';
type Item = { key: number; ledger: string; amount: string };
type Form = {
  date: string;
  vchrNo: string;
  party: string;
  ref: string;
  reason: string;
  narration: string;
  items: Item[];
  editId: string | null;
};
type Errors = {
  party?: string;
  reason?: string;
  items: Record<number, { ledger?: string; amount?: string }>;
};

let nextKey = 1;
const item = (ledger = '', amount = ''): Item => ({ key: nextKey++, ledger, amount });

export function NoteTab({ kind }: { kind: Kind }) {
  const debit = kind === 'debit';
  const word = debit ? 'Debit Note' : 'Credit Note';
  const type = debit ? 'DRN' : 'CRN';
  const queryClient = useQueryClient();
  const { me, ledgers, ready } = useVoucherData();
  const draftKey = `${me?.bookId}:${kind}`;

  const blank = (vchrNo = ''): Form => ({
    date: defaultVoucherDate(me?.fyFrom, me?.fyTo),
    vchrNo,
    party: '',
    ref: '',
    reason: '',
    narration: '',
    items: [item()],
    editId: null,
  });
  const [form, setForm] = useState<Form | null>(null);
  const [errors, setErrors] = useState<Errors>({ items: {} });
  const [busy, setBusy] = useState(false);
  const [list, setList] = useState<VoucherRow[] | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);

  useEffect(() => {
    if (!me || form) return;
    const kept = loadDraft<Form>(draftKey);
    if (kept) setForm(kept);
    else void fetchNextNo(type).then((no) => setForm(blank(no)));
  }, [me]);
  useEffect(() => {
    if (form && me) saveDraft(draftKey, form);
  }, [form]);

  if (!ready || !form) return <VoucherPage tab={kind}>{null}</VoucherPage>;

  // A debit note is raised against a supplier, a credit note for a customer; every ledger if
  // that group has none yet.
  const grouped = ofGroup(ledgers!, debit ? CREDITORS_GROUP : DEBTORS_GROUP);
  const parties = grouped.length ? grouped : ledgers!;
  const reasons = debit ? DN_REASONS : CN_REASONS;
  const set = (patch: Partial<Form>) => setForm((f) => ({ ...f!, ...patch }));
  const setItem = (key: number, patch: Partial<Item>) =>
    setForm((f) => ({
      ...f!,
      items: f!.items.map((i) => (i.key === key ? { ...i, ...patch } : i)),
    }));
  const inEdit = !!form.editId;
  const total = sumRaw(form.items.map((i) => parseAmount(i.amount)));

  const clear = async () => {
    const no = await fetchNextNo(type);
    setErrors({ items: {} });
    setForm(blank(no));
  };

  const validate = () => {
    const e: Errors = { items: {} };
    if (!form.party) e.party = vm.selectParty;
    if (!form.reason) e.reason = vm.selectReason;
    for (const i of form.items) {
      const ie: { ledger?: string; amount?: string } = {};
      if (!i.ledger) ie.ledger = vm.selectLedger;
      const a = amountProblem(i.amount, vm.invalid);
      if (a) ie.amount = a;
      if (ie.ledger || ie.amount) e.items[i.key] = ie;
    }
    setErrors(e);
    return !e.party && !e.reason && Object.keys(e.items).length === 0;
  };

  const fail = (err: unknown) =>
    setMessage({ kind: 'error', title: [word, 'Error'], text: errorText(err) });

  const save = async () => {
    if (!validate()) return;
    setBusy(true);
    try {
      const entries = form.items.map((i) => ({ accCode: i.ledger, amount: parseAmount(i.amount) }));
      const d = (debit ? debitNoteDraft : creditNoteDraft)(
        form.party,
        form.reason,
        entries,
        form.vchrNo,
      );
      const common = {
        date: form.date,
        partyCode: form.party,
        refNo: form.ref.trim(),
        narration: form.narration.trim(),
        lines: d.lines,
      };
      if (inEdit) {
        await unwrap(api.api.vouchers[':id'].$put({ param: { id: form.editId! }, json: common }));
      } else {
        await unwrap(
          api.api.vouchers.$post({
            json: { ...common, vchrType: type, vchrNo: form.vchrNo, bills: d.bills },
          }),
        );
      }
      setMessage({
        kind: 'ok',
        title: [word, inEdit ? 'Updated' : 'Saved'],
        text: inEdit ? vm.updated(word, form.vchrNo) : vm.saved(word, form.vchrNo),
      });
      await queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      await clear();
    } catch (err) {
      fail(err);
    }
    setBusy(false);
  };

  const doCancel = async () => {
    if (!form.editId) return;
    setBusy(true);
    try {
      await unwrap(api.api.vouchers[':id'].cancel.$post({ param: { id: form.editId } }));
      setMessage({ kind: 'ok', title: [word, 'Cancelled'], text: vm.cancelled(word, form.vchrNo) });
      await clear();
    } catch (err) {
      fail(err);
    }
    setConfirm(false);
    setBusy(false);
  };

  /** Opens a note (`_loadVoucher`): its entry lines (the side opposite the party), the party,
   *  ref and narration — but not the reason (Q-46). */
  const open = async (row: VoucherRow) => {
    setList(null);
    const rows = await fetchLines(row.id);
    const known = (code: string, list: { accCode: string }[]) =>
      list.some((l) => l.accCode === code) ? code : '';
    const items = rows
      .filter((r) => (debit ? r.cr > 0 : r.dr > 0))
      .map((r) => item(known(r.accCode, ledgers!), (debit ? r.cr : r.dr).toFixed(2)));
    setErrors({ items: {} });
    setForm({
      date: row.vchrDate,
      vchrNo: row.vchrNo,
      party: known(row.partyCode ?? '', parties),
      ref: row.refNo,
      reason: '',
      narration: row.narration,
      items: items.length ? items : [item()],
      editId: row.status === 'Cancelled' ? null : row.id,
    });
  };

  const COLS =
    'grid grid-cols-[minmax(0,1fr)_170px_36px] gap-3 max-sm:grid-cols-[minmax(0,1fr)_120px_36px]';

  return (
    <>
      <VoucherPage tab={kind}>
        <div className="flex min-h-0 flex-1 flex-col gap-1">
          <div className="grid grid-cols-2 gap-x-6 max-md:grid-cols-1">
            <FieldRow id="nt-date" label="Date" required>
              <DateBox
                id="nt-date"
                value={form.date}
                min={me!.fyFrom}
                max={me!.fyTo}
                onChange={(date) => set({ date })}
              />
            </FieldRow>
            <FieldRow id="nt-no" label="Voucher No">
              <ReadBox text={form.vchrNo || '—'} />
            </FieldRow>
          </div>
          <div className="grid grid-cols-2 gap-x-6 max-lg:grid-cols-1">
            <FieldRow id="nt-party" label="Party Account" required error={errors.party}>
              <Select
                id="nt-party"
                value={form.party}
                options={ledgerOptions(parties)}
                placeholder={vm.selectParty}
                error={errors.party}
                onChange={(party) => {
                  set({ party });
                  setErrors((x) => ({ ...x, party: undefined }));
                }}
              />
            </FieldRow>
            <FieldRow id="nt-reason" label="Reason" required error={errors.reason}>
              <Select
                id="nt-reason"
                value={form.reason}
                options={reasons.map((r) => ({ value: r, label: r }))}
                placeholder={vm.selectReason}
                error={errors.reason}
                onChange={(reason) => {
                  set({ reason });
                  setErrors((x) => ({ ...x, reason: undefined }));
                }}
              />
            </FieldRow>
          </div>
          <FieldRow id="nt-ref" label="Against (Ref)">
            <input
              id="nt-ref"
              value={form.ref}
              placeholder="Reference bill / invoice number (optional)"
              autoComplete="off"
              onChange={(e) => set({ ref: e.target.value })}
              className={inputClass()}
            />
          </FieldRow>
          <div className="mt-2">
            <SectionLabel>{debit ? 'Debit Entries' : 'Credit Entries'}</SectionLabel>
          </div>
          <div
            className={`${COLS} border-b-2 border-foreground pb-1.5 pt-2 font-mono text-xs uppercase tracking-[0.06em] text-muted-foreground`}
          >
            <span>Ledger Account</span>
            <span>Amount (₹)</span>
            <span />
          </div>
          <div className="flex max-h-[24vh] min-h-0 flex-col gap-2 overflow-y-auto py-2 max-sm:max-h-none">
            {form.items.map((i) => {
              const e = errors.items[i.key] ?? {};
              return (
                <div key={i.key} className={`${COLS} items-start`}>
                  <div className="flex flex-col gap-1">
                    <Select
                      value={i.ledger}
                      options={ledgerOptions(ledgers!)}
                      placeholder={vm.selectLedger}
                      error={e.ledger}
                      onChange={(ledger) => setItem(i.key, { ledger })}
                    />
                    {e.ledger && <span className="text-[13px] text-destructive">{e.ledger}</span>}
                  </div>
                  <div className="flex flex-col gap-1">
                    <AmountBox
                      value={i.amount}
                      error={e.amount}
                      onChange={(amount) => setItem(i.key, { amount })}
                    />
                    {e.amount && <span className="text-[13px] text-destructive">{e.amount}</span>}
                  </div>
                  <button
                    type="button"
                    aria-label="Remove item"
                    disabled={form.items.length <= 1}
                    onClick={() => set({ items: form.items.filter((x) => x.key !== i.key) })}
                    className="grid h-[42px] cursor-pointer place-items-center text-destructive disabled:cursor-not-allowed disabled:text-ledger-faint"
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => set({ items: [...form.items, item()] })}
              className="flex h-11 cursor-pointer items-center border-[1.5px] border-dashed border-foreground px-4 text-sm font-semibold"
            >
              + Add Item
            </button>
            <span className="flex-1" />
            <span className="border border-border bg-card px-4 py-2 font-mono text-sm">
              <span className="text-muted-foreground">Total </span>₹{fmtTotal(total)}
            </span>
          </div>
          <div className="mt-1">
            <FieldRow id="nt-narration" label="Narration">
              <input
                id="nt-narration"
                value={form.narration}
                placeholder="Enter narration..."
                autoComplete="off"
                onChange={(e) => set({ narration: e.target.value })}
                className={inputClass()}
              />
            </FieldRow>
          </div>
        </div>
        <div className="mt-3">
          <VoucherButtons
            removeLabel="Cancel Note"
            canRemove={inEdit}
            saveLabel={inEdit ? `Update ${word}` : `Save ${word}`}
            busy={busy}
            onView={async () => {
              try {
                setList(await fetchList([type]));
              } catch (err) {
                fail(err);
              }
            }}
            onRemove={() => setConfirm(true)}
            onPrint={() =>
              setMessage({
                kind: 'ok',
                title: [word, 'Print'],
                text: vm.printLater(debit ? 'Debit note' : 'Credit note'),
              })
            }
            onClear={() => void clear()}
            onSave={() => void save()}
          />
        </div>
      </VoucherPage>

      <VoucherList
        title={debit ? ['Debit', 'Notes'] : ['Credit', 'Notes']}
        open={!!list}
        rows={list ?? []}
        onPick={(r) => void open(r)}
        onClose={() => setList(null)}
      />
      <ConfirmDelete
        open={confirm}
        title={['Cancel', 'Voucher']}
        text={cancelConfirm(`${word.toLowerCase()} ${form.vchrNo}`)}
        confirmLabel="Cancel voucher"
        cancelLabel="Keep it"
        onCancel={() => setConfirm(false)}
        onConfirm={() => void doCancel()}
        busy={busy}
      />
      <MessageDialog
        open={!!message}
        kind={message?.kind}
        title={message?.title ?? [word, '']}
        text={message?.text ?? ''}
        onClose={() => setMessage(null)}
      />
    </>
  );
}
