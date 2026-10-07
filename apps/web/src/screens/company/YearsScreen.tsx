// Manage Years — MDA's "Manage Company Years" page (company_year_page.dart), approved design M2
// (docs/design/MASTERS-SCREENS.md). Back returns to Company & Year Setup (MDA exits the app; Q-01).
// Added on the owner's request: the page can open with a company chosen (?company=), Year Name
// offers the years around today, and a year range fills From 01/04 and To 31/03 (still editable).

import {
  formatDmy,
  fullYearName,
  parseDate,
  yearChoices,
  yearDates,
  yearFieldErrors,
  yearMessages,
} from '@qi/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useRef, useState } from 'react';
import { ApiError, api, unwrap } from '../../api.ts';
import { AppHeader } from '../../components/AppHeader.tsx';
import { BackButton } from '../../components/BackButton.tsx';
import { ConfirmDelete } from '../../components/Dialog.tsx';
import { Heading } from '../../components/ledger.tsx';
import { SearchSelect } from '../../components/SearchSelect.tsx';
import { toast } from '../../components/Toast.tsx';
import type { IndexCompany, IndexYear } from '../books/types.ts';

type Errors = { yearName?: string; fromDate?: string; toDate?: string };

const LABEL = 'font-mono text-xs uppercase tracking-[0.08em] text-muted-foreground';
const SECTION = 'font-mono text-xs tracking-[0.12em] text-primary-text';

