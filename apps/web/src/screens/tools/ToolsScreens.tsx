// Company Settings, Backup Data, Import Data and Logs. MDA shows "Not built yet" for each; they
// follow docs/design/TOOLS.md.

import {
  backupMessages,
  companyFieldErrors,
  logMessages,
  seriesMessages as sm,
  seriesProblem,
} from '@qi/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { ApiError, api, unwrap, type OkBody } from '../../api.ts';
import { MessageDialog } from '../../components/Dialog.tsx';
import { toast } from '../../components/Toast.tsx';
import { ImportFromMda } from '../books/ImportFromMda.tsx';
import { BaseCurrency, FormSection, fromRecord } from '../company/CompanyScreen.tsx';
import {
  COLUMNS,
  EMPTY_FORM,
  ERROR_KEY,
  FIELD_ORDER,
  type CompanyForm,
  type FieldKey,
} from '../company/fields.ts';
import {
  CheckFilter,
  PeriodDate,
  ReportPage,
  ReportTable,
  defaultPeriod,
  useBook,
  type Col,
} from '../reports/shared.tsx';
import { boxClass, dmyDash } from '../transactions/shared.tsx';

const BTN =
  'flex h-11 cursor-pointer items-center justify-center border-[1.5px] border-foreground px-4 text-[15px] font-semibold disabled:opacity-50';
const MAIN =
  'flex h-11 min-w-[180px] cursor-pointer items-center justify-between gap-4 bg-primary px-5 text-[15px] font-semibold text-primary-foreground disabled:opacity-60';

