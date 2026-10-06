// Right half of the company & year screen: MDA's login (auth_page.dart) for the chosen book,
// then the forced password change when the user still has the default password.
// Rules and messages come from @qi/core and the API, so they stay exactly MDA's.

import { loginFieldErrors, loginMessages, newPasswordErrors } from '@qi/core';
import { useNavigate } from '@tanstack/react-router';
import { useEffect, useRef, useState, type FormEvent, type ReactNode, type RefObject } from 'react';
import { ApiError, api, unwrap } from '../../api.ts';
import { Heading, OutlineButton, PrimaryButton, LabeledField } from '../../components/ledger.tsx';
import { loadRemembered, saveRemembered } from '../../lib/remember.ts';
import { BOOK_INDEX_ID, SIGN_IN_ID, yearRange, type IndexCompany, type IndexYear } from './types.ts';

type Errors = Record<string, string>;

/** The right half on a laptop; on phones and tablets it comes first, above the company list,
 *  since the first company and year are already chosen (MDA) and most people just sign in. */
const PANEL =
  'flex min-w-0 flex-[0_0_540px] items-center justify-center px-16 py-10 max-lg:order-first max-lg:flex-none max-lg:border-b max-lg:border-border max-lg:px-6 max-lg:py-8 max-sm:px-4';

/** Splits an API failure into per-field errors and a form message, as MDA shows them. */
function readFailure(
  err: unknown,
  fallback: string,
): { fields: Errors; form: string; status?: number } {
  if (err instanceof ApiError && err.status === 422) {
    const fields = err.body.fieldErrors ?? {};
    return { fields, form: Object.keys(fields).length ? '' : err.body.message, status: 422 };
  }
  return { fields: {}, form: fallback, status: err instanceof ApiError ? err.status : undefined };
}

