// "+ New" beside every ledger box (user's request, 2026-11-10) and every item box on the
// Transactions pages (same day): it opens the Ledger Creation or Stock Item page in place of the
// current page. The page underneath stays loaded (only hidden), so everything typed there is
// kept. Back returns to it unchanged; Save returns to it with the new ledger or item picked in
// the box the button belongs to.

import { useLocation } from '@tanstack/react-router';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { PageAccessProvider, useAccess } from '../access.tsx';
import { LedgerCreationScreen } from '../screens/masters/LedgerCreationScreen.tsx';
import { StockItemScreen } from '../screens/masters/StockItemScreen.tsx';

type Request = {
  kind: 'ledger' | 'item';
  /** A new ledger's starting group (Sundry Creditors for a supplier, and so on). */
  under?: string;
  /** Called with the new record's code once it is saved. */
  onCreated?: (code: string) => void;
};

const Ctx = createContext<(r: Request) => void>(() => {});

/** Wraps the main area: shows Ledger Creation or Stock Item over the page when asked. */
export function NewLedgerHost({ children }: { children: ReactNode }) {
  const [req, setReq] = useState<Request | null>(null);
  /** The button that opened it, given the cursor back on return. */
  const from = useRef<HTMLElement | null>(null);
  // Going to another page from the menu closes it.
  const { pathname } = useLocation();
  useEffect(() => setReq(null), [pathname]);
  const back = (then?: () => void) => {
    setReq(null);
    requestAnimationFrame(() => {
      from.current?.focus();
      then?.();
    });
  };
  const embedded = req && {
    onBack: () => back(),
    onCreated: (code: string) => back(() => req.onCreated?.(code)),
  };
  return (
    <Ctx.Provider
      value={(r) => {
        from.current = document.activeElement as HTMLElement | null;
        setReq(r);
      }}
    >
      <div className={req ? 'hidden' : 'contents'}>{children}</div>
      {req?.kind === 'ledger' && (
        <LedgerCreationScreen embedded={{ ...embedded!, under: req.under }} />
      )}
      {req?.kind === 'item' && (
        // Its Save follows Stock Item's own permission, not the bill's underneath.
        <PageAccessProvider page="Stock Item">
          <StockItemScreen embedded={embedded!} />
        </PageAccessProvider>
      )}
    </Ctx.Provider>
  );
}

export const useNewMaster = () => useContext(Ctx);

function NewButton({
  label,
  tall,
  onClick,
}: {
  label: string;
  tall?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      tabIndex={-1}
      title={`Create a ${label}`}
      aria-label={label === 'new ledger' ? 'New ledger' : 'New item'}
      onClick={onClick}
      className={`flex flex-none cursor-pointer items-center justify-center gap-1 whitespace-nowrap border-[1.5px] border-foreground px-2.5 text-sm font-semibold hover:bg-accent ${tall ? 'h-[42px]' : 'h-[34px]'}`}
    >
      <span aria-hidden="true" className="text-base leading-none">
        +
      </span>
      New
    </button>
  );
}

/** The "+ New" button beside a ledger box. */
export function NewLedgerButton({
  under,
  onCreated,
  tall,
}: {
  under?: string;
  onCreated: (accCode: string) => void;
  /** The voucher screens' taller boxes. */
  tall?: boolean;
}) {
  const open = useNewMaster();
  // Role Permissions: only for someone who may open Ledger Creation.
  if (!useAccess().view('Ledger Creation')) return null;
  return (
    <NewButton
      label="new ledger"
      tall={tall}
      onClick={() => open({ kind: 'ledger', under, onCreated })}
    />
  );
}

/** The "+ New" button beside an item box: opens Masters › Stock Item. */
export function NewItemButton({ onCreated }: { onCreated: (code: string) => void }) {
  const open = useNewMaster();
  // Role Permissions: only for someone who may open Stock Item.
  if (!useAccess().view('Stock Item')) return null;
  return <NewButton label="new item" onClick={() => open({ kind: 'item', onCreated })} />;
}
