import { beforeAll, expect, test } from 'vitest';
import { openDatabase } from '@qi/db';
import { createApp } from '../src/app.ts';

let app: ReturnType<typeof createApp>;
beforeAll(async () => {
  const { db } = await openDatabase();
  app = createApp({ db, secret: 'test-secret' });
});

test('GET /healthz', async () => {
  const res = await app.request('/healthz');
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ ok: true });
});