function Tabs<K extends string>({
  value,
  options,
  onChange,
}: {
  value: K;
  options: [K, string][];
  onChange: (k: K) => void;
}) {
  return (
    <div role="tablist" className="flex gap-1.5">
      {options.map(([k, label]) => (
        <button
          key={k}
          type="button"
          role="tab"
          aria-selected={value === k}
          onClick={() => onChange(k)}
          className={`flex h-10 cursor-pointer items-center border-[1.5px] px-4 text-sm font-semibold ${
            value === k
              ? 'border-foreground bg-foreground text-card'
              : 'border-border bg-card hover:border-foreground'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

// ── Company Settings ───────────────────────────────────────────────────────────

export function CompanySettingsScreen() {
  const [tab, setTab] = useState<'company' | 'numbering'>('company');
  return (
    <ReportPage
      section="tools"
      title={['Company', 'Settings']}
      subtitle="Tools  ›  Company Settings"
      print={false}
      filters={
        <Tabs
          value={tab}
          onChange={setTab}
          options={[
            ['company', 'Company Details'],
            ['numbering', 'Voucher Numbering'],
          ]}
        />
      }
    >
      {tab === 'company' ? <CompanyDetails /> : <Numbering />}
    </ReportPage>
  );
}

/** The open company in Company Creation's own form and checks; Update only. */
function CompanyDetails() {
  const queryClient = useQueryClient();
  const q = useQuery({
    queryKey: ['settings-company'],
    queryFn: () => unwrap(api.api.settings.company.$get()),
  });
  const [form, setForm] = useState<CompanyForm | null>(null);
  const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [busy, setBusy] = useState(false);
  const refs = useRef<Partial<Record<FieldKey, HTMLElement | null>>>({});
  useEffect(() => {
    if (q.data?.company && !form)
      setForm(fromRecord(q.data.company as Parameters<typeof fromRecord>[0]));
  }, [q.data]);
  if (!form) return null;

  const set = (k: FieldKey, v: string) => {
    setForm((f) => ({ ...f!, [k]: v }));
    setErrors((e) => ({ ...e, [k]: undefined }));
  };
  const next = (k: FieldKey) => refs.current[FIELD_ORDER[FIELD_ORDER.indexOf(k) + 1]!]?.focus();

  const update = async () => {
    const raw = companyFieldErrors({ ...form, name: form.compName });
    const e: Partial<Record<FieldKey, string>> = {};
    for (const [k, msg] of Object.entries(raw)) e[ERROR_KEY[k] ?? (k as FieldKey)] = msg;
    setErrors(e);
    const first = FIELD_ORDER.find((k) => e[k]);
    if (first) return refs.current[first]?.focus();
    setBusy(true);
    try {
      const c = await unwrap(api.api.settings.company.$put({ json: form }));
      await queryClient.invalidateQueries({ queryKey: ['book-me'] });
      await queryClient.invalidateQueries({ queryKey: ['book-index'] });
      toast(sm.companyUpdated(c.compName));
    } catch (err) {
      if (
        err instanceof ApiError &&
        err.body.fieldErrors &&
        Object.keys(err.body.fieldErrors).length
      ) {
        const fe: Partial<Record<FieldKey, string>> = {};
        for (const [k, msg] of Object.entries(err.body.fieldErrors))
          fe[ERROR_KEY[k] ?? (k as FieldKey)] = msg;
        setErrors(fe);
      } else
        toast(
          `Error updating company: ${err instanceof Error ? err.message : String(err)}`,
          'error',
        );
    }
    setBusy(false);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(340px,100%),1fr))] items-start gap-x-10 gap-y-5">
          {COLUMNS.map((sections, i) => (
            <div key={i} className="flex flex-col gap-4">
              {sections.map((sec) => (
                <FormSection
                  key={sec.title}
                  title={sec.title}
                  fields={sec.fields}
                  form={form ?? EMPTY_FORM}
                  errors={errors}
                  set={set}
                  next={next}
                  refs={refs.current}
                />
              ))}
              {i === COLUMNS.length - 1 && <BaseCurrency />}
            </div>
          ))}
        </div>
      </div>
      <div className="flex flex-none justify-end border-t-[3px] border-double border-foreground pt-3">
        <button type="button" disabled={busy} onClick={() => void update()} className={MAIN}>
          <span>Update Company</span>
          <span aria-hidden="true" className="text-xl">
            →
          </span>
        </button>
      </div>
    </div>
  );
}

type Series = OkBody<Awaited<ReturnType<typeof api.api.settings.series.$get>>>[number];

/** Every number series: its prefix and digits, editable, with the number it will give next. */
function Numbering() {
  const queryClient = useQueryClient();
  const q = useQuery({
    queryKey: ['settings-series'],
    queryFn: () => unwrap(api.api.settings.series.$get()),
  });
  const [edits, setEdits] = useState<Record<string, { prefix: string; width: string }>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const rows = q.data ?? [];
  const value = (s: Series) => edits[s.vchrType] ?? { prefix: s.prefix, width: String(s.width) };
  const save = async (s: Series) => {
    const v = value(s);
    const problem = seriesProblem(v.prefix, Number(v.width));
    if (problem) return setErrors((e) => ({ ...e, [s.vchrType]: problem }));
    try {
      await unwrap(
        api.api.settings.series[':type'].$put({
          param: { type: s.vchrType },
          json: { prefix: v.prefix, width: Number(v.width) },
        }),
      );
      const without = <T,>(m: Record<string, T>) => {
        const n = { ...m };
        delete n[s.vchrType];
        return n;
      };
      setEdits(without);
      setErrors(without);
      await queryClient.invalidateQueries({ queryKey: ['settings-series'] });
      toast(sm.saved(s.vchrName));
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error');
    }
  };
  const cols: Col<Series>[] = [
    { head: 'Voucher', w: 'minmax(140px,1fr)', cell: (s) => s.vchrName },
    { head: 'Type', w: '80px', wide: true, cell: (s) => s.vchrType },
    {
      head: 'Prefix',
      w: '120px',
      cell: (s) => (
        <input
          aria-label={`${s.vchrName} prefix`}
          value={value(s).prefix}
          maxLength={8}
          onChange={(e) =>
            setEdits((x) => ({
              ...x,
              [s.vchrType]: { ...value(s), prefix: e.target.value.toUpperCase() },
            }))
          }
          className={`${boxClass(!!errors[s.vchrType])} uppercase`}
        />
      ),
    },
    {
      head: 'Digits',
      w: '70px',
      cell: (s) => (
        <input
          aria-label={`${s.vchrName} digits`}
          value={value(s).width}
          inputMode="numeric"
          onChange={(e) =>
            setEdits((x) => ({
              ...x,
              [s.vchrType]: { ...value(s), width: e.target.value.replace(/\D/g, '') },
            }))
          }
          className={`${boxClass(!!errors[s.vchrType])} text-right`}
        />
      ),
    },
    {
      head: 'Next No.',
      w: '120px',
      wide: true,
      cell: (s) => <span className="font-mono">{s.next}</span>,
    },
    {
      head: '',
      w: '84px',
      cell: (s) =>
        edits[s.vchrType] ? (
          <button
            type="button"
            onClick={() => void save(s)}
            className="h-[34px] w-full cursor-pointer bg-primary text-sm font-semibold text-primary-foreground"
          >
            Save
          </button>
        ) : null,
    },
  ];
  const firstError = Object.values(errors)[0];
  return (
    <>
      <ReportTable cols={cols} rows={rows} rowKey={(s) => s.vchrType} empty="" minWidth={640} />
      <p className={`m-0 text-xs ${firstError ? 'text-destructive' : 'text-muted-foreground'}`}>
        {firstError ??
          'A new prefix or digit count applies from the next voucher; numbers already used keep their form. Only an Admin can change these.'}
      </p>
    </>
  );
}

// ── Backup Data ────────────────────────────────────────────────────────────────

const TABLE_NAMES: Record<string, string> = {
  bookUsers: 'Users', accountGroups: 'Groups', ledgers: 'Ledgers', miscList: 'Units, godowns, types…',
  stockItems: 'Stock items', voucherSeries: 'Number series', vouchers: 'Vouchers', voucherLines: 'Voucher lines',
  billRefs: 'Bill references', voucherItems: 'Item lines', stockJournalLines: 'Stock journal lines',
  stockTrn: 'Stock movements', purchases: 'Purchase bills', purchaseLines: 'Purchase lines', sales: 'Sale bills',
  saleLines: 'Sale lines', auditLog: 'Log entries',
}; // prettier-ignore

export function BackupScreen() {
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<
    OkBody<Awaited<ReturnType<typeof api.api.backup.$get>>>['summary'] | null
  >(null);
  const download = async () => {
    setBusy(true);
    try {
      const r = await unwrap(api.api.backup.$get());
      const name = `${r.summary.companyName.replace(/[^\w-]+/g, '_')}_backup_${new Date().toISOString().slice(0, 10)}.json`;
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(r.backup)], { type: 'application/json' }),
      );
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
      setSummary(r.summary);
      toast(`Backup downloaded: ${name}`);
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error');
    }
    setBusy(false);
  };
  return (
    <ReportPage
      section="tools"
      title={['Backup', 'Data']}
      subtitle="Tools  ›  Backup Data"
      print={false}
      filters={null}
    >
      <div className="flex max-w-[760px] flex-col gap-3 border border-border bg-card p-4">
        <p className="m-0 text-[15px] leading-relaxed">
          Downloads the whole open company — every financial year, with its masters, vouchers,
          bills, stock and log — as one file. Keep it somewhere safe; <b>Tools › Import Data</b>{' '}
          restores it.
        </p>
        <p className="m-0 text-sm text-muted-foreground">
          The file holds your business data and the users' password hashes (never the passwords
          themselves). Treat it like your books.
        </p>
        <div>
          <button type="button" disabled={busy} onClick={() => void download()} className={MAIN}>
            <span>{busy ? 'Preparing…' : 'Download Backup'}</span>
            <span aria-hidden="true" className="text-xl">
              ↓
            </span>
          </button>
        </div>
      </div>
      {summary && (
        <div className="flex min-h-0 flex-col gap-2 overflow-auto">
          {summary.years.map((y) => (
            <div key={y.yearName} className="border border-border bg-card px-4 py-3">
              <div className="mb-1.5 font-mono text-xs tracking-[0.12em] text-primary-text">
                {summary.companyName.toUpperCase()} · {y.yearName}
              </div>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-x-6 gap-y-1 text-sm">
                {Object.entries(y.records).map(([t, n]) => (
                  <span
                    key={t}
                    className="flex justify-between gap-2 border-b border-dashed border-border"
                  >
                    <span className="text-muted-foreground">{TABLE_NAMES[t] ?? t}</span>
                    <span className="font-mono">{n}</span>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </ReportPage>
  );
}

// ── Import Data ────────────────────────────────────────────────────────────────

export function ImportDataScreen() {
  const queryClient = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const restore = async (file: File) => {
    setBusy(true);
    try {
      let data: unknown;
      try {
        data = JSON.parse(await file.text());
      } catch {
        throw new Error(backupMessages.notBackup);
      }
      const r = await unwrap(
        api.api.import.backup.$post({ json: data as Record<string, unknown> }),
      );
      await queryClient.invalidateQueries({ queryKey: ['book-index'] });
      setMessage({ kind: r.restored ? 'ok' : 'error', text: r.message });
    } catch (err) {
      setMessage({ kind: 'error', text: err instanceof Error ? err.message : String(err) });
    }
    setBusy(false);
  };
  return (
    <ReportPage
      section="tools"
      title={['Import', 'Data']}
      subtitle="Tools  ›  Import Data"
      print={false}
      filters={null}
    >
      <div className="grid max-w-[980px] grid-cols-2 gap-3 max-md:grid-cols-1">
        <div className="flex flex-col gap-3 border border-border bg-card p-4">
          <h2 className="m-0 font-mono text-xs font-medium tracking-[0.12em] text-primary-text">
            FROM MDA INVENTORY
          </h2>
          <p className="m-0 text-sm leading-relaxed text-muted-foreground">
            Pick MDA-Inventory's data folder (the one with MDA_Registry.db). Its companies, years
            and books come in as they are. A company already in this account is skipped.
          </p>
          <div>
            <ImportFromMda />
          </div>
        </div>
        <div className="flex flex-col gap-3 border border-border bg-card p-4">
          <h2 className="m-0 font-mono text-xs font-medium tracking-[0.12em] text-primary-text">
            FROM A BACKUP FILE
          </h2>
          <p className="m-0 text-sm leading-relaxed text-muted-foreground">
            Pick a file made by <b>Tools › Backup Data</b>. The company comes back with every year.
            If it's still in this account, nothing is restored — delete it first.
          </p>
          <input
            ref={input}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void restore(f);
            }}
          />
          <div>
            <button
              type="button"
              disabled={busy}
              onClick={() => input.current?.click()}
              className={BTN}
            >
              {busy ? 'Restoring…' : 'Restore from Backup'}
            </button>
          </div>
        </div>
      </div>
      <p className="m-0 text-xs text-muted-foreground">
        Imported companies appear on Company &amp; Year Setup; sign out and open them from there.
      </p>
      <MessageDialog
        open={!!message}
        kind={message?.kind}
        title={['Import', 'Data']}
        text={message?.text ?? ''}
        onClose={() => setMessage(null)}
      />
    </ReportPage>
  );
}

// ── Logs ───────────────────────────────────────────────────────────────────────

type LogRow = OkBody<Awaited<ReturnType<typeof api.api.logs.$get>>>[number];

export function LogsScreen() {
  const book = useBook();
  const [p, setP] = useState<{ from: string; to: string } | null>(null);
  const [user, setUser] = useState('');
  const [action, setAction] = useState('');
  const [details, setDetails] = useState(true);
  useEffect(() => {
    if (book && !p) setP(defaultPeriod(book.fyFrom, book.fyTo));
  }, [book]);
  const filters = useQuery({
    queryKey: ['log-filters'],
    queryFn: () => unwrap(api.api.logs.filters.$get()),
  });
  const q = useQuery({
    queryKey: ['logs', p, user, action],
    enabled: !!p && p.from <= p.to,
    queryFn: () =>
      unwrap(
        api.api.logs.$get({
          query: { ...p!, ...(user ? { user } : {}), ...(action ? { action } : {}) },
        }),
      ),
  });
  if (!p)
    return (
      <ReportPage section="tools" title={['Logs', '']} subtitle="" filters={null}>
        {null}
      </ReportPage>
    );
  const when = (iso: string) => {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${dmyDash(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  const cols: Col<LogRow>[] = [
    {
      head: 'When',
      w: '130px',
      cell: (r) => <span className="font-mono text-xs">{when(r.logAt)}</span>,
    },
    { head: 'User', w: '100px', wide: true, cell: (r) => r.userName },
    { head: 'Action', w: '84px', cell: (r) => r.action },
    { head: 'Record', w: 'minmax(120px,1fr)', cell: (r) => `${r.tableName} · ${r.recordKey}` },
    ...(details
      ? [{ head: 'Details', w: 'minmax(140px,1.2fr)', wide: true, cell: (r: LogRow) => r.details }]
      : []),
  ];
  const select = (
    id: string,
    labelText: string,
    value: string,
    set: (v: string) => void,
    options: string[],
    all: string,
  ) => (
    <label
      htmlFor={id}
      className="flex w-40 flex-col gap-0.5 text-[13px] font-semibold text-muted-foreground"
    >
      {labelText}
      <select
        id={id}
        value={value}
        onChange={(e) => set(e.target.value)}
        className={`${boxClass()} cursor-pointer`}
      >
        <option value="">{all}</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <ReportPage
      section="tools"
      title={['Logs', '']}
      subtitle={`From ${dmyDash(p.from)} to ${dmyDash(p.to)}`}
      filters={
        <>
          <PeriodDate
            id="lg-from"
            label="From"
            value={p.from}
            onChange={(from) => setP({ ...p, from })}
          />
          <PeriodDate id="lg-to" label="To" value={p.to} onChange={(to) => setP({ ...p, to })} />
          {select('lg-user', 'User', user, setUser, filters.data?.users ?? [], 'All users')}
          {select(
            'lg-action',
            'Action',
            action,
            setAction,
            filters.data?.actions ?? [],
            'All actions',
          )}
          <CheckFilter label="Details" checked={details} onChange={setDetails} />
        </>
      }
    >
      <ReportTable
        cols={cols}
        rows={q.data ?? []}
        rowKey={(r) => String(r.id)}
        empty={logMessages.none}
        minWidth={720}
      />
    </ReportPage>
  );
}