export function YearsScreen() {
  const navigate = useNavigate();
  const search = useSearch({ from: '/years' });
  const queryClient = useQueryClient();
  const index = useQuery({
    queryKey: ['book-index'],
    queryFn: () => unwrap(api.api['book-index'].$get()),
  });
  const [selId, setSelId] = useState<string | null>(search.company ?? null);
  const [yearName, setYearName] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [toDelete, setToDelete] = useState<IndexYear | null>(null);
  const fromRef = useRef<HTMLInputElement>(null);
  const rowRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const focusName = () => setTimeout(() => document.getElementById('y-name')?.focus(), 0);

  const companies = index.data ?? [];
  const sel = companies.find((c) => c.id === selId) ?? null;
  const choices = yearChoices(
    new Date(),
    (sel?.years ?? []).map((y) => y.yearName),
  ).map((n) => ({ value: n, label: n }));
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ['book-index'], refetchType: 'all' });

  const pick = (c: IndexCompany) => {
    setSelId(c.id);
    focusName();
  };

  /** A chosen or typed name; a year range fills the dates, which stay editable. */
  const nameChosen = (v: string) => {
    const name = fullYearName(v);
    setYearName(name);
    setErrors((x) => ({ ...x, yearName: undefined }));
    const d = yearDates(name);
    if (!d) return;
    setFrom(d.from);
    setTo(d.to);
    setErrors((x) => ({ ...x, fromDate: undefined, toDate: undefined }));
  };

  async function save() {
    const e = yearFieldErrors({ yearName, fromDate: from, toDate: to }) as Errors;
    setErrors(e);
    if (Object.keys(e).length) return;
    if (!sel) return toast(yearMessages.selectCompany, 'error');
    setBusy(true);
    try {
      const name = yearName.trim();
      await unwrap(
        api.api.companies[':companyId'].years.$post({
          param: { companyId: sel.id },
          json: { yearName: name, fromDate: from.trim(), toDate: to.trim() },
        }),
      );
      await refresh();
      setYearName('');
      setFrom('');
      setTo('');
      toast(yearMessages.added(name, sel.compName));
      focusName();
    } catch (err) {
      if (
        err instanceof ApiError &&
        err.status === 422 &&
        Object.keys(err.body.fieldErrors ?? {}).length
      ) {
        setErrors(err.body.fieldErrors as Errors);
      } else {
        toast(err instanceof ApiError ? err.message : `Error: ${String(err)}`, 'error');
      }
    }
    setBusy(false);
  }

  async function remove() {
    if (!toDelete) return;
    setBusy(true);
    try {
      await unwrap(api.api.years[':yearId'].$delete({ param: { yearId: toDelete.id } }));
      await refresh();
    } catch (err) {
      toast(`Error: ${err instanceof Error ? err.message : String(err)}`, 'error');
    }
    setToDelete(null);
    setBusy(false);
  }

  return (
    <div className="flex h-app-screen min-h-[600px] flex-col">
      <AppHeader />
      <div className="flex min-h-0 flex-1 max-lg:flex-col max-lg:overflow-y-auto">
        <section
          aria-label="Select Company"
          className="ledger-paper relative flex min-h-0 flex-[0_0_520px] flex-col gap-[18px] border-r border-border pb-6 pl-[120px] pr-10 pt-7 max-lg:flex-none max-lg:border-b max-lg:border-r-0 max-lg:px-6 max-sm:px-4 max-sm:pt-4"
        >
          <div
            aria-hidden="true"
            className="absolute inset-y-0 left-[84px] w-px bg-ledger-margin max-lg:hidden"
          />
          <div
            aria-hidden="true"
            className="absolute inset-y-0 left-[89px] w-px bg-ledger-margin max-lg:hidden"
          />
          <BackButton
            onClick={() => void navigate({ to: '/', search: selId ? { company: selId } : {} })}
          />
          <div className="flex flex-col gap-2">
            <span className={SECTION}>SELECT COMPANY</span>
            <Heading
              as="h1"
              lead="Manage Company"
              tail="Years"
              className="text-[38px] max-md:text-[32px]"
            />
          </div>
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="grid grid-cols-[28px_minmax(0,1fr)_48px] gap-2.5 border-b-2 border-foreground px-2.5 pb-2.5 font-mono text-xs uppercase tracking-[0.08em] text-muted-foreground">
              <span />
              <span>Company Name</span>
              <span className="text-right">Years</span>
            </div>
            <div
              role="list"
              className="min-h-0 flex-1 overflow-y-auto max-lg:max-h-[40vh] max-lg:flex-none"
            >
              {index.isPending && (
                <p className="m-0 px-2.5 py-6 text-[15px] text-muted-foreground">Loading…</p>
              )}
              {companies.map((c, i) => {
                const on = c.id === selId;
                return (
                  <div
                    key={c.id}
                    role="listitem"
                    className={`border-b border-border ${on ? 'bg-accent' : ''}`}
                  >
                    <button
                      type="button"
                      ref={(el) => {
                        rowRefs.current[i] = el;
                      }}
                      onClick={() => pick(c)}
                      onKeyDown={(e) => {
                        if (e.key === 'ArrowDown') {
                          e.preventDefault();
                          rowRefs.current[Math.min(i + 1, companies.length - 1)]?.focus();
                        } else if (e.key === 'ArrowUp') {
                          e.preventDefault();
                          rowRefs.current[Math.max(i - 1, 0)]?.focus();
                        }
                      }}
                      aria-pressed={on}
                      className="grid min-h-[50px] w-full cursor-pointer grid-cols-[28px_minmax(0,1fr)_48px] items-center gap-2.5 px-2.5 text-left text-base"
                    >
                      <span aria-hidden="true" className="font-mono text-sm text-primary-text">
                        {on ? '=>' : ''}
                      </span>
                      <span className={`truncate ${on ? 'font-semibold' : ''}`}>{c.compName}</span>
                      <span className="text-right font-mono text-[13px] text-muted-foreground">
                        {c.years.length}
                      </span>
                    </button>
                  </div>
                );
              })}
              {index.isSuccess && companies.length === 0 && (
                <p className="m-0 whitespace-pre-line px-2.5 py-6 text-[15px] leading-[1.55] text-muted-foreground">
                  {'No companies found.\nCreate a company first.'}
                </p>
              )}
            </div>
          </div>
        </section>

        <section
          aria-label="Financial years"
          className="flex min-h-0 min-w-0 flex-1 flex-col gap-[26px] pl-14 pr-12 pt-7 max-lg:flex-none max-lg:px-6 max-lg:pb-8 max-sm:px-4"
        >
          <div className="flex flex-col gap-2">
            <span className="font-mono text-xs uppercase tracking-[0.12em] text-muted-foreground">
              {sel ? 'Managing:' : 'Select a company to manage its financial years'}
            </span>
            {sel && <span className="font-serif text-[34px] leading-[1.1]">{sel.compName}</span>}
          </div>

          <div className="flex flex-col gap-3.5 border-b-[3px] border-double border-foreground pb-[22px]">
            <span className={SECTION}>ADD FINANCIAL YEAR</span>
            <div className="grid grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] items-start gap-6 max-md:grid-cols-1 max-md:gap-4">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="y-name" className={LABEL}>
                  Year Name
                </label>
                <SearchSelect
                  id="y-name"
                  value={yearName}
                  options={choices}
                  placeholder="Pick or type, e.g. 2026-2027"
                  freeText
                  tall
                  error={!!errors.yearName}
                  onCommit={nameChosen}
                  onNext={() => fromRef.current?.focus()}
                />
                {errors.yearName && (
                  <span className="text-[13px] text-destructive">{errors.yearName}</span>
                )}
              </div>
              <DateField
                id="y-from"
                label="From Date"
                value={from}
                error={errors.fromDate}
                inputRef={fromRef}
                onChange={(v) => {
                  setFrom(v);
                  setErrors((x) => ({ ...x, fromDate: undefined }));
                }}
              />
              <DateField
                id="y-to"
                label="To Date"
                value={to}
                error={errors.toDate}
                onChange={(v) => {
                  setTo(v);
                  setErrors((x) => ({ ...x, toDate: undefined }));
                }}
              />
              <button
                type="button"
                onClick={save}
                disabled={busy}
                className="mt-[18px] flex h-12 cursor-pointer items-center gap-4 max-md:mt-0 max-md:justify-between bg-primary px-[22px] text-[15px] font-semibold text-primary-foreground disabled:cursor-wait disabled:opacity-70"
              >
                <span>Save Year</span>
                <span aria-hidden="true" className="text-xl">
                  →
                </span>
              </button>
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-3 max-lg:flex-none">
            <span className={SECTION}>FINANCIAL YEARS</span>
            {sel ? (
              <>
                <div className="grid grid-cols-[minmax(0,1fr)_180px_180px_56px] gap-4 border-b-2 max-md:grid-cols-[minmax(0,1fr)_96px_96px_44px] max-md:gap-2 border-foreground px-2.5 pb-2.5 font-mono text-xs uppercase tracking-[0.08em] text-muted-foreground">
                  <span>Year</span>
                  <span>From</span>
                  <span>To</span>
                  <span />
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto max-lg:flex-none">
                  {sel.years.map((y) => (
                    <div
                      key={y.id}
                      className="grid min-h-[50px] grid-cols-[minmax(0,1fr)_180px_180px_56px] items-center gap-4 border-b max-md:grid-cols-[minmax(0,1fr)_96px_96px_44px] max-md:gap-2 border-border px-2.5"
                    >
                      <span className="truncate text-base font-semibold">{y.yearName}</span>
                      <span className="font-mono text-sm">{formatDmy(y.fromDate)}</span>
                      <span className="font-mono text-sm">{formatDmy(y.toDate)}</span>
                      <button
                        type="button"
                        title="Delete"
                        aria-label={`Delete ${y.yearName}`}
                        onClick={() => setToDelete(y)}
                        className="grid size-11 cursor-pointer place-items-center justify-self-end text-destructive"
                      >
                        <svg
                          width="18"
                          height="18"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
                        </svg>
                      </button>
                    </div>
                  ))}
                  {sel.years.length === 0 && (
                    <p className="m-0 px-2.5 py-[22px] text-[15px] text-muted-foreground">
                      No financial years added yet
                    </p>
                  )}
                </div>
              </>
            ) : (
              <p className="m-0 py-[22px] text-[15px] text-muted-foreground">
                Select a company to see its years
              </p>
            )}
          </div>
        </section>
      </div>

      <ConfirmDelete
        open={!!toDelete}
        title={['Delete', 'Year']}
        text={toDelete && sel ? yearMessages.deleteConfirm(toDelete.yearName, sel.compName) : ''}
        onCancel={() => setToDelete(null)}
        onConfirm={remove}
        busy={busy}
      />
    </div>
  );
}

