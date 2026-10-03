// Typed API client. The types come straight from apps/api's routes, so changing a route
// breaks this build at compile time instead of failing at runtime.

import type { AppType } from '@qi/api';
import type { ErrorBody } from '@qi/contract';
import { hc } from 'hono/client';

/** Same origin in the browser (Vite proxies /api in dev); Electron/Capacitor set this at start-up. */
export const baseUrl =
  (globalThis as { __API_BASE__?: string }).__API_BASE__ ?? window.location.origin;

export const api = hc<AppType>(baseUrl, { init: { credentials: 'include' } });

/** An API failure carrying MDA's message and per-field errors, ready to show on a form. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: ErrorBody,
  ) {
    super(body.message);
  }
}

type AnyResponse = { ok: boolean; status: number; json(): Promise<unknown> };

/** The JSON body of a route's success responses (its error responses are typed `ok: false`). */
export type OkBody<R> = R extends { ok: false }
  ? never
  : R extends { json(): Promise<infer T> }
    ? T
    : never;

/** Unwraps a response: returns the JSON body, or throws ApiError with the server's message. */
export async function unwrap<R extends AnyResponse>(res: Promise<R>): Promise<OkBody<R>> {
  const r = await res;
  if (r.ok) return (await r.json()) as OkBody<R>;
  const body = (await r
    .json()
    .catch(() => ({ message: 'Something went wrong. Please try again.' }))) as ErrorBody;
  throw new ApiError(r.status, body);
}
