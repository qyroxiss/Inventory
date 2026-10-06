// Account sign-in (web only, before Company & Year Setup) — approved design S3 "Quiet"
// (docs/design/AUTH-SCREENS.md). MDA has no such screen; wording follows MDA's login style.
// Layout lives here only; colours come from packages/ui/src/styles.css.

import { brand } from '@qi/core';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useRef, useState, type FormEvent } from 'react';
import { AppHeader } from '../components/AppHeader.tsx';
import { Heading, PrimaryButton, LabeledField } from '../components/ledger.tsx';
import {
  AccountError,
  MIN_PASSWORD,
  accountMessages,
  createAccount,
  createErrors,
  signIn,
  signInErrors,
  type Errors,
} from '../lib/account.ts';

type Mode = 'signin' | 'create';

const today = () =>
  new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });

/** "Inventory." with the second half in italics, as in the design. */
function Wordmark() {
  const name = brand.appName;
  const cut = Math.ceil(name.length / 2);
  return (
    <span className="font-serif text-[160px] leading-[0.85] tracking-[-0.01em] max-lg:text-[88px]">
      {name.slice(0, cut)}
      <span className="italic">{name.slice(cut)}.</span>
    </span>
  );
}

export function AccountScreen() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<Mode>('signin');
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [remember, setRemember] = useState(true);
  const [errors, setErrors] = useState<Errors>({});
  const [formErr, setFormErr] = useState('');
  const passRef = useRef<HTMLInputElement>(null);

  const switchTo = (m: Mode) => {
    setMode(m);
    setPass('');
    setConfirm('');
    setErrors({});
    setFormErr('');
  };
  const clearError = (field: string) => {
    setErrors((e) => {
      const next = { ...e };
      delete next[field];
      return next;
    });
    setFormErr('');
  };

  async function run(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
      // A different account may have signed in: drop anything cached for the previous one.
      queryClient.clear();
      await navigate({ to: '/' });
    } catch (err) {
      const e = err instanceof AccountError ? err : new AccountError(accountMessages.failed);
      if (e.field) setErrors({ [e.field]: e.message });
      else setFormErr(e.message);
      setBusy(false);
    }
  }

  function submitSignIn(e: FormEvent) {
    e.preventDefault();
    const fieldErrors = signInErrors({ email, password: pass });
    setErrors(fieldErrors);
    setFormErr('');
    if (Object.keys(fieldErrors).length) return;
    void run(() => signIn(email, pass, remember));
  }

  function submitCreate(e: FormEvent) {
    e.preventDefault();
    const fieldErrors = createErrors({ name, email, password: pass, confirm });
    setErrors(fieldErrors);
    setFormErr('');
    if (Object.keys(fieldErrors).length) return;
    void run(() => createAccount(name, email, pass));
  }

  const tab = (m: Mode, label: string) => (
    <button
      type="button"
      onClick={() => switchTo(m)}
      aria-pressed={mode === m}
      className={`flex h-[52px] flex-1 max-sm:h-11 cursor-pointer items-center justify-center font-mono text-[13px] uppercase tracking-[0.08em] ${
        mode === m ? 'bg-foreground text-card' : 'text-foreground'
      }`}
    >
      {label}
    </button>
  );

  const alert = formErr && (
    <p
      role="alert"
      className="m-0 border border-destructive bg-destructive-bg px-3.5 py-3 text-sm text-destructive"
    >
      {formErr}
    </p>
  );

  return (
    <div className="flex h-app-screen min-h-[600px] flex-col max-sm:min-h-0">
      <AppHeader />
      <div className="flex min-h-0 flex-1 max-lg:flex-col-reverse max-lg:justify-end max-lg:overflow-y-auto">
        <section
          aria-label={brand.appName}
          className="ledger-paper relative flex min-w-0 flex-1 flex-col border-r border-border pb-12 pl-[120px] pr-16 pt-[72px] max-lg:flex-none max-lg:border-r-0 max-lg:border-t max-lg:px-6 max-lg:py-8 max-sm:hidden"
        >
          <div
            aria-hidden="true"
            className="absolute inset-y-0 left-[84px] w-px bg-ledger-margin max-lg:hidden"
          />
          <div
            aria-hidden="true"
            className="absolute inset-y-0 left-[89px] w-px bg-ledger-margin max-lg:hidden"
          />
          <div className="mt-auto flex flex-col gap-3.5">
            <span className="font-mono text-xs uppercase tracking-[0.12em] text-muted-foreground">
              {today()}
            </span>
            <Wordmark />
          </div>
        </section>

        <section
          aria-label="Account"
          className="flex min-w-0 flex-[0_0_540px] items-center justify-center overflow-y-auto px-16 py-10 max-lg:flex-none max-lg:overflow-visible max-lg:px-6 max-lg:py-8 max-sm:px-4 max-sm:pb-6 max-sm:pt-5"
        >
          <div className="flex w-full max-w-[420px] flex-col gap-7 max-sm:gap-5">
            <div
              role="group"
              aria-label="Sign In or Create Account"
              className="flex border-b-[3px] border-double border-foreground"
            >
              {tab('signin', 'Sign In')}
              {tab('create', 'Create Account')}
            </div>

            {mode === 'signin' ? (
              <form onSubmit={submitSignIn} noValidate className="flex flex-col gap-6 max-sm:gap-4">
                <div className="flex flex-col gap-2">
                  <Heading lead="Sign" tail="In" className="text-[42px] max-sm:text-[32px]" />
                  <p className="m-0 text-[15px] text-muted-foreground max-sm:text-sm">
                    Enter your credentials to continue
                  </p>
                </div>
                <LabeledField
                  id="acc-email"
                  label="Email"
                  type="email"
                  placeholder="you@business.com"
                  autoComplete="email"
                  autoFocus
                  value={email}
                  error={errors.email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    clearError('email');
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      passRef.current?.focus();
                    }
                  }}
                />
                <LabeledField
                  id="acc-pass"
                  label="Password"
                  inputRef={passRef}
                  type={show ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={pass}
                  error={errors.password}
                  onChange={(e) => {
                    setPass(e.target.value);
                    clearError('password');
                  }}
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
                <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-sm">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                    className="size-[18px] accent-primary"
                  />
                  Remember me
                </label>
                {alert}
                <PrimaryButton type="submit" disabled={busy} className="max-sm:h-12">
                  {busy ? 'Signing in…' : 'Sign In'}
                </PrimaryButton>
              </form>
            ) : (
              <form onSubmit={submitCreate} noValidate className="flex flex-col gap-[22px] max-sm:gap-4">
                <Heading lead="Create" tail="Account" className="text-[42px] max-sm:text-[32px]" />
                <LabeledField
                  id="new-name"
                  label="Name"
                  autoComplete="name"
                  autoFocus
                  value={name}
                  error={errors.name}
                  onChange={(e) => {
                    setName(e.target.value);
                    clearError('name');
                  }}
                />
                <LabeledField
                  id="new-email"
                  label="Email"
                  type="email"
                  placeholder="you@business.com"
                  autoComplete="email"
                  value={email}
                  error={errors.email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    clearError('email');
                  }}
                />
                <div className="flex flex-col gap-1.5">
                  <div className="grid grid-cols-2 gap-5">
                    <LabeledField
                      id="new-pass"
                      label="Password"
                      type="password"
                      autoComplete="new-password"
                      value={pass}
                      error={errors.password}
                      onChange={(e) => {
                        setPass(e.target.value);
                        clearError('password');
                      }}
                    />
                    <LabeledField
                      id="new-confirm"
                      label="Confirm"
                      type="password"
                      autoComplete="new-password"
                      value={confirm}
                      error={errors.confirm}
                      onChange={(e) => {
                        setConfirm(e.target.value);
                        clearError('confirm');
                      }}
                    />
                  </div>
                  <span className="text-[13px] text-muted-foreground">
                    At least {MIN_PASSWORD} characters.
                  </span>
                </div>
                {alert}
                <PrimaryButton type="submit" disabled={busy} className="max-sm:h-12">
                  {busy ? 'Creating…' : 'Create Account'}
                </PrimaryButton>
              </form>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
