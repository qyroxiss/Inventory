// Account layer (layer 1, web only): sign in / create account / logout, through better-auth's
// endpoints under /api/auth. Desktop has no account layer; there these endpoints answer 404.

import { loginMessages } from '@qi/core';
import { baseUrl } from '../api.ts';

/** better-auth's own messages (better-auth 1.7 error codes), shown as they are. */
export const accountMessages = {
  required: loginMessages.required,
  invalidEmail: 'Invalid email',
  invalidLogin: 'Invalid email or password',
  tooShort: 'Password too short',
  exists: 'User already exists. Use another email.',
  mismatch: loginMessages.mismatch,
  failed: 'Something went wrong. Please try again.',
};

/** better-auth's default minimum password length. */
export const MIN_PASSWORD = 8;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type Errors = Record<string, string>;

export function signInErrors(v: { email: string; password: string }): Errors {
  const e: Errors = {};
  if (!v.email.trim()) e.email = accountMessages.required;
  else if (!EMAIL.test(v.email.trim())) e.email = accountMessages.invalidEmail;
  if (!v.password) e.password = accountMessages.required;
  return e;
}

export function createErrors(v: {
  name: string;
  email: string;
  password: string;
  confirm: string;
}): Errors {
  const e: Errors = signInErrors(v);
  if (!v.name.trim()) e.name = accountMessages.required;
  if (v.password && v.password.length < MIN_PASSWORD) e.password = accountMessages.tooShort;
  if (v.confirm !== v.password) e.confirm = accountMessages.mismatch;
  return e;
}

/** A failed account call: a field error when the server names one, else a form message. */
export class AccountError extends Error {
  constructor(
    message: string,
    readonly field?: 'email' | 'password',
  ) {
    super(message);
  }
}

const FIELD: Record<string, 'email' | 'password'> = {
  INVALID_EMAIL: 'email',
  PASSWORD_TOO_SHORT: 'password',
};

async function post(path: string, body?: unknown) {
  let res: Response;
  try {
    res = await fetch(`${baseUrl}/api/auth/${path}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    });
  } catch {
    throw new AccountError(accountMessages.failed);
  }
  if (res.ok) return;
  const err = (await res.json().catch(() => ({}))) as { code?: string; message?: string };
  throw new AccountError(
    err.message || accountMessages.failed,
    err.code ? FIELD[err.code] : undefined,
  );
}

export const signIn = (email: string, password: string, rememberMe: boolean) =>
  post('sign-in/email', { email: email.trim(), password, rememberMe });

export const createAccount = (name: string, email: string, password: string) =>
  post('sign-up/email', { name: name.trim(), email: email.trim(), password });

export const logoutAccount = () => post('sign-out');

/** The signed-in account's name and email; null when signed out or on desktop (no account layer). */
export async function getAccount(): Promise<{ name: string; email: string } | null> {
  try {
    const res = await fetch(`${baseUrl}/api/auth/get-session`, { credentials: 'include' });
    if (!res.ok) return null;
    const data = (await res.json()) as { user?: { name: string; email: string } } | null;
    return data?.user ?? null;
  } catch {
    return null;
  }
}
