// End-to-end through HTTP: account sign-up → company → year → MDA book login → forced change.
import { beforeAll, describe, expect, test } from 'vitest';
import { createAccountAuth } from '@qi/auth';
import { openDatabase, type Db } from '@qi/db';
import { createApp } from '../src/app.ts';

const BASE = 'http://localhost:3000';
let db: Db;

beforeAll(async () => {
  ({ db } = await openDatabase());
});

/** A tiny cookie-keeping client around app.request. */
function client(app: ReturnType<typeof createApp>) {
  const jar = new Map<string, string>();
  return async (method: string, path: string, body?: unknown) => {
    const res = await app.request(`${BASE}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        origin: BASE,
        cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; '),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(';');
      const i = pair!.indexOf('=');
      const [k, v] = [pair!.slice(0, i), pair!.slice(i + 1)];
      if (v) jar.set(k, v);
      else jar.delete(k);
    }
    return { status: res.status, body: (await res.json()) as any };
  };
}

describe('cloud: account layer in front of MDA login', () => {
  let call: ReturnType<typeof client>;

  beforeAll(() => {
    const secret = 'test-secret-test-secret-test-secret';
    const app = createApp({ db, secret, accountAuth: createAccountAuth(db, { secret, baseURL: BASE }) });
    call = client(app);
  });

  test('companies are hidden until the account signs in', async () => {
    expect((await call('GET', '/api/companies')).status).toBe(401);
  });

  test('full flow', async () => {
    const signUp = await call('POST', '/api/auth/sign-up/email', {
      name: 'Owner',
      email: 'owner@example.com',
      password: 'account-pass-1',
    });
    expect(signUp.status).toBe(200);

    const company = await call('POST', '/api/companies', { compName: 'Sharma Traders', gstin: '27AAPFU0939F1ZV' });
    expect(company.status).toBe(201);

    const year = await call('POST', `/api/companies/${company.body.id}/years`, {
      yearName: '2026-2027',
      fromDate: '01/04/2026',
      toDate: '31/03/2027',
    });
    expect(year.status).toBe(201);

    const years = await call('GET', `/api/companies/${company.body.id}/years`);
    expect(years.body.map((y: any) => y.yearName)).toEqual(['2026-2027']);

    const bad = await call('POST', '/api/book/login', { yearId: year.body.id, username: 'admin', password: 'x' });
    expect(bad).toEqual({ status: 422, body: { message: 'Invalid username or password', fieldErrors: {} } });

    const login = await call('POST', '/api/book/login', { yearId: year.body.id, username: 'admin', password: 'admin' });
    expect(login.status).toBe(200);
    expect(login.body).toMatchObject({ userName: 'admin', mustChangePassword: true, companyName: 'Sharma Traders' });

    const weak = await call('POST', '/api/book/change-password', { newPassword: 'admin', confirmPassword: 'admin' });
    expect(weak.status).toBe(422);
    expect(weak.body.fieldErrors).toEqual({ newPassword: 'Use at least 6 characters' });

    const changed = await call('POST', '/api/book/change-password', { newPassword: 'secret1', confirmPassword: 'secret1' });
    expect(changed.body.mustChangePassword).toBe(false);

    expect((await call('GET', '/api/book/me')).body.mustChangePassword).toBe(false);
    await call('POST', '/api/book/logout');
    expect((await call('GET', '/api/book/me')).status).toBe(401);
  });

  test('a second account sees none of the first account’s companies', async () => {
    const other = client(
      createApp({
        db,
        secret: 'test-secret-test-secret-test-secret',
        accountAuth: createAccountAuth(db, { secret: 'test-secret-test-secret-test-secret', baseURL: BASE }),
      }),
    );
    await other('POST', '/api/auth/sign-up/email', { name: 'B', email: 'b@example.com', password: 'account-pass-2' });
    expect((await other('GET', '/api/companies')).body).toEqual([]);
  });
});

describe('desktop: no account layer, account is always "local"', () => {
  test('companies are reachable without signing in', async () => {
    const call = client(createApp({ db, secret: 'desktop-secret' }));
    expect((await call('GET', '/api/account')).body).toEqual({ accountId: 'local' });
    expect((await call('GET', '/api/companies')).status).toBe(200);
  });
});
