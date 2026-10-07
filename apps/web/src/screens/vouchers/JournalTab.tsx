// Journal tab (accounting_vouchers_page.dart:1335-1651): free Dr/Cr lines over any ledger, at
// least two; Add Entry adds a Dr line; the running totals show "Balanced ✓" or the difference.
// Save is refused while it doesn't balance. No party, no bill reference. Printing isn't built in
// MDA ("arrives with the report module").

import {
  amountProblem,
  cancelConfirm,
  fmtTotal,
  journalDraft,
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
  saveDraft,
  useVoucherData,
  type Message,
  type VoucherRow,
} from './shared.tsx';

type Line = { key: number; ledger: string; debit: boolean; amount: string };
type Form = {
  date: string;
  vchrNo: string;
  narration: string;
  lines: Line[];
  editId: string | null;
};
type LineErrors = Record<number, { ledger?: string; amount?: string }>;

let nextKey = 1;
const line = (debit: boolean, ledger = '', amount = ''): Line => ({
  key: nextKey++,
  ledger,
  debit,
  amount,
});
/** A fresh journal starts with one Dr and one Cr line. */
const twoLines = () => [line(true), line(false)];

export function JournalTab() {
  const queryClient = useQueryClient();
  const { me, ledgers, ready } = useVoucherData();
  const draftKey = `${me?.bookId}:journal`;

  const blank = (vchrNo = ''): Form => ({
    date: defaultVoucherDate(me?.fyFrom, me?.fyTo),
    vchrNo,
    narration: '',
    lines: twoLines(),
    editId: null,
  });
  const [form, setForm] = useState<Form | null>(null);
  const [errors, setErrors] = useState<LineErrors>({});
  const [busy, setBusy] = useState(false);
  const [list, setList] = useState<VoucherRow[] | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);

  useEffect(() => {
    if (!me || form) return;
    const kept = loadDraft<Form>(draftKey);
    if (kept) setForm(kept);
    else void fetchNextNo('JNL').then((no) => setForm(blank(no)));
  }, [me]);
  useEffect(() => {
    if (form && me) saveDraft(draftKey, form);
  }, [form]);

  if (!ready || !form) return <VoucherPage tab="journal">{null}</VoucherPage>;

  const set = (patch: Partial<Form>) => setForm((f) => ({ ...f!, ...patch }));
  const setLine = (key: number, patch: Partial<Line>) =>
    setForm((f) => ({
      ...f!,
      lines: f!.lines.map((l) => (l.key === key ? { ...l, ...patch } : l)),
    }));
  const inEdit = !!form.editId;
  const totalDr = sumRaw(form.lines.filter((l) => l.debit).map((l) => parseAmount(l.amount)));
  const totalCr = sumRaw(form.lines.filter((l) => !l.debit).map((l) => parseAmount(l.amount)));
  const balanced = Math.abs(totalDr - totalCr) < 0.001;

  const clear = async () => {
    const no = await fetchNextNo('JNL');
    setErrors({});
    setForm(blank(no));
  };

  const validate = () => {
    const e: LineErrors = {};
    for (const l of form.lines) {
      const le: { ledger?: string; amount?: string } = {};
      if (!l.ledger) le.ledger = vm.selectLedger;
      const a = amountProblem(l.amount, vm.invalid);
      if (a) le.amount = a;
      if (le.ledger || le.amount) e[l.key] = le;
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const fail = (err: unknown) =>
    setMessage({ kind: 'error', title: ['Journal', 'Error'], text: errorText(err) });

  const save = async () => {
    if (!validate()) return;
    if (!balanced) {
      return setMessage({
        kind: 'error',
        title: ['Journal', 'Error'],
        text: vm.notBalanced(fmtTotal(Math.abs(totalDr - totalCr))),
      });
    }
    setBusy(true);
    try {
      const d = journalDraft(
        form.lines.map((l) => ({
          accCode: l.ledger,
          debit: l.debit,
          amount: parseAmount(l.amount),
        })),
      );
      const common = { date: form.date, narration: form.narration.trim(), lines: d.lines };
      if (inEdit) {
        await unwrap(api.api.vouchers[':id'].$put({ param: { id: form.editId! }, json: common }));
      } else {
        await unwrap(
          api.api.vouchers.$post({ json: { ...common, vchrType: 'JNL', vchrNo: form.vchrNo } }),
        );
      }
      setMessage({
        kind: 'ok',
        title: ['Journal', inEdit ? 'Updated' : 'Saved'],
        text: inEdit ? vm.updated('Journal', form.vchrNo) : vm.saved('Journal', form.vchrNo),
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
      setMessage({
        kind: 'ok',
        title: ['Journal', 'Cancelled'],
        text: vm.cancelled('Journal', form.vchrNo),
      });
      await clear();
    } catch (err) {
      fail(err);
    }
    setConfirm(false);
    setBusy(false);
  };

  const open = async (row: VoucherRow) => {
    setList(null);
    const rows = await fetchLines(row.id);
    const known = (code: string) => (ledgers!.some((l) => l.accCode === code) ? code : '');
    const lines = rows.map((r) =>
      line(r.dr > 0, known(r.accCode), (r.dr > 0 ? r.dr : r.cr).toFixed(2)),
    );
    while (lines.length < 2) lines.push(line(lines.length === 0));
    setErrors({});
    setForm({
      date: row.vchrDate,
      vchrNo: row.vchrNo,
      narration: row.narration,
      lines,
      editId: row.status === 'Cancelled' ? null : row.id,
    });
  };

  const drCr = (l: Line, debit: boolean) => (
    <button
      type="button"
      aria-pressed={l.debit === debit}
      onClick={() => setLine(l.key, { debit })}
      className={`flex h-[42px] flex-1 cursor-pointer items-center justify-center border-[1.5px] text-sm font-semibold ${
        l.debit === debit ? 'border-foreground bg-foreground text-card' : 'border-border bg-card'
      }`}
    >
      {debit ? 'Dr' : 'Cr'}
    </button>
  );
  const COLS =
    'grid grid-cols-[minmax(0,1fr)_130px_150px_36px] gap-3 max-sm:grid-cols-[minmax(0,1fr)_96px_36px]';

  return (
    <>
      <VoucherPage tab="journal">
        <div className="flex min-h-0 flex-1 flex-col gap-1">
          <div className="grid grid-cols-2 gap-x-6 max-md:grid-cols-1">
            <FieldRow id="jv-date" label="Date" required>
              <DateBox
                id="jv-date"
                value={form.date}
                min={me!.fyFrom}
                max={me!.fyTo}
                onChange={(date) => set({ date })}
              />
            </FieldRow>
            <FieldRow id="jv-no" label="Voucher No">
              <ReadBox text={form.vchrNo || '—'} />
            </FieldRow>
          </div>
          <div className="mt-2">
            <SectionLabel>Journal Entries</SectionLabel>
          </div>
          <div
            className={`${COLS} border-b-2 border-foreground pb-1.5 pt-2 font-mono text-xs uppercase tracking-[0.06em] text-muted-foreground`}
          >
            <span>Ledger Account</span>
            <span className="max-sm:hidden">Dr / Cr</span>
            <span>Amount (₹)</span>
            <span />
          </div>
          <div className="flex max-h-[34vh] min-h-0 flex-col gap-2 overflow-y-auto py-2 max-sm:max-h-none">
            {form.lines.map((l) => {
              const e = errors[l.key] ?? {};
              return (
                <div key={l.key} className={`${COLS} items-start`}>
                  <div className="flex flex-col gap-1">
                    <Select
                      value={l.ledger}
                      options={ledgerOptions(ledgers!)}
                      placeholder={vm.selectLedger}
                      error={e.ledger}
                      onChange={(ledger) => setLine(l.key, { ledger })}
                    />
                    {e.ledger && <span className="text-[13px] text-destructive">{e.ledger}</span>}
                    <div className="hidden gap-1.5 max-sm:flex">
                      {drCr(l, true)}
                      {drCr(l, false)}
                    </div>
                  </div>
                  <div className="flex gap-1.5 max-sm:hidden">
                    {drCr(l, true)}
                    {drCr(l, false)}
                  </div>
                  <div className="flex flex-col gap-1">
                    <AmountBox
                      value={l.amount}
                      error={e.amount}
                      onChange={(amount) => setLine(l.key, { amount })}
                    />
                    {e.amount && <span className="text-[13px] text-destructive">{e.amount}</span>}
                  </div>
                  <button
                    type="button"
                    aria-label="Remove entry"
                    disabled={form.lines.length <= 2}
                    onClick={() => set({ lines: form.lines.filter((x) => x.key !== l.key) })}
                    className="grid h-[42px] cursor-pointer place-items-center text-destructive disabled:cursor-not-allowed disabled:text-ledger-faint"
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => set({ lines: [...form.lines, line(true)] })}
              className="flex h-11 cursor-pointer items-center border-[1.5px] border-dashed border-foreground px-4 text-sm font-semibold"
            >
              + Add Entry
            </button>
            <span className="flex-1" />
            <div
              className={`flex flex-wrap items-center gap-4 border px-4 py-2 font-mono text-sm ${
                balanced
                  ? 'border-primary-text/40 bg-accent'
                  : 'border-destructive/40 bg-destructive-bg'
              }`}
            >
              <span>
                <span className="text-muted-foreground">Total Dr </span>₹{fmtTotal(totalDr)}
              </span>
              <span>
                <span className="text-muted-foreground">Total Cr </span>₹{fmtTotal(totalCr)}
              </span>
              <span
                className={`font-semibold ${balanced ? 'text-primary-text' : 'text-destructive'}`}
              >
                {balanced ? 'Balanced ✓' : `Diff: ₹${fmtTotal(Math.abs(totalDr - totalCr))}`}
              </span>
            </div>
          </div>
          <div className="mt-1">
            <FieldRow id="jv-narration" label="Narration">
              <input
                id="jv-narration"
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
            removeLabel="Cancel Vchr"
            canRemove={inEdit}
            saveLabel={inEdit ? 'Update Voucher' : 'Save Voucher'}
            busy={busy}
            onView={async () => {
              try {
                setList(await fetchList(['JNL']));
              } catch (err) {
                fail(err);
              }
            }}
            onRemove={() => setConfirm(true)}
            onPrint={() =>
              setMessage({
                kind: 'ok',
                title: ['Journal', 'Print'],
                text: vm.printLater('Journal'),
              })
            }
            onClear={() => void clear()}
            onSave={() => void save()}
          />
        </div>
      </VoucherPage>

      <VoucherList
        title={['Journal', 'Vouchers']}
        open={!!list}
        rows={list ?? []}
        onPick={(r) => void open(r)}
        onClose={() => setList(null)}
      />
      <ConfirmDelete
        open={confirm}
        title={['Cancel', 'Voucher']}
        text={cancelConfirm(`journal voucher ${form.vchrNo}`)}
        confirmLabel="Cancel voucher"
        cancelLabel="Keep it"
        onCancel={() => setConfirm(false)}
        onConfirm={() => void doCancel()}
        busy={busy}
      />
      <MessageDialog
        open={!!message}
        kind={message?.kind}
        title={message?.title ?? ['Journal', '']}
        text={message?.text ?? ''}
        onClose={() => setMessage(null)}
      />
    </>
  );
}
