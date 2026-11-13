// Owner Panel (added 2026-11-13, at the user's request): the software's owner creates the
// customer accounts, resets their passwords, blocks them and sets how long they work. Only an
// owner email (OWNER_EMAILS on the server) can open it. MDA has no such screen.

import { formatDmy } from '@qi/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useState, type FormEvent } from 'react';
import { ApiError, api, unwrap, type OkBody } from '../api.ts';
import { AppHeader } from '../components/AppHeader.tsx';
import { BackButton } from '../components/BackButton.tsx';
import { ConfirmUpdate, Dialog } from '../components/Dialog.tsx';
import { Heading, InkButton, LabeledField, OutlineButton } from '../components/ledger.tsx';
import { toast } from '../components/Toast.tsx';
import { DateBox } from './vouchers/shared.tsx';

type List = OkBody<Awaited<ReturnType<(typeof api.api.owner.accounts)['$get']>>>;
type Account = List['accounts'][number];

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LABEL = 'ledger-label';
const SECTION = 'font-mono text-xs tracking-[0.12em] text-primary-text';
const dateBox =
  'h-[46px] w-full min-w-0 field-box px-3 text-lg text-foreground outline-none focus-visible:outline-none';
const when = (iso: string | null) => (iso ? formatDmy(iso.slice(0, 10)) : '—');

const STATUS: Record<Account['status'], { text: string; cls: string }> = {
  active: { text: 'Active', cls: 'border-primary text-primary-text' },
  blocked: { text: 'Blocked', cls: 'border-destructive text-destructive' },
  expired: { text: 'Expired', cls: 'border-destructive text-destructive' },
};

function StatusTag({ a }: { a: Account }) {
  const s = a.owner
    ? { text: 'Owner', cls: 'border-foreground text-foreground' }
    : STATUS[a.status];
  return (
    <span
      className={`inline-flex h-6 items-center border px-2 font-mono text-[11px] uppercase tracking-[0.08em] ${s.cls}`}
    >
      {s.text}
    </span>
  );
}

const errorOf = (e: unknown) =>
  e instanceof ApiError
    ? { message: e.body.message, fields: (e.body.fieldErrors ?? {}) as Record<string, string> }
    : { message: 'Something went wrong. Please try again.', fields: {} as Record<string, string> };

/** Password with Show / Hide inside the box. */
function PasswordField({
  id,
  label,
  value,
  error,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  error?: string;
  onChange: (v: string) => void;
}) {
  const [show, setShow] = useState(false);
  return (
    <LabeledField
      id={id}
      label={label}
      type={show ? 'text' : 'password'}
      autoComplete="new-password"
      value={value}
      error={error}
      onChange={(e) => onChange(e.target.value)}
      trailing={
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          aria-label={show ? 'Hide password' : 'Show password'}
          className="flex h-11 cursor-pointer items-center px-1 font-mono text-xs uppercase tracking-[0.06em] text-muted-foreground"
        >
          {show ? 'Hide' : 'Show'}
        </button>
      }
    />
  );
}