/**
 * MDA's date field: read-only, opens a calendar on click (company_year_page.dart:278-318) and
 * writes dd/MM/yyyy. Here the browser's own calendar is used; Enter or Space opens it too.
 */
function DateField({
  id,
  label,
  value,
  error,
  onChange,
  inputRef,
}: {
  id: string;
  label: string;
  value: string;
  error?: string;
  onChange: (v: string) => void;
  inputRef?: React.Ref<HTMLInputElement>;
}) {
  const picker = useRef<HTMLInputElement>(null);
  const open = () => {
    const p = picker.current;
    if (!p) return;
    // Start from the date already entered; an empty box opens on today (MDA's initialDate). Left
    // empty so that picking today still counts as a change.
    p.value = parseDate(value) ?? '';
    try {
      p.showPicker();
    } catch {
      p.focus();
    }
  };
  return (
    <div className="relative flex flex-col gap-1.5">
      <label htmlFor={id} className={LABEL}>
        {label}
      </label>
      <input
        id={id}
        ref={inputRef}
        readOnly
        value={value}
        placeholder="dd/mm/yyyy"
        aria-invalid={error ? true : undefined}
        onClick={open}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            open();
          }
        }}
        className={`h-11 cursor-pointer field-box px-3 font-mono text-base outline-none focus-visible:outline-none ${error ? 'field-error' : ''}`}
      />
      <input
        ref={picker}
        type="date"
        tabIndex={-1}
        aria-hidden="true"
        min="2000-01-01"
        max="2100-12-31"
        onChange={(e) => e.target.value && onChange(formatDmy(e.target.value))}
        className="pointer-events-none absolute bottom-0 left-0 h-px w-px opacity-0"
      />
      {error && <span className="text-[13px] text-destructive">{error}</span>}
    </div>
  );
}
