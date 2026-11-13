// Owner Panel (added 2026-11-13): public sign-up is closed, the owner creates and manages every
// account, and a blocked or expired account is shut out.
import { beforeAll, describe, expect, test } from 'vitest';
import { createAccountAuth } from '@qi/auth';
import { ownerMessages as om } from '@qi/core';
import { openDatabase, type Db } from '@qi/db';
import { createApp } from '../src/app.ts';

const BASE = 'http://localhost:3000';
const secret = 'test-secret-test-secret-test-secret';
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
    return { status: res.status, body: (await res.json().catch(() => null)) as any };
  };
}
type Call = ReturnType<typeof client>;
const signIn = (call: Call, email: string, password: string) =>
  call('POST', '/api/auth/sign-in/email', { email, password });

beforeAll(async () => {
  ({ db } = await openDatabase());
  const ownerEmails = ['boss@example.com'];
  app = createApp({
    db,
    secret,
    ownerEmails,
    accountAuth: createAccountAuth(db, { secret, baseURL: BASE, ownerEmails }),
  });
});

describe('Owner Panel', () => {
  let owner: Call;
  let custId = '';
  beforeAll(() => {
    owner = client();
  });

  test('before the owner exists, only the owner may sign up', async () => {
    expect((await owner('GET', '/api/setup')).body).toEqual({ ownerSignUp: true });
    const r = await client()('POST', '/api/auth/sign-up/email', {
      name: 'X',
      email: 'x@example.com',
      password: 'stranger-pass-1',
    });
    expect(r.status).toBe(403);
    expect(r.body.message).toBe(om.signUpClosed);
    const ok = await owner('POST', '/api/auth/sign-up/email', {
      name: 'Boss',
      email: 'boss@example.com',
      password: 'boss-pass-1',
    });
    expect(ok.status).toBe(200);
    expect((await owner('GET', '/api/setup')).body).toEqual({ ownerSignUp: false });
    expect((await owner('GET', '/api/account')).body.owner).toBe(true);
  });

  test('the owner creates a customer account, who can then sign in', async () => {
    const r = await owner('POST', '/api/owner/accounts', {
      name: 'Gupta',
      email: 'Gupta@Example.com',
      password: 'gupta-pass-1',
    });
    expect(r.status).toBe(201);
    custId = r.body.id;
    const dup = await owner('POST', '/api/owner/accounts', {
      name: 'G2',
      email: 'gupta@example.com',
      password: 'gupta-pass-1',
    });
    expect(dup.body.message).toBe(om.emailTaken);
    const short = await owner('POST', '/api/owner/accounts', {
      name: 'G3',
      email: 'g3@example.com',
      password: 'short',
    });
    expect(short.status).toBe(422);
    const list = (await owner('GET', '/api/owner/accounts')).body.accounts;
    expect(list.find((a: any) => a.id === custId)).toMatchObject({
      email: 'gupta@example.com',
      status: 'active',
      owner: false,
      companies: 0,
    });
    const cust = client();
    expect((await signIn(cust, 'gupta@example.com', 'gupta-pass-1')).status).toBe(200);
    expect((await cust('GET', '/api/account')).body.owner).toBe(false);
  });

  test('a customer can not reach the Owner Panel', async () => {
    const cust = client();
    await signIn(cust, 'gupta@example.com', 'gupta-pass-1');
    expect((await cust('GET', '/api/owner/accounts')).status).toBe(403);
    const r = await cust('POST', '/api/owner/accounts', {
      name: 'Y',
      email: 'y@example.com',
      password: 'y-pass-1234',
    });
    expect(r.status).toBe(403);
    expect((await client()('GET', '/api/owner/accounts')).status).toBe(401);
  });

  test('blocking shuts the customer out at once; unblocking lets them back', async () => {
    const cust = client();
    await signIn(cust, 'gupta@example.com', 'gupta-pass-1');
    const b = await owner('POST', `/api/owner/accounts/${custId}/block`, { blocked: true });
    expect(b.status).toBe(200);
    expect((await cust('GET', '/api/companies')).status).toBe(401);
    const again = await signIn(client(), 'gupta@example.com', 'gupta-pass-1');
    expect(again.status).toBe(403);
    expect(again.body.message).toBe(om.blocked);
    await owner('POST', `/api/owner/accounts/${custId}/block`, { blocked: false });
    expect((await signIn(client(), 'gupta@example.com', 'gupta-pass-1')).status).toBe(200);
  });

  test('past its valid-till date the account stops working; a later date renews it', async () => {
    const cust = client();
    await signIn(cust, 'gupta@example.com', 'gupta-pass-1');
    await owner('POST', `/api/owner/accounts/${custId}/valid-till`, { validTill: '2020-01-31' });
    const r = await cust('GET', '/api/companies');
    expect(r.status).toBe(401);
    expect(r.body.message).toBe(om.expired('31-01-2020'));
    expect((await signIn(client(), 'gupta@example.com', 'gupta-pass-1')).status).toBe(403);
    const list = (await owner('GET', '/api/owner/accounts')).body.accounts;
    expect(list.find((a: any) => a.id === custId).status).toBe('expired');
    await owner('POST', `/api/owner/accounts/${custId}/valid-till`, { validTill: '2099-12-31' });
    expect((await cust('GET', '/api/companies')).status).toBe(200);
    await owner('POST', `/api/owner/accounts/${custId}/valid-till`, { validTill: null });
  });

  test('reset password: the old one stops working and old sessions end', async () => {
    const cust = client();
    await signIn(cust, 'gupta@example.com', 'gupta-pass-1');
    const r = await owner('POST', `/api/owner/accounts/${custId}/password`, {
      password: 'new-pass-123',
    });
    expect(r.status).toBe(200);
    expect((await cust('GET', '/api/companies')).status).toBe(401);
    expect((await signIn(client(), 'gupta@example.com', 'gupta-pass-1')).status).toBe(401);
    expect((await signIn(client(), 'gupta@example.com', 'new-pass-123')).status).toBe(200);
  });

  test('a customer works on their own company; blocking stops them mid-work', async () => {
    const cust = client();
    await signIn(cust, 'gupta@example.com', 'new-pass-123');
    const company = await cust('POST', '/api/companies', { compName: 'Gupta Traders' });
    expect(company.status).toBe(201);
    const year = await cust('POST', `/api/companies/${company.body.id}/years`, {
      yearName: '2026-2027',
      fromDate: '01/04/2026',
      toDate: '31/03/2027',
    });
    expect(year.status).toBe(201);
    const login = await cust('POST', '/api/book/login', {
      yearId: year.body.id,
      username: 'admin',
      password: 'admin',
    });
    expect(login.status).toBe(200);
    await cust('POST', '/api/book/change-password', {
      newPassword: 'secret1',
      confirmPassword: 'secret1',
    });
    expect((await cust('GET', '/api/ledgers')).status).toBe(200);
    // The owner sees the company counted, but never the customer's companies themselves.
    const list = (await owner('GET', '/api/owner/accounts')).body.accounts;
    expect(list.find((a: any) => a.id === custId).companies).toBe(1);
    expect((await owner('GET', '/api/companies')).body).toEqual([]);
    // Blocked while inside a book: the book cookie is no use without the account.
    await owner('POST', `/api/owner/accounts/${custId}/block`, { blocked: true });
    expect((await cust('GET', '/api/ledgers')).status).toBe(401);
    // Unblocked: the data is all still there.
    await owner('POST', `/api/owner/accounts/${custId}/block`, { blocked: false });
    const back = client();
    await signIn(back, 'gupta@example.com', 'new-pass-123');
    const comps = (await back('GET', '/api/companies')).body;
    expect(comps.map((c: any) => c.compName)).toEqual(['Gupta Traders']);
  });

  test("the owner's own account can't be blocked or given an end date", async () => {
    const me = (await owner('GET', '/api/owner/accounts')).body.accounts.find((a: any) => a.owner);
    const r = await owner('POST', `/api/owner/accounts/${me.id}/block`, { blocked: true });
    expect(r.status).toBe(422);
    expect(r.body.message).toBe(om.ownerLocked);
    const v = await owner('POST', `/api/owner/accounts/${me.id}/valid-till`, {
      validTill: '2020-01-01',
    });
    expect(v.status).toBe(422);
    expect((await owner('GET', '/api/account')).status).toBe(200);
  });
});
