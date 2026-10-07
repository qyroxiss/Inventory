// The View lists of the Accounting Vouchers screen (accounting_vouchers_page.dart:722-1032 and
// 2436-2585). Cancelled vouchers stay listed, struck through or marked; picking one loads it.

import { formatDmy, voucherMessages } from '@qi/core';
import { useState } from 'react';
import { Dialog } from '../../components/Dialog.tsx';
import type { VoucherRow } from './shared.tsx';

const CLOSE =
  'flex h-11 cursor-pointer items-center border-[1.5px] border-foreground px-[18px] text-sm font-semibold';

/** Receipt / Payment Vouchers: a Cash · Bank · All filter, then the vouchers newest first. */
export function CashBankList({
  kind,
  open,
  rows,
  onPick,
  onClose,
}: {
  kind: 'receipt' | 'payment';
  open: boolean;
  rows: VoucherRow[];
  onPick: (row: VoucherRow) => void;
  onClose: () => void;
}) {
  const [filter, setFilter] = useState<'Cash' | 'Bank' | 'All'>('All');
  const receipt = kind === 'receipt';
  const bankType = receipt ? 'BNK' : 'BPAY';
  const cashType = receipt ? 'RCP' : 'PAY';
  const shown = rows.filter((r) =>
    filter === 'Cash'
      ? r.vchrType === cashType
      : filter === 'Bank'
        ? r.vchrType === bankType
        : true,
  );
  const cols =
    'grid grid-cols-[96px_96px_56px_minmax(0,1fr)_minmax(0,1fr)_104px] gap-3 max-sm:grid-cols-[minmax(0,1fr)_96px] max-sm:gap-2';
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={receipt ? ['Receipt', 'Vouchers'] : ['Payment', 'Vouchers']}
      className="w-[860px]"
    >
      <div
        role="radiogroup"
        aria-label="Show"
        className="absolute right-[26px] top-[26px] flex gap-1 max-sm:static max-sm:mx-4 max-sm:mt-3"
      >
        {(['Cash', 'Bank', 'All'] as const).map((f) => (
          <button
            key={f}
            type="button"
            role="radio"
            aria-checked={filter === f}
            onClick={() => setFilter(f)}
            className={`flex h-9 cursor-pointer items-center gap-1.5 px-2.5 text-sm ${filter === f ? 'font-semibold text-primary-text' : 'text-muted-foreground'}`}
          >
            <span
              aria-hidden="true"
              className={`grid size-4 place-items-center rounded-full border-[1.5px] ${filter === f ? 'border-primary-text' : 'border-muted-foreground'}`}
            >
              {filter === f && <span className="size-2 rounded-full bg-primary-text" />}
            </span>
            {f}
          </button>
        ))}
      </div>
      <div
        className={`${cols} mt-3.5 border-y border-border px-[26px] py-2.5 font-mono text-xs uppercase tracking-[0.06em] text-muted-foreground max-sm:px-4`}
      >
        <span className="max-sm:hidden">Voucher No</span>
        <span className="max-sm:hidden">Date</span>
        <span className="max-sm:hidden">Type</span>
        <span>{receipt ? 'Account (Dr)' : 'Account (Cr)'}</span>
        <span className="max-sm:hidden">{receipt ? 'From (Cr)' : 'Paid To (Dr)'}</span>
        <span className="text-right">Amount (₹)</span>
      </div>
      <div className="max-h-[50vh] overflow-y-auto">
        {shown.length === 0 && (
          <p className="m-0 px-[26px] py-8 text-center text-sm text-muted-foreground">
            {receipt ? voucherMessages.noReceipts(filter) : voucherMessages.noPayments(filter)}
          </p>
        )}
        {shown.map((r) => {
          const bank = r.vchrType === bankType;
          const cancelled = r.status === 'Cancelled';
          const cash = receipt ? r.drName : r.crName;
          const party = receipt ? r.crName : r.drName;
          return (
            <button
              key={r.id}
              type="button"
              onClick={() => onPick(r)}
              className={`${cols} min-h-11 w-full cursor-pointer items-center border-b border-border px-[26px] text-left text-sm hover:bg-accent max-sm:px-4`}
            >
              <span
                className={`w-fit px-1.5 py-0.5 font-mono text-xs font-semibold max-sm:hidden ${bank ? 'bg-accent text-primary-text' : 'bg-muted text-foreground'}`}
              >
                {r.vchrNo}
              </span>
              {/* MDA shows the date as stored, yyyy-MM-dd, here (unlike the other list). */}
              <span className="font-mono text-xs text-muted-foreground max-sm:hidden">
                {r.vchrDate}
              </span>
              <span className="text-muted-foreground max-sm:hidden">{bank ? 'Bank' : 'Cash'}</span>
              <span className="truncate">{cash ?? '—'}</span>
              <span className="truncate max-sm:hidden">{party ?? '—'}</span>
              <span
                className={`text-right font-mono font-semibold ${cancelled ? 'text-muted-foreground line-through' : ''}`}
              >
                ₹{r.netAmount.toFixed(2)}
              </span>
            </button>
          );
        })}
      </div>
      <div className="flex justify-end border-t border-border px-[26px] py-3 max-sm:px-4">
        <button type="button" onClick={onClose} className={CLOSE}>
          Close
        </button>
      </div>
    </Dialog>
  );
}

