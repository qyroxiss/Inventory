// Receipt and Payment tabs (accounting_vouchers_page.dart:430-720, 1053-1334) — mirror images:
//   Receipt: Dr the Cash (A003) or Bank (A002) account, Cr "Received From" (any ledger).
//   Payment: Dr "Paid To" (any ledger), Cr the Cash or Bank account.
// Cash/Bank is chosen first (RCP/BNK or PAY/BPAY, each its own number series) and can't be
// switched once a voucher is opened for editing. Remove cancels the voucher (it stays in the
// books, marked). A cancelled voucher opens with its details shown but not for editing.

import {
  BANK_GROUP,
  CASH_GROUP,
  amountProblem,
  cancelConfirm,
  parseAmount,
  paymentDraft,
  receiptDraft,
  voucherMessages as vm,
} from '@qi/core';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api, unwrap } from '../../api.ts';
import { ConfirmDelete, MessageDialog } from '../../components/Dialog.tsx';
import { FieldRow, inputClass } from '../../components/master.tsx';
import { CashBankList } from './lists.tsx';
import { PrintVoucher } from './print.tsx';
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

type Kind = 'receipt' | 'payment';
type Form = {
  bank: boolean;
  date: string;
  vchrNo: string;
  /** The cash/bank account (Dr on a receipt, Cr on a payment). */
  account: string;
  /** The party (Cr on a receipt, Dr on a payment). */
  party: string;
  amount: string;
  ref: string;
  narration: string;
  editId: string | null;
};
type Errors = { account?: string; party?: string; amount?: string };