function NewAccountDialog({
  open,
  min,
  onClose,
}: {
  open: boolean;
  min: number;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [validTill, setValidTill] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formErr, setFormErr] = useState('');
  const [busy, setBusy] = useState(false);

  const close = () => {
    setName('');
    setEmail('');
    setPass('');
    setValidTill('');
    setErrors({});
    setFormErr('');
    onClose();
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    const err: Record<string, string> = {};
    if (!name.trim()) err.name = 'Required';
    if (!email.trim()) err.email = 'Required';
    else if (!EMAIL.test(email.trim())) err.email = 'Invalid email';
    if (!pass) err.password = 'Required';
    else if (pass.length < min) err.password = `At least ${min} characters.`;
    setErrors(err);
    setFormErr('');
    if (Object.keys(err).length) return;
    setBusy(true);
    try {
      await unwrap(
        api.api.owner.accounts.$post({
          json: { name, email, password: pass, validTill: validTill || null },
        }),
      );
      await qc.invalidateQueries({ queryKey: ['owner-accounts'] });
      toast(`Account created for ${email.trim().toLowerCase()}`);
      close();
    } catch (x) {
      const { message, fields } = errorOf(x);
      if (Object.keys(fields).length) setErrors(fields);
      else setFormErr(message);
    }
    setBusy(false);
  }

  return (
    <Dialog open={open} onClose={close} title={['New', 'Account']} className="w-[520px]">
      <form onSubmit={submit} noValidate className="flex flex-col gap-4 px-[26px] pb-[22px] pt-4">
        <p className="m-0 text-sm text-muted-foreground">
          Give these details to your customer. They sign in with this email and password, then
          create their company and users.
        </p>
        <LabeledField
          id="own-name"
          label="Name"
          autoComplete="off"
          value={name}
          error={errors.name}
          onChange={(e) => setName(e.target.value)}
        />
        <LabeledField
          id="own-email"
          label="Email"
          type="email"
          autoComplete="off"
          placeholder="customer@business.com"
          value={email}
          error={errors.email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <div className="flex flex-col gap-1.5">
          <PasswordField
            id="own-pass"
            label="Password"
            value={pass}
            error={errors.password}
            onChange={setPass}
          />
          {!errors.password && (
            <span className="text-[13px] text-muted-foreground">At least {min} characters.</span>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="own-valid" className={LABEL}>
            Valid Till
          </label>
          <DateBox
            id="own-valid"
            value={validTill}
            placeholder="No limit"
            className={dateBox}
            onChange={(v) => setValidTill(v)}
          />
          <span className="text-[13px] text-muted-foreground">
            Leave empty for no end date. The account stops working after this day.
          </span>
        </div>
        {formErr && (
          <p
            role="alert"
            className="m-0 border border-destructive bg-destructive-bg px-3.5 py-3 text-sm text-destructive"
          >
            {formErr}
          </p>
        )}
        <div className="flex justify-end gap-2.5 max-sm:flex-col-reverse">
          <OutlineButton type="button" onClick={close} className="justify-center">
            Cancel
          </OutlineButton>
          <InkButton type="submit" disabled={busy} className="justify-center">
            {busy ? 'Creating…' : 'Create Account'}
          </InkButton>
        </div>
      </form>
    </Dialog>
  );
}

function ManageDialog({
  account: a,
  min,
  onClose,
}: {
  account: Account | null;
  min: number;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [validTill, setValidTill] = useState<string | null>(null);
  const [pass, setPass] = useState('');
  const [passErr, setPassErr] = useState('');
  const [askBlock, setAskBlock] = useState(false);
  const [busy, setBusy] = useState(false);
  const till = validTill ?? a?.validTill ?? '';

  const close = () => {
    setValidTill(null);
    setPass('');
    setPassErr('');
    onClose();
  };
  const run = async (action: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try {
      await action();
      await qc.invalidateQueries({ queryKey: ['owner-accounts'] });
      toast(done);
      return true;
    } catch (x) {
      toast(errorOf(x).message, 'error');
      return false;
    } finally {
      setBusy(false);
    }
  };
  if (!a)
    return (
      <Dialog open={false} onClose={close} title={['Manage', 'Account']}>
        {null}
      </Dialog>
    );
  const param = { param: { id: a.id } };

  const saveTill = (v: string | null) =>
    run(
      () =>
        unwrap(
          api.api.owner.accounts[':id']['valid-till'].$post({ ...param, json: { validTill: v } }),
        ),
      v ? `Valid till ${formatDmy(v)}` : 'End date removed',
    ).then((ok) => ok && setValidTill(null));
  const setPassword = async () => {
    if (!pass) return setPassErr('Required');
    if (pass.length < min) return setPassErr(`At least ${min} characters.`);
    const ok = await run(
      () =>
        unwrap(
          api.api.owner.accounts[':id'].password.$post({ ...param, json: { password: pass } }),
        ),
      'Password changed. Give the new password to the customer.',
    );
    if (ok) setPass('');
  };
  const block = (blocked: boolean) =>
    run(
      () => unwrap(api.api.owner.accounts[':id'].block.$post({ ...param, json: { blocked } })),
      blocked ? `${a.email} is blocked` : `${a.email} is unblocked`,
    );

  return (
    <>
      <Dialog open onClose={close} title={['Manage', 'Account']} className="w-[560px]">
        <div className="flex flex-col gap-5 px-[26px] pb-[22px] pt-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border pb-3">
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-lg font-semibold">{a.name}</span>
              <span className="truncate font-mono text-sm text-muted-foreground">{a.email}</span>
            </div>
            <StatusTag a={a} />
          </div>

          {!a.owner && (
            <div className="flex flex-col gap-2">
              <span className={SECTION}>VALID TILL</span>
              <div className="flex items-end gap-2.5 max-sm:flex-col max-sm:items-stretch">
                <div className="flex-1">
                  <DateBox
                    id="own-till"
                    value={till}
                    placeholder="No limit"
                    className={dateBox}
                    onChange={(v) => setValidTill(v)}
                    aria-label="Valid Till"
                  />
                </div>
                <OutlineButton
                  type="button"
                  disabled={busy || till === (a.validTill ?? '')}
                  onClick={() => void saveTill(till || null)}
                  className="justify-center disabled:cursor-default disabled:opacity-50"
                >
                  Save Date
                </OutlineButton>
                {a.validTill && (
                  <OutlineButton
                    type="button"
                    disabled={busy}
                    onClick={() => void saveTill(null)}
                    className="justify-center"
                  >
                    No Limit
                  </OutlineButton>
                )}
              </div>
              <span className="text-[13px] text-muted-foreground">
                {a.validTill
                  ? `Works till ${formatDmy(a.validTill)}. Pick a later date to renew it.`
                  : 'No end date now. The account stops working after the day you set.'}
              </span>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <span className={SECTION}>RESET PASSWORD</span>
            <div className="flex items-start gap-2.5 max-sm:flex-col max-sm:items-stretch">
              <div className="flex-1">
                <PasswordField
                  id="own-newpass"
                  label="New Password"
                  value={pass}
                  error={passErr}
                  onChange={(v) => {
                    setPass(v);
                    setPassErr('');
                  }}
                />
              </div>
              <OutlineButton
                type="button"
                disabled={busy}
                onClick={() => void setPassword()}
                className="mt-[26px] justify-center max-sm:mt-0"
              >
                Set Password
              </OutlineButton>
            </div>
            <span className="text-[13px] text-muted-foreground">
              The account is signed out everywhere and must sign in with the new password.
            </span>
          </div>

          {!a.owner && (
            <div className="flex flex-col gap-2">
              <span className={SECTION}>{a.blocked ? 'UNBLOCK' : 'BLOCK'}</span>
              <div className="flex items-center gap-3 max-sm:flex-col max-sm:items-stretch">
                <span className="flex-1 text-sm text-muted-foreground">
                  {a.blocked
                    ? 'This account can not sign in. Its companies and data are kept.'
                    : 'Stops this account from signing in. Its companies and data are kept.'}
                </span>
                {a.blocked ? (
                  <InkButton
                    type="button"
                    disabled={busy}
                    onClick={() => void block(false)}
                    className="justify-center"
                  >
                    Unblock
                  </InkButton>
                ) : (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setAskBlock(true)}
                    className="flex h-12 cursor-pointer items-center justify-center border-[1.5px] border-destructive bg-card px-5 text-[15px] font-semibold text-destructive"
                  >
                    Block
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="flex justify-end border-t border-border pt-3">
            <OutlineButton type="button" onClick={close} className="justify-center max-sm:w-full">
              Close
            </OutlineButton>
          </div>
        </div>
      </Dialog>
      {/* Beside the dialog, not inside it: a nested dialog's close would close this one too. */}
      <ConfirmUpdate
        open={askBlock}
        title={['Block', 'Account']}
        text={`Block ${a.email}? They are signed out at once and can't sign in until you unblock them.`}
        confirmLabel="Block"
        onCancel={() => setAskBlock(false)}
        onConfirm={() => {
          setAskBlock(false);
          void block(true);
        }}
      />
    </>
  );
}

export function OwnerScreen() {
  const navigate = useNavigate();
  const q = useQuery({
    queryKey: ['owner-accounts'],
    queryFn: () => unwrap(api.api.owner.accounts.$get()),
  });
  const [find, setFind] = useState('');
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const all = q.data?.accounts ?? [];
  const min = q.data?.minPasswordLength ?? 8;
  const f = find.trim().toLowerCase();
  const rows = all.filter(
    (a) => !f || a.name.toLowerCase().includes(f) || a.email.toLowerCase().includes(f),
  );
  const open = all.find((a) => a.id === openId) ?? null;
  const customers = all.filter((a) => !a.owner);
  const count = (s: Account['status']) => customers.filter((a) => a.status === s).length;

  const cols =
    'grid grid-cols-[minmax(0,1.2fr)_minmax(0,1.5fr)_90px_110px_110px_110px_96px] gap-3 max-lg:grid-cols-[minmax(0,1fr)_110px_96px] max-sm:grid-cols-[minmax(0,1fr)_84px]';
  const wide = 'max-lg:hidden';

  return (
    <div className="flex h-app-screen min-h-[600px] flex-col max-sm:min-h-0">
      <AppHeader />
      <div className="flex min-h-0 flex-1 flex-col gap-5 px-12 pb-6 pt-6 max-lg:px-6 max-sm:px-4 max-sm:pt-4">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
          <BackButton onClick={() => void navigate({ to: '/' })} />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span className={SECTION}>ALL ACCOUNTS</span>
            <Heading as="h1" lead="Owner" tail="Panel" className="text-[38px] max-md:text-[32px]" />
          </div>
          <InkButton
            type="button"
            onClick={() => setCreating(true)}
            className="max-sm:w-full max-sm:justify-center"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
            New Account
          </InkButton>
        </div>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b-[3px] border-double border-foreground pb-4">
          <input
            aria-label="Search accounts"
            value={find}
            onChange={(e) => setFind(e.target.value)}
            placeholder="Search name or email…"
            className="h-[42px] w-80 min-w-0 field-box px-3 text-[15px] text-foreground outline-none max-sm:w-full"
          />
          <span className="font-mono text-[13px] text-muted-foreground">
            {customers.length} customer account{customers.length === 1 ? '' : 's'} ·{' '}
            {count('active')} active · {count('blocked')} blocked · {count('expired')} expired
          </span>
        </div>

        <div className="flex min-h-0 flex-1 flex-col">
          <div
            className={`${cols} border-b-2 border-foreground px-2.5 pb-2.5 font-mono text-xs uppercase tracking-[0.08em] text-muted-foreground`}
          >
            <span>Name</span>
            <span className={wide}>Email</span>
            <span className={`${wide} text-right`}>Companies</span>
            <span className={wide}>Created</span>
            <span className={wide}>Last Sign-in</span>
            <span className="max-sm:hidden">Valid Till</span>
            <span>Status</span>
          </div>
          <div role="list" className="min-h-0 flex-1 overflow-y-auto">
            {q.isPending && (
              <p className="m-0 px-2.5 py-6 text-[15px] text-muted-foreground">Loading…</p>
            )}
            {q.isError && (
              <p className="m-0 px-2.5 py-6 text-[15px] text-destructive">{q.error.message}</p>
            )}
            {q.isSuccess && rows.length === 0 && (
              <p className="m-0 px-2.5 py-6 text-[15px] text-muted-foreground">
                {all.length
                  ? 'No account matches the search.'
                  : 'No accounts yet. Create one with New Account.'}
              </p>
            )}
            {rows.map((a) => (
              <div key={a.id} role="listitem" className="border-b border-border">
                <button
                  type="button"
                  onClick={() => setOpenId(a.id)}
                  className={`${cols} min-h-[52px] w-full cursor-pointer items-center px-2.5 py-1.5 text-left hover:bg-accent`}
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-[15px] font-semibold">{a.name}</span>
                    <span className="truncate font-mono text-xs text-muted-foreground lg:hidden">
                      {a.email}
                    </span>
                  </span>
                  <span className={`${wide} truncate font-mono text-sm`}>{a.email}</span>
                  <span className={`${wide} text-right font-mono text-sm`}>{a.companies}</span>
                  <span className={`${wide} font-mono text-sm`}>{when(a.createdAt)}</span>
                  <span className={`${wide} font-mono text-sm`}>{when(a.lastSignIn)}</span>
                  <span className="font-mono text-sm max-sm:hidden">
                    {a.owner ? '' : a.validTill ? formatDmy(a.validTill) : 'No limit'}
                  </span>
                  <span>
                    <StatusTag a={a} />
                  </span>
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
      <NewAccountDialog open={creating} min={min} onClose={() => setCreating(false)} />
      <ManageDialog key={openId ?? ''} account={open} min={min} onClose={() => setOpenId(null)} />
    </div>
  );
}
