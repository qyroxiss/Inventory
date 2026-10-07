// Shared pieces of the Inventory Masters screens (Unit, Godown, Stock Group, ...), which MDA
// builds the same way: a page header with Back and a breadcrumb, a short form of `Label : field`
// rows, a button bar (Print · View · then Save, or Cancel · Update · Remove while a row is open),
// a View list dialog and a printed list. Each screen supplies its own words and columns.

import { brand } from '@qi/core';
import { useNavigate } from '@tanstack/react-router';
import { useState, type ReactNode, type Ref } from 'react';
import { BackButton } from './BackButton.tsx';
import { Dialog } from './Dialog.tsx';
import { Heading } from './ledger.tsx';

/** A text field's look: the bordered box, plus the red box while it has an error. */
export const inputClass = (error?: string) =>
  `h-[42px] w-full field-box px-3 text-base text-foreground outline-none focus-visible:outline-none ${error ? 'field-error' : ''}`;

const BAR_BTN =
  'flex h-12 cursor-pointer items-center border-[1.5px] border-foreground px-5 text-[15px] font-semibold disabled:opacity-60 disabled:cursor-not-allowed max-sm:flex-[1_1_40%] max-sm:justify-center';
const MAIN_BTN =
  'flex h-12 min-w-[220px] cursor-pointer items-center justify-between gap-4 bg-primary px-[22px] text-[15px] font-semibold text-primary-foreground disabled:cursor-wait disabled:opacity-70 max-sm:order-last max-sm:w-full max-sm:min-w-0';

/** The ruled page with Back (to Masters), "Masters › <crumb>", the pill and the heading. */
export function MasterPage({
  crumb,
  title,
  pill = 'Inventory Master',
  children,
}: {
  crumb: string;
  title: [string, string];
  pill?: string;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  return (
    <section className="ledger-paper relative flex min-h-full flex-col gap-6 border border-border pb-8 pl-[76px] pr-12 pt-6 print:hidden max-md:px-4 max-md:pb-6 max-md:pt-4">
      <div
        aria-hidden="true"
        className="absolute inset-y-0 left-[46px] w-px bg-ledger-margin max-md:hidden"
      />
      <div
        aria-hidden="true"
        className="absolute inset-y-0 left-[50px] w-px bg-ledger-margin max-md:hidden"
      />
      <div className="flex flex-col gap-2 border-b-2 border-foreground pb-4">
        <div className="flex flex-wrap items-center gap-4 max-md:gap-x-3 max-md:gap-y-2">
          <BackButton
            onClick={() =>
              void navigate({ to: '/app/section/$section', params: { section: 'masters' } })
            }
          />
          <span className="font-mono text-xs uppercase tracking-[0.12em] text-muted-foreground">
            Masters&nbsp;&nbsp;›&nbsp;&nbsp;{crumb}
          </span>
          <span className="flex-1" />
          <span className="rounded-full border border-primary-text/30 bg-accent px-2.5 py-1 text-[11px] font-semibold text-primary-text">
            {pill}
          </span>
        </div>
        <Heading
          as="h1"
          lead={title[0]}
          tail={title[1]}
          className="text-[46px] max-md:text-[34px]"
        />
      </div>
      <div className="flex flex-col gap-6">{children}</div>
    </section>
  );
}

/** The form block: its section title ("UNIT DETAILS") and its rows. `pairs` lays the rows out
 *  two to a line, in reading order (Stock Item: Code | Name, Print Name | Sub Group, ...); on
 *  tablets and phones they go back to one column. */
export function FormBlock({
  heading,
  pairs,
  children,
}: {
  heading: string;
  pairs?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`flex flex-col gap-1 ${pairs ? 'max-w-[940px]' : 'max-w-[460px]'}`}>
      <h2 className="m-0 mb-1.5 font-mono text-xs font-medium tracking-[0.12em] text-primary-text">
        {heading}
      </h2>
      {pairs ? (
        <div className="grid grid-cols-2 gap-x-10 gap-y-1 max-lg:grid-cols-1">{children}</div>
      ) : (
        children
      )}
    </div>
  );
}

