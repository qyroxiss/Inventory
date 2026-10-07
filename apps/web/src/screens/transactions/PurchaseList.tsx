// "Show All Purchase" (`_PurchaseListDialog`): every bill newest first, searchable by bill no,
// supplier or supplier invoice no. Cancelled bills stay listed, struck through and marked.

import { purchaseMessages as pm } from '@qi/core';
import { useState } from 'react';
import { Dialog } from '../../components/Dialog.tsx';
import { dmyDash } from './shared.tsx';

type Row = {
  billNo: string;
  billDate: string;
  suppName: string | null;
  suppInvNo: string;
  itemCount: number;
  netAmount: number;
  status: string;
};

export function PurchaseList({
  open,
  rows,
  onPick,
  onClose,
}: {
  open: boolean;
  rows: Row[];
  onPick: (row: Row) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const needle = q.trim().toLowerCase();
  const shown = needle
    ? rows.filter(
        (r) =>
          r.billNo.toLowerCase().includes(needle) ||
          (r.suppName ?? '').toLowerCase().includes(needle) ||
          r.suppInvNo.toLowerCase().includes(needle),
      )
    : rows;
  const close = () => {
    setQ('');
    onClose();
  };
  const cols =
    'grid grid-cols-[100px_92px_minmax(0,1fr)_96px_54px_104px_84px] gap-3 max-sm:grid-cols-[minmax(0,1fr)_96px] max-sm:gap-2';
  return (
    <Dialog open={open} onClose={close} title={['All', 'Purchases']} className="w-[860px]">
      <span className="absolute right-[26px] top-[30px] font-mono text-xs text-muted-foreground">
        {shown.length} bill{shown.length === 1 ? '' : 's'}
      </span>
      <div className="px-[26px] pt-3 max-sm:px-4">
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by bill no, supplier or supplier invoice no"
          aria-label="Search"
          className="h-11 w-full field-box px-3 text-base outline-none focus-visible:outline-none"
        />
      </div>
      <div
        className={`${cols} mt-3 border-y border-border px-[26px] py-2.5 font-mono text-xs uppercase tracking-[0.06em] text-muted-foreground max-sm:px-4`}
      >
        <span className="max-sm:hidden">Bill No</span>
        <span className="max-sm:hidden">Date</span>
        <span>Supplier</span>
        <span className="max-sm:hidden">Supp. Inv</span>
        <span className="max-sm:hidden">Items</span>
        <span className="text-right">Net</span>
        <span className="max-sm:hidden" />
      </div>
      <div className="h-[46vh] overflow-y-auto max-sm:h-auto max-sm:max-h-[50vh]">
        {shown.length === 0 && (
          <p className="m-0 px-[26px] py-8 text-center text-sm text-muted-foreground">
            {pm.noPurchases}
          </p>
        )}
        {shown.map((r) => {
          const cancelled = r.status === 'Cancelled';
          const strike = cancelled ? 'text-muted-foreground line-through' : '';
          return (
            <button
              key={r.billNo}
              type="button"
              onClick={() => {
                setQ('');
                onPick(r);
              }}
              className={`${cols} min-h-11 w-full cursor-pointer items-center border-b border-border px-[26px] text-left text-sm hover:bg-accent max-sm:px-4`}
            >
              <span className={`font-mono text-xs font-semibold max-sm:hidden ${strike}`}>
                {r.billNo}
              </span>
              <span className="font-mono text-xs text-muted-foreground max-sm:hidden">
                {dmyDash(r.billDate)}
              </span>
              <span className="truncate">
                <span className="hidden font-mono text-xs max-sm:inline">{r.billNo} · </span>
                {r.suppName ?? '-'}
              </span>
              <span className="truncate text-muted-foreground max-sm:hidden">{r.suppInvNo}</span>
              <span className="text-muted-foreground max-sm:hidden">{r.itemCount}</span>
              <span className={`text-right font-mono font-semibold ${strike}`}>
                {r.netAmount.toFixed(2)}
              </span>
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