/** Journal Vouchers / Debit Notes / Credit Notes: a search box, then the vouchers newest first. */
export function VoucherList({
  title,
  open,
  rows,
  onPick,
  onClose,
}: {
  title: [string, string];
  open: boolean;
  rows: VoucherRow[];
  onPick: (row: VoucherRow) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const needle = q.trim().toLowerCase();
  const shown = needle
    ? rows.filter(
        (r) =>
          r.vchrNo.toLowerCase().includes(needle) ||
          (r.partyName ?? '').toLowerCase().includes(needle) ||
          r.narration.toLowerCase().includes(needle) ||
          r.vchrDate.includes(q.trim()),
      )
    : rows;
  const cols =
    'grid grid-cols-[100px_96px_minmax(0,1fr)_110px_84px] gap-3 max-sm:grid-cols-[minmax(0,1fr)_96px] max-sm:gap-2';
  return (
    <Dialog open={open} onClose={onClose} title={title} className="w-[740px]">
      <span className="absolute right-[26px] top-[30px] font-mono text-xs text-muted-foreground">
        {shown.length} voucher{shown.length === 1 ? '' : 's'}
      </span>
      <div className="px-[26px] pt-3 max-sm:px-4">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by number, party, date or narration"
          aria-label="Search"
          className="h-11 w-full field-box px-3 text-base outline-none focus-visible:outline-none"
        />
      </div>
      <div
        className={`${cols} mt-3 border-y border-border px-[26px] py-2.5 font-mono text-xs uppercase tracking-[0.06em] text-muted-foreground max-sm:px-4`}
      >
        <span className="max-sm:hidden">Voucher</span>
        <span className="max-sm:hidden">Date</span>
        <span>Party / Narration</span>
        <span className="text-right">Amount</span>
        <span className="max-sm:hidden" />
      </div>
      <div className="h-[46vh] overflow-y-auto max-sm:h-auto max-sm:max-h-[50vh]">
        {shown.length === 0 && (
          <p className="m-0 px-[26px] py-8 text-center text-sm text-muted-foreground">
            {voucherMessages.noVouchers}
          </p>
        )}
        {shown.map((r) => {
          const cancelled = r.status === 'Cancelled';
          return (
            <button
              key={r.id}
              type="button"
              onClick={() => onPick(r)}
              className={`${cols} min-h-11 w-full cursor-pointer items-center border-b border-border px-[26px] text-left text-sm hover:bg-accent max-sm:px-4`}
            >
              <span
                className={`font-mono text-xs font-semibold max-sm:hidden ${cancelled ? 'text-muted-foreground line-through' : ''}`}
              >
                {r.vchrNo}
              </span>
              <span className="font-mono text-xs text-muted-foreground max-sm:hidden">
                {formatDmy(r.vchrDate)}
              </span>
              <span className="truncate">{r.partyName || r.narration || '—'}</span>
              <span className="text-right font-mono font-semibold">₹{r.netAmount.toFixed(2)}</span>
              <span className="max-sm:hidden">
                {cancelled && (
                  <span className="block border border-destructive/40 bg-destructive-bg px-1.5 py-0.5 text-center text-[11px] font-semibold text-destructive">
                    Cancelled
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
      <div className="flex justify-end border-t border-border px-[26px] py-3 max-sm:px-4">
        <button type="button" onClick={onClose} className={CLOSE}>
          Close
        </button>
      </div>
    </Dialog>
  );
}