/** One `Label : field` row; on phones the label sits above the field. */
export function FieldRow({
  id,
  label,
  required,
  error,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[140px_14px_minmax(0,1fr)] items-start gap-1 max-sm:grid-cols-1 max-sm:gap-0">
      <label htmlFor={id} className="pt-3 text-sm text-muted-foreground max-sm:pt-2">
        {label}
        {required && <span className="text-destructive"> *</span>}
      </label>
      <span aria-hidden="true" className="pt-3 text-sm text-muted-foreground max-sm:hidden">
        :
      </span>
      <div className="flex flex-col gap-1">
        {children}
        {error && <span className="text-[13px] text-destructive">{error}</span>}
      </div>
    </div>
  );
}

/** Print · View on the left; Save, or Cancel · Update · Remove while a row is open (MDA). */
export function ActionBar({
  wide,
  editing,
  busy,
  saveLabel,
  actionRef,
  onView,
  onCancel,
  onSave,
  onUpdate,
  onRemove,
}: {
  /** As wide as a `pairs` form. */
  wide?: boolean;
  editing: boolean;
  busy: boolean;
  saveLabel: string;
  /** Enter on the last field moves here (Save, or Update while editing). */
  actionRef: Ref<HTMLButtonElement>;
  onView: () => void;
  onCancel: () => void;
  onSave: () => void;
  onUpdate: () => void;
  onRemove: () => void;
}) {
  const arrow = (
    <span aria-hidden="true" className="text-xl">
      →
    </span>
  );
  return (
    <div
      className={`flex flex-none items-center gap-2.5 border-t-[3px] border-double border-foreground bg-background py-3.5 max-sm:flex-wrap ${wide ? 'max-w-[940px]' : 'max-w-[640px]'}`}
    >
      <button type="button" onClick={() => window.print()} className={BAR_BTN}>
        Print
      </button>
      <button type="button" onClick={onView} className={BAR_BTN}>
        View
      </button>
      <span className="flex-1 max-sm:hidden" />
      {editing ? (
        <>
          <button type="button" onClick={onCancel} className={BAR_BTN}>
            Cancel
          </button>
          <button
            type="button"
            ref={actionRef}
            onClick={onUpdate}
            disabled={busy}
            className={MAIN_BTN}
          >
            <span>Update</span>
            {arrow}
          </button>
          <button
            type="button"
            onClick={onRemove}
            className={`${BAR_BTN} border-destructive text-destructive`}
          >
            Remove
          </button>
        </>
      ) : (
        <button type="button" ref={actionRef} onClick={onSave} disabled={busy} className={MAIN_BTN}>
          <span>{saveLabel}</span>
          {arrow}
        </button>
      )}
    </div>
  );
}

export type Column<T> = {
  head: string;
  /** CSS grid track, e.g. '90px' or 'minmax(0,1fr)'. */
  width: string;
  cell: (row: T) => ReactNode;
  /** Shown in mono, muted (codes). */
  mono?: boolean;
  /** Dropped on phones. */
  wide?: boolean;
};

/**
 * MDA's View list ("<Title> — N record(s)"). Nothing is highlighted at first; ↑ ↓ highlight,
 * Enter or a double-click opens the highlighted row, Esc closes. On touch screens, tapping the
 * highlighted row again stands in for the double-click.
 */