export function SignInPanel({
  company,
  year,
  passRef,
}: {
  company: IndexCompany;
  year: IndexYear;
  passRef: RefObject<HTMLInputElement | null>;
}) {
  const navigate = useNavigate();
  const remembered = useRef(loadRemembered());

  const [stage, setStage] = useState<'login' | 'change'>('login');
  const [busy, setBusy] = useState(false);
  const [user, setUser] = useState(remembered.current ?? 'admin');
  const [pass, setPass] = useState('');
  const [show, setShow] = useState(false);
  const [remember, setRemember] = useState(true);
  const [errors, setErrors] = useState<Errors>({});
  const [formErr, setFormErr] = useState('');
  const [signedInAs, setSignedInAs] = useState('');
  const [np, setNp] = useState('');
  const [cp, setCp] = useState('');
  const npRef = useRef<HTMLInputElement>(null);
  const cpRef = useRef<HTMLInputElement>(null);
  const clearError = (field: string) =>
    setErrors((e) => {
      const next = { ...e };
      delete next[field];
      return next;
    });

  // Leaving this book half-way through the forced change: drop the session it started.
  const stageRef = useRef(stage);
  stageRef.current = stage;
  useEffect(
    () => () => {
      if (stageRef.current === 'change') void api.api.book.logout.$post();
    },
    [],
  );

  const accountGone = (status?: number) => {
    if (status === 401) void navigate({ to: '/signin' });
    return status === 401;
  };

  async function signIn(e: FormEvent) {
    e.preventDefault();
    const fieldErrors = loginFieldErrors({ username: user, password: pass });
    setErrors(fieldErrors);
    setFormErr('');
    if (Object.keys(fieldErrors).length) return;

    setBusy(true);
    try {
      const book = await unwrap(
        api.api.book.login.$post({ json: { yearId: year.id, username: user, password: pass } }),
      );
      saveRemembered(remember, user);
      if (book.mustChangePassword) {
        setSignedInAs(book.userName);
        setStage('change');
        setBusy(false);
        setTimeout(() => npRef.current?.focus(), 0);
        return;
      }
      await navigate({ to: '/app' });
    } catch (err) {
      const f = readFailure(err, loginMessages.failed);
      if (accountGone(f.status)) return;
      setErrors(f.fields);
      setFormErr(f.form);
      setBusy(false);
    }
  }

  async function savePassword(e: FormEvent) {
    e.preventDefault();
    const fieldErrors = newPasswordErrors({ newPassword: np, confirmPassword: cp });
    setErrors(fieldErrors);
    if (Object.keys(fieldErrors).length) return;

    setBusy(true);
    try {
      await unwrap(
        api.api.book['change-password'].$post({ json: { newPassword: np, confirmPassword: cp } }),
      );
      stageRef.current = 'login'; // the session is complete now; keep it on unmount
      await navigate({ to: '/app' });
    } catch (err) {
      const f = readFailure(err, loginMessages.failed);
      if (accountGone(f.status)) return;
      setErrors(f.fields);
      setFormErr(f.form);
      setBusy(false);
    }
  }

  async function cancelChange() {
    await api.api.book.logout.$post().catch(() => undefined);
    setStage('login');
    setPass('');
    setNp('');
    setCp('');
    setErrors({});
    setFormErr(loginMessages.changeRequired);
    setTimeout(() => passRef.current?.focus(), 0);
  }

  return (
    <section
      id={SIGN_IN_ID}
      aria-label="Sign in"
      className={`${PANEL} overflow-y-auto max-lg:overflow-visible max-sm:pb-6 max-sm:pt-5`}
    >
      <div className="flex w-full max-w-[420px] flex-col gap-8 max-sm:gap-5">
        <div className="flex items-end gap-3 border-b-[3px] border-double border-foreground pb-[18px] max-sm:pb-3">
          <div className="flex min-w-0 flex-1 flex-col gap-2 max-sm:gap-1">
            <span className="font-serif text-[30px] leading-[1.1] max-sm:truncate max-sm:text-2xl">
              {company.compName}
            </span>
            <span className="font-mono text-[13px] text-muted-foreground">
              FY {year.yearName}
              <span className="max-sm:hidden"> · {yearRange(year)}</span>
            </span>
          </div>
          {/* Phones and tablets: the company list sits below this form; this jumps to it. */}
          <button
            type="button"
            onClick={() =>
              document.getElementById(BOOK_INDEX_ID)?.scrollIntoView({ behavior: 'smooth' })
            }
            aria-label="Choose another company or year"
            className="grid size-11 flex-none cursor-pointer place-items-center border-[1.5px] border-border lg:hidden"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>
        </div>

        {stage === 'login' ? (
          <form onSubmit={signIn} noValidate className="flex flex-col gap-6 max-sm:gap-4">
            <div className="flex flex-col gap-2">
              <Heading lead="Sign" tail="In" className="text-[42px] max-sm:text-[32px]" />
              <p className="m-0 text-[15px] text-muted-foreground max-sm:text-sm">
                Enter your credentials to continue
              </p>
            </div>
            <LabeledField
              id="book-user"
              label="User Name"
              placeholder="Enter username"
              value={user}
              error={errors.username}
              autoComplete="username"
              onChange={(e) => {
                setUser(e.target.value);
                clearError('username');
                setFormErr('');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  passRef.current?.focus();
                }
              }}
            />
            <LabeledField
              id="book-pass"
              label="Password"
              placeholder="Enter password"
              inputRef={passRef}
              type={show ? 'text' : 'password'}
              value={pass}
              error={errors.password}
              autoComplete="current-password"
              onChange={(e) => {
                setPass(e.target.value);
                clearError('password');
                setFormErr('');
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
            {formErr && (
              <p
                role="alert"
                className="m-0 border border-destructive bg-destructive-bg px-3.5 py-3 text-sm text-destructive"
              >
                {formErr}
              </p>
            )}
            <PrimaryButton type="submit" disabled={busy} className="max-sm:h-12">
              {busy ? 'Signing in…' : 'Sign In'}
            </PrimaryButton>
          </form>
        ) : (
          <form onSubmit={savePassword} noValidate className="flex flex-col gap-[22px] max-sm:gap-4">
            <Heading lead="Set a new" tail="password" className="text-[42px] max-sm:text-[32px]" />
            <p className="m-0 text-[15px] leading-[1.55] text-muted-foreground">
              {loginMessages.changePrompt(signedInAs)}
            </p>
            <LabeledField
              id="new-pass"
              label="New password"
              inputRef={npRef}
              type="password"
              value={np}
              error={errors.newPassword}
              autoComplete="new-password"
              onChange={(e) => {
                setNp(e.target.value);
                clearError('newPassword');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  cpRef.current?.focus();
                }
              }}
            />
            <LabeledField
              id="confirm-pass"
              label="Confirm password"
              inputRef={cpRef}
              type="password"
              value={cp}
              error={errors.confirmPassword}
              autoComplete="new-password"
              onChange={(e) => {
                setCp(e.target.value);
                clearError('confirmPassword');
              }}
            />
            {formErr && (
              <p
                role="alert"
                className="m-0 border border-destructive bg-destructive-bg px-3.5 py-3 text-sm text-destructive"
              >
                {formErr}
              </p>
            )}
            <div className="flex gap-3">
              <OutlineButton
                type="button"
                onClick={cancelChange}
                disabled={busy}
                className="h-14 bg-transparent px-[22px] text-base font-normal max-sm:h-12"
              >
                Cancel
              </OutlineButton>
              <PrimaryButton type="submit" disabled={busy} className="flex-1 max-sm:h-12">
                {busy ? 'Saving…' : 'Save password'}
              </PrimaryButton>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}

/** The right half when there is nothing to sign in to yet. */
export function NothingToOpen({
  title,
  children,
}: {
  title: [string, string];
  children: ReactNode;
}) {
  return (
    <section
      aria-label="Sign in"
      className={`${PANEL} max-sm:pb-6 max-sm:pt-5`}
    >
      <div className="flex w-full max-w-[420px] flex-col gap-4">
        <Heading lead={title[0]} tail={title[1]} className="text-[42px] max-sm:text-[32px]" />
        <p className="m-0 text-[15px] leading-[1.55] text-muted-foreground">{children}</p>
      </div>
    </section>
  );
}
