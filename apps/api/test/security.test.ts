// Review fixes of 2026-11-12, through HTTP: the book cookie is checked against the database on
// every request, a forced password change comes first, and Accounting Vouchers can't reach the
// vouchers behind bills.
import { beforeAll, describe, expect, test } from 'vitest';
import { loginMessages, permissionMessages as pm } from '@qi/core';
import { openDatabase, sql, type Db } from '@qi/db';
import { createApp } from '../src/app.ts';

const BASE = 'http://localhost:3000';
let db: Db;
let app: ReturnType<typeof createApp>;

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

describe('the book cookie is checked live (review fixes 2026-11-12)', () => {
  const admin = client();
  const boss = client(); // a second Admin, demoted later
  let yearId = '';
  let bossCode = '';

  test('set up', async () => {
    const company = await admin('POST', '/api/companies', { compName: 'Sharma Traders' });
    const year = await admin('POST', `/api/companies/${company.body.id}/years`, {
      yearName: '2026-2027', fromDate: '01/04/2026', toDate: '31/03/2027',
    });
    yearId = year.body.id;
    await admin('POST', '/api/book/login', { yearId, username: 'admin', password: 'admin' });
  }); // prettier-ignore

  test('a forced password change blocks everything else until it is done', async () => {
    expect(await admin('GET', '/api/ledgers')).toEqual({ status: 403, body: { message: loginMessages.changeRequired } });
    await admin('POST', '/api/book/change-password', { newPassword: 'secret1', confirmPassword: 'secret1' });
    expect((await admin('GET', '/api/ledgers')).status).toBe(200);
  }); // prettier-ignore

  test('a demoted Admin loses Admin rights at once, with the same cookie', async () => {
    const r = await admin('POST', '/api/users', { userName: 'boss', password: 'pass1', confirmPassword: 'pass1', role: 'Admin', isActive: true });
    bossCode = r.body.userCode;
    expect((await boss('POST', '/api/book/login', { yearId, username: 'boss', password: 'pass1' })).status).toBe(200);
    expect((await boss('GET', '/api/permissions')).status).toBe(200);
    await admin('PUT', `/api/users/${bossCode}`, { userName: 'boss', password: '', role: 'Viewer', isActive: true });
    expect((await boss('GET', '/api/permissions')).body.message).toBe(pm.adminOnly);
    const self = await boss('PUT', `/api/users/${bossCode}`, { userName: 'boss', password: '', role: 'Admin', isActive: true });
    expect(self.status).toBe(422);
    expect((await boss('GET', '/api/backup')).body.message).toBe(pm.noAccess); // Viewer: hidden
    expect((await boss('GET', '/api/book/me')).body.role).toBe('Viewer');
  }); // prettier-ignore

  test('a deactivated user is signed out at once', async () => {
    await admin('PUT', `/api/users/${bossCode}`, {
      userName: 'boss',
      password: '',
      role: 'Viewer',
      isActive: false,
    });
    expect((await boss('GET', '/api/book/me')).status).toBe(401);
    expect((await boss('GET', '/api/ledgers')).status).toBe(401);
  });

  test('Accounting Vouchers never reach a bill’s voucher, and bad ids are a clean 404/422', async () => {
    expect((await admin('GET', '/api/vouchers?types=SAL,PUR')).status).toBe(403);
    expect((await admin('POST', '/api/vouchers', { vchrType: 'SAL' })).status).toBe(403);
    expect((await admin('POST', '/api/vouchers/not-an-id/cancel')).status).toBe(422);
    expect((await admin('GET', '/api/vouchers/not-an-id/lines')).status).toBe(200);
  });
});