export function RecordList<T>({
  title,
  noneFound,
  hint,
  open,
  rows,
  rowKey,
  columns,
  onPick,
  onClose,
}: {
  title: [string, string];
  noneFound: string;
  hint: string;
  open: boolean;
  rows: T[];
  rowKey: (row: T) => string;
  columns: Column<T>[];
  onPick: (row: T) => void;
  onClose: () => void;
}) {
  const [hi, setHi] = useState<number | null>(null);
  const n = rows.length;
  const tracks = columns.map((c) => c.width).join(' ');
  const phoneTracks = columns
    .filter((c) => !c.wide)
    .map((c) => c.width)
    .join(' ');
  const grid = { '--cols': tracks, '--cols-sm': phoneTracks } as React.CSSProperties;
  const gridClass =
    'grid gap-4 [grid-template-columns:var(--cols)] max-sm:[grid-template-columns:var(--cols-sm)] max-sm:gap-2.5';
  const close = () => {
    setHi(null);
    onClose();
  };
  const choose = (row: T) => {
    setHi(null);
    onPick(row);
  };
  return (
    <Dialog open={open} onClose={close} title={title} className="w-[640px]">
      <span className="absolute right-[26px] top-[30px] font-mono text-xs text-muted-foreground">
        {n} record{n === 1 ? '' : 's'}
      </span>
      <div
        style={grid}
        className={`${gridClass} mt-3.5 border-y border-border px-[26px] py-2.5 font-mono text-xs uppercase tracking-[0.08em] text-muted-foreground outline-none max-sm:px-4`}
        tabIndex={0}
        autoFocus
        onKeyDown={(e) => {
          if (!n) return;
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHi((h) => Math.min((h ?? -1) + 1, n - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHi((h) => Math.max((h ?? n) - 1, 0));
          } else if (e.key === 'Enter' && hi !== null) {
            e.preventDefault();
            choose(rows[hi]!);
          }
        }}
      >
        {columns.map((c) => (
          <span key={c.head} className={c.wide ? 'max-sm:hidden' : ''}>
            {c.head}
          </span>
        ))}
      </div>
      <div className="max-h-[50vh] overflow-y-auto">
        {n === 0 && <p className="m-0 px-[26px] py-4 text-sm text-muted-foreground">{noneFound}</p>}
        {rows.map((row, k) => (
          <div
            key={rowKey(row)}
            style={grid}
            ref={(el) => {
              if (k === hi) el?.scrollIntoView({ block: 'nearest' });
            }}
            onClick={() => setHi(k)}
            onDoubleClick={() => choose(row)}
            onPointerUp={(e) => {
              if (e.pointerType === 'touch' && k === hi) choose(row);
            }}
            className={`${gridClass} min-h-[46px] w-full cursor-pointer items-center border-b border-border px-[26px] text-left text-[15px] hover:bg-accent max-sm:px-4 ${k === hi ? 'bg-accent font-semibold' : ''}`}
          >
            {columns.map((c) => (
              <span
                key={c.head}
                className={`truncate ${c.mono ? 'font-mono text-xs text-muted-foreground' : ''} ${c.wide ? 'max-sm:hidden' : ''}`}
              >
                {c.cell(row)}
              </span>
            ))}
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between border-t border-border px-[26px] py-3 max-sm:px-4">
        <span className="font-mono text-xs text-muted-foreground pointer-coarse:hidden">
          {hint}
        </span>
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

/** Print: MDA's list sheet — its title, "Total Records: N", then the columns. */
export function PrintList<T>({
  title,
  rows,
  rowKey,
  columns,
}: {
  title: string;
  rows: T[];
  rowKey: (row: T) => string;
  columns: Pick<Column<T>, 'head' | 'cell'>[];
}) {
  const now = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  const stamp = `${p(now.getDate())}/${p(now.getMonth() + 1)}/${now.getFullYear()}  ${p(now.getHours())}:${p(now.getMinutes())}`;
  return (
    <div className="hidden min-h-[calc(100vh-80px)] flex-col bg-white p-10 font-sans text-black print:flex">
      <div className="mb-[22px] px-4 pb-3.5">
        <div className="text-[18pt] font-bold">{title}</div>
        <div className="mt-1.5 text-[11pt]">Total Records: {rows.length}</div>
      </div>
      <table className="w-full border-collapse text-[10pt]">
        <thead>
          <tr className="border-b-2 border-black bg-neutral-200 text-left">
            {columns.map((c) => (
              <th key={c.head} className="px-2 py-1.5 font-bold">
                {c.head}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)} className="border-b border-neutral-300">
              {columns.map((c) => (
                <td key={c.head} className="px-2 py-1.5">
                  {c.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex-1" />
      <hr className="border-neutral-300" />
      <div className="flex justify-between pt-1 text-[8pt] text-neutral-500">
        <span>Printed by {brand.appName}</span>
        <span>{stamp}</span>
      </div>
    </div>
  );
}
