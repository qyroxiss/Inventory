// Role Permissions through HTTP: pages an account can't use are refused by the server itself.
import { beforeAll, describe, expect, test } from 'vitest';
import { permissionMessages as pm } from '@qi/core';
import { openDatabase, sql, type Db } from '@qi/db';
import { ruleFor, type CallInfo } from '../src/access.ts';
import { createApp } from '../src/app.ts';

const BASE = 'http://localhost:3000';
let db: Db;
let app: ReturnType<typeof createApp>;

/** A cookie-keeping client around app.request (one per signed-in person). */
function client() {
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

beforeAll(async () => {
  ({ db } = await openDatabase());
  await db.execute(
    sql`TRUNCATE book_roles, book_users, financial_years, books, companies RESTART IDENTITY CASCADE`,
  );
  app = createApp({ db, secret: 'test-secret-test-secret-test-secret' });
});

describe('Role Permissions over HTTP (desktop / local account)', () => {
  const admin = client();
  const ravi = client(); // Operator
  const gita = client(); // Viewer
  let yearId = '';

  test('set up: company, year, the Admin and two users', async () => {
    const company = await admin('POST', '/api/companies', { compName: 'Sharma Traders' });
    const year = await admin('POST', `/api/companies/${company.body.id}/years`, {
      yearName: '2026-2027',
      fromDate: '01/04/2026',
      toDate: '31/03/2027',
    });
    yearId = year.body.id;
    expect((await admin('POST', '/api/book/login', { yearId, username: 'admin', password: 'admin' })).status).toBe(200);
    await admin('POST', '/api/book/change-password', { newPassword: 'secret1', confirmPassword: 'secret1' });
    for (const [userName, role] of [['ravi', 'Operator'], ['gita', 'Viewer']]) {
      const r = await admin('POST', '/api/users', { userName, password: 'pass1', confirmPassword: 'pass1', role, isActive: true });
      expect(r.status).toBe(201);
    }
    expect((await ravi('POST', '/api/book/login', { yearId, username: 'ravi', password: 'pass1' })).status).toBe(200);
    expect((await gita('POST', '/api/book/login', { yearId, username: 'gita', password: 'pass1' })).status).toBe(200);
  }); // prettier-ignore

  test('each person gets their own page list', async () => {
    const a = (await admin('GET', '/api/book/access')).body.pages;
    expect(a['Role Permissions']).toBe('full');
    const r = (await ravi('GET', '/api/book/access')).body.pages;
    expect([r['Sales Invoice'], r['Ledger Creation'], r['Role Permissions']]).toEqual([
      'full',
      'hidden',
      'hidden',
    ]);
  });

  test('a hidden page is refused; shared lookups still work', async () => {
    expect(await ravi('POST', '/api/ledgers', { accName: 'X' })).toEqual({ status: 403, body: { message: pm.noAccess } });
    expect((await ravi('GET', '/api/ledgers')).status).toBe(200);
    expect((await ravi('GET', '/api/reports/trial-balance?to=2026-05-01')).status).toBe(403);
    expect((await gita('GET', '/api/sales')).status).toBe(403);
    expect((await gita('GET', '/api/reports/trial-balance?to=2026-05-01')).status).toBe(200);
    expect((await ravi('GET', '/api/dashboard')).status).toBe(200);
  }); // prettier-ignore

  test('View only: lists open, saving is refused', async () => {
    const roles = (await admin('GET', '/api/permissions')).body.roles;
    const op = roles.find((x: any) => x.name === 'Operator');
    const put = await admin('PUT', '/api/permissions/roles/Operator', { pages: { ...op.pages, Receipt: 'view' } });
    expect(put.status).toBe(200);
    expect((await ravi('GET', '/api/vouchers?types=RCP,BNK')).status).toBe(200);
    expect(await ravi('POST', '/api/vouchers', { vchrType: 'RCP' })).toEqual({ status: 403, body: { message: pm.viewOnly } });
    // Payment is still full: the request gets past permissions (and fails on its own checks).
    expect((await ravi('POST', '/api/vouchers', { vchrType: 'PAY' })).status).not.toBe(403);
  }); // prettier-ignore

  test('a change for one user applies on their next request', async () => {
    const users = (await admin('GET', '/api/permissions')).body.users;
    const code = users.find((u: any) => u.userName === 'ravi').userCode;
    await admin('PUT', `/api/permissions/users/${code}`, { pages: { 'Trial Balance': 'view' } });
    expect((await ravi('GET', '/api/reports/trial-balance?to=2026-05-01')).status).toBe(200);
  });

  test('only an Admin can open Role Permissions', async () => {
    expect((await ravi('GET', '/api/permissions')).body.message).toBe(pm.adminOnly);
    expect((await ravi('PUT', '/api/permissions/roles/Operator', { pages: {} })).body.message).toBe(
      pm.adminOnly,
    );
  });
});

describe('which page an API call belongs to (access.ts)', () => {
  const call = (method: string, path: string, extra: Partial<CallInfo> = {}): CallInfo => ({
    method,
    path,
    query: () => undefined,
    body: async () => ({}),
    voucherType: async () => null,
    ...extra,
  });

  test('changing or cancelling a voucher goes by the voucher’s own type', async () => {
    const byId = { voucherType: async () => 'BPAY' };
    expect(await ruleFor(call('PUT', '/api/vouchers/abc', byId))).toEqual({
      pages: ['Payment'],
      need: 'full',
    });
    expect(await ruleFor(call('POST', '/api/vouchers/abc/cancel', byId))).toEqual({
      pages: ['Payment'],
      need: 'full',
    });
  });

  test('returns go by kind; masters only guard changes; lookups are open', async () => {
    expect(await ruleFor(call('POST', '/api/returns', { body: async () => ({ kind: 'SRT' }) }))).toEqual({ pages: ['Sales Return'], need: 'full' });
    expect(await ruleFor(call('GET', '/api/returns', { query: (k) => (k === 'kind' ? 'PRT' : undefined) }))).toEqual({ pages: ['Purchase Return'], need: 'view' });
    expect(await ruleFor(call('DELETE', '/api/misc-masters/godown/GD001'))).toEqual({ pages: ['Godown'], need: 'full' });
    expect(await ruleFor(call('GET', '/api/stock-items'))).toBeNull();
    expect(await ruleFor(call('GET', '/api/purchases/setup'))).toBeNull();
    expect(await ruleFor(call('GET', '/api/vouchers/abc/lines'))).toBeNull();
    expect(await ruleFor(call('PUT', '/api/settings/series/RCP'))).toEqual({ pages: ['Company Settings'], need: 'full' });
  }); // prettier-ignore
});