export function CashBankTab({ kind }: { kind: Kind }) {
  const receipt = kind === 'receipt';
  const word = receipt ? 'Receipt' : 'Payment';
  const typeOf = (bank: boolean) => (receipt ? (bank ? 'BNK' : 'RCP') : bank ? 'BPAY' : 'PAY');
  const queryClient = useQueryClient();
  const { me, ledgers, ready } = useVoucherData();
  const draftKey = `${me?.bookId}:${kind}`;

  const blank = (): Form => ({
    bank: false,
    date: defaultVoucherDate(me?.fyFrom, me?.fyTo),
    vchrNo: '',
    account: '',
    party: '',
    amount: '',
    ref: '',
    narration: '',
    editId: null,
  });
  const [form, setForm] = useState<Form | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [list, setList] = useState<VoucherRow[] | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);

  // First load: the unsaved entry left on this tab, or a fresh one with the next cash number.
  useEffect(() => {
    if (!me || form) return;
    const kept = loadDraft<Form>(draftKey);
    if (kept) setForm(kept);
    else void fetchNextNo(typeOf(false)).then((vchrNo) => setForm({ ...blank(), vchrNo }));
  }, [me]);
  useEffect(() => {
    if (form && me) saveDraft(draftKey, form);
  }, [form]);

  if (!ready || !form) return <VoucherPage tab={kind}>{null}</VoucherPage>;

  const set = (patch: Partial<Form>) => setForm((f) => ({ ...f!, ...patch }));
  const accounts = ofGroup(ledgers!, form.bank ? BANK_GROUP : CASH_GROUP);
  const inEdit = !!form.editId;

  const clearForm = async () => {
    const vchrNo = await fetchNextNo(typeOf(false));
    setErrors({});
    setForm({ ...blank(), vchrNo });
  };

  const switchType = async (toBank: boolean) => {
    if (toBank === form.bank || inEdit) return;
    const vchrNo = await fetchNextNo(typeOf(toBank));
    set({ bank: toBank, account: '', vchrNo });
  };

  /** All three checks at once, as MDA's form validator shows them. */
  const validate = () => {
    const e: Errors = {};
    if (!form.account) e.account = vm.selectAccount;
    if (!form.party) e.party = vm.selectParty;
    const a = amountProblem(form.amount, vm.validAmount);
    if (a) e.amount = a;
    setErrors(e);
    return !e.account && !e.party && !e.amount;
  };

  const draft = () => {
    const amount = parseAmount(form.amount);
    return receipt
      ? receiptDraft(form.bank, form.account, form.party, amount, form.vchrNo)
      : paymentDraft(form.bank, form.account, form.party, amount, form.vchrNo);
  };

  const fail = (err: unknown) =>
    setMessage({ kind: 'error', title: [word, 'Error'], text: errorText(err) });

  const save = async () => {
    if (!validate()) return;
    setBusy(true);
    try {
      const d = draft();
      const common = {
        date: form.date,
        partyCode: d.partyCode,
        refNo: form.ref.trim(),
        narration: form.narration.trim(),
        lines: d.lines,
      };
      if (inEdit) {
        await unwrap(api.api.vouchers[':id'].$put({ param: { id: form.editId! }, json: common }));
        setMessage({ kind: 'ok', title: [word, 'Updated'], text: vm.updated(word, form.vchrNo) });
      } else {
        await unwrap(
          api.api.vouchers.$post({
            json: { ...common, vchrType: d.vchrType, vchrNo: form.vchrNo, bills: d.bills },
          }),
        );
        setMessage({ kind: 'ok', title: [word, 'Saved'], text: vm.saved(word, form.vchrNo) });
      }
      await queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      await clearForm();
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
      await clearForm();
    } catch (err) {
      fail(err);
    }
    setConfirm(false);
    setBusy(false);
  };

  const view = async () => {
    try {
      setList(await fetchList(receipt ? ['RCP', 'BNK'] : ['PAY', 'BPAY']));
    } catch (err) {
      fail(err);
    }
  };

  /** Opens a voucher (`_loadRow`): the account must be in the cash/bank list of its type, the
   *  party in all ledgers; a cancelled one opens without its id, so it can't be edited. */
  const open = async (row: VoucherRow) => {
    setList(null);
    const lines = await fetchLines(row.id);
    const bank = row.vchrType === typeOf(true);
    const inList = (code: string | undefined, list: { accCode: string }[]) =>
      code && list.some((l) => l.accCode === code) ? code : '';
    const dr = lines.find((l) => l.dr > 0)?.accCode;
    const cr = lines.find((l) => l.cr > 0)?.accCode;
    const cashList = ofGroup(ledgers!, bank ? BANK_GROUP : CASH_GROUP);
    setErrors({});
    setForm({
      bank,
      date: row.vchrDate,
      vchrNo: row.vchrNo,
      account: inList(receipt ? dr : cr, cashList),
      party: inList(receipt ? cr : dr, ledgers!),
      amount: row.netAmount.toFixed(2),
      ref: row.refNo,
      narration: row.narration,
      editId: row.status === 'Cancelled' ? null : row.id,
    });
  };

  const chip = (bank: boolean) => {
    const on = form.bank === bank;
    return (
      <button
        type="button"
        aria-pressed={on}
        onClick={() => void switchType(bank)}
        className={`flex h-11 flex-1 cursor-pointer items-center justify-center border-[1.5px] px-4 text-sm font-semibold sm:flex-none ${
          on ? 'border-foreground bg-foreground text-card' : 'border-border bg-card text-foreground'
        }`}
      >
        {bank ? `Bank ${word}` : `Cash ${word}`}
      </button>
    );
  };

  return (
    <>
      <VoucherPage tab={kind}>
        <div className="flex flex-1 flex-col gap-1">
          <div className="mb-2 flex items-center gap-3">
            <SectionLabel>
              {inEdit ? `Edit ${word}  •  ${form.vchrNo}` : `${word} Voucher`}
            </SectionLabel>
            {inEdit && (
              <span className="bg-accent px-2 py-0.5 text-xs font-semibold text-primary-text">
                {form.bank ? `Bank ${word}` : `Cash ${word}`}
              </span>
            )}
          </div>
          <FieldRow id="cb-type" label="Type" required>
            <div className="flex gap-2.5">
              {chip(false)}
              {chip(true)}
            </div>
          </FieldRow>
          <div className="grid grid-cols-2 gap-x-6 max-md:grid-cols-1">
            <FieldRow id="cb-no" label="Voucher No">
              <ReadBox text={form.vchrNo || '…'} />
            </FieldRow>
            <FieldRow id="cb-date" label="Date" required>
              <DateBox
                id="cb-date"
                value={form.date}
                min={me!.fyFrom}
                max={me!.fyTo}
                onChange={(date) => set({ date })}
              />
            </FieldRow>
          </div>
          <FieldRow
            id="cb-account"
            label={receipt ? 'Account (Dr)' : 'Account (Cr)'}
            required
            error={errors.account}
          >
            <Select
              id="cb-account"
              value={form.account}
              options={ledgerOptions(accounts)}
              placeholder={accounts.length ? vm.selectAccount : vm.noAccounts(form.bank)}
              error={errors.account}
              onChange={(account) => {
                set({ account });
                setErrors((x) => ({ ...x, account: undefined }));
              }}
            />
          </FieldRow>
          <FieldRow
            id="cb-party"
            label={receipt ? 'Received From (Cr)' : 'Paid To (Dr)'}
            required
            error={errors.party}
          >
            <Select
              id="cb-party"
              value={form.party}
              options={ledgerOptions(ledgers!)}
              placeholder="Select party / account"
              error={errors.party}
              onChange={(party) => {
                set({ party });
                setErrors((x) => ({ ...x, party: undefined }));
              }}
            />
          </FieldRow>
          <FieldRow id="cb-amount" label="Amount (₹)" required error={errors.amount}>
            <AmountBox
              id="cb-amount"
              value={form.amount}
              error={errors.amount}
              onChange={(amount) => {
                set({ amount });
                setErrors((x) => ({ ...x, amount: undefined }));
              }}
            />
          </FieldRow>
          <FieldRow id="cb-ref" label={receipt ? 'Reference No' : 'Cheque / Ref No'}>
            <input
              id="cb-ref"
              value={form.ref}
              placeholder={
                receipt ? 'Cheque / NEFT / UTR reference' : 'Cheque number or reference (optional)'
              }
              autoComplete="off"
              onChange={(e) => set({ ref: e.target.value })}
              className={inputClass()}
            />
          </FieldRow>
          <FieldRow id="cb-narration" label="Narration">
            <textarea
              id="cb-narration"
              rows={2}
              value={form.narration}
              placeholder="Enter narration..."
              onChange={(e) => set({ narration: e.target.value })}
              className="w-full resize-none field-box px-3 py-2 text-base text-foreground outline-none focus-visible:outline-none"
            />
          </FieldRow>
        </div>
        <div className="mt-3">
          <VoucherButtons
            removeLabel="Remove"
            canRemove={inEdit}
            saveLabel={inEdit ? 'Update' : 'Save'}
            busy={busy}
            onView={() => void view()}
            onRemove={() => setConfirm(true)}
            onPrint={() => setPrinting(true)}
            onClear={() => void clearForm()}
            onSave={() => void save()}
          />
        </div>
      </VoucherPage>

      <CashBankList
        kind={kind}
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
      <PrintVoucher
        kind={kind}
        open={printing}
        defaultNo={form.vchrNo}
        onDone={() => setPrinting(false)}
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
