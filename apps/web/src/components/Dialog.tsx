// A modal on the browser's native <dialog>: it keeps keyboard focus inside and closes on Esc.

import { useEffect, useRef, type ReactNode } from 'react';
import { Heading } from './ledger.tsx';

export function Dialog({
  open,
  onClose,
  title,
  alert = false,
  className = 'w-[480px]',
  children,
}: {
  open: boolean;
  onClose: () => void;
  /** Serif heading, the last word in italics: ['Delete', 'Company']. */
  title: [string, string];
  /** A confirmation (announced as an alert dialog). */
  alert?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      role={alert ? 'alertdialog' : 'dialog'}
      aria-label={title.join(' ')}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      className={`relative m-auto max-w-[calc(100%-48px)] border-[1.5px] border-foreground bg-card p-0 text-foreground backdrop:bg-black/50 ${className}`}
    >
      {open && (
        <div className="flex flex-col">
          <div className="px-[26px] pt-[22px]">
            <Heading lead={title[0]} tail={title[1]} className="text-[34px]" />
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}

/** A non-destructive confirmation ("Wants to update this record …?"), confirm button in green. */
export function ConfirmUpdate({
  open,
  title,
  text,
  onCancel,
  onConfirm,
  busy,
}: {
  open: boolean;
  title: [string, string];
  text: string;
  onCancel: () => void;
  onConfirm: () => void;
  busy?: boolean;
}) {
  return (
    <Dialog open={open} onClose={onCancel} title={title} alert>
      <div className="flex flex-col gap-[18px] px-[26px] pb-[26px] pt-[18px]">
        <p className="m-0 whitespace-pre-line text-[15px] leading-[1.55]">{text}</p>
        <div className="flex justify-end gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            autoFocus
            className="flex h-12 cursor-pointer items-center border-[1.5px] border-foreground px-5 text-[15px] font-semibold"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="flex h-12 cursor-pointer items-center bg-primary px-5 text-[15px] font-semibold text-primary-foreground disabled:opacity-70"
          >
            Update
          </button>
        </div>
      </div>
    </Dialog>
  );
}

/** MDA's Cancel / Delete confirmation. */
export function ConfirmDelete({
  open,
  title,
  text,
  confirmLabel = 'Delete',
  onCancel,
  onConfirm,
  busy,
}: {
  open: boolean;
  title: [string, string];
  text: string;
  /** MDA's own label for this master's destructive action ("Delete", "Remove", …). */
  confirmLabel?: string;
  onCancel: () => void;
  onConfirm: () => void;
  busy?: boolean;
}) {
  return (
    <Dialog open={open} onClose={onCancel} title={title} alert>
      <div className="flex flex-col gap-[18px] px-[26px] pb-[26px] pt-[18px]">
        <p className="m-0 whitespace-pre-line text-[15px] leading-[1.55]">{text}</p>
        <div className="flex justify-end gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            autoFocus
            className="flex h-12 cursor-pointer items-center border-[1.5px] border-foreground px-5 text-[15px] font-semibold"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="flex h-12 cursor-pointer items-center bg-destructive px-5 text-[15px] font-semibold text-card disabled:opacity-70"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
