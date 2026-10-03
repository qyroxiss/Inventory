// The HTTP app. Mounted by src/server.ts (cloud / local dev) and, in Phase 7, by apps/desktop.
//
// Two login layers (docs/ARCHITECTURE.md §3.7):
//   1. account  — better-auth at /api/auth/*  (cloud only; desktop is always account 'local')
//   2. book     — MDA's login at /api/book/*, kept in a signed cookie per browser

import { zValidator } from '@hono/zod-validator';
import type { AccountAuth } from '@qi/auth';
import * as contract from '@qi/contract';
import { loginMessages } from '@qi/core';
import type { Db } from '@qi/db';
import {
  UserError,
  bookLogin,
  changeBookPassword,
  createCompany,
  createGroup,
  createYear,
  deleteCompany,
  deleteGroup,
  deleteYear,
  getDashboard,
  listGroups,
  updateCompany,
  updateGroup,
  listBookIndex,
  listCompanies,
  listYears,
  type BookSession,
} from '@qi/services';
import { Hono, type Context } from 'hono';
import { deleteCookie, getSignedCookie, setSignedCookie } from 'hono/cookie';
import type { ZodType } from 'zod';

export type AppOptions = {
  db: Db;
  /** Signs the book-session cookie. */
  secret: string;
  /** Cloud: the better-auth instance. Omit for desktop, where the account is always 'local'. */
  accountAuth?: AccountAuth;
  /** Send cookies with the Secure flag (true behind HTTPS). */
  secureCookies?: boolean;
};

type Env = { Variables: { accountId: string } };

const BOOK_COOKIE = 'qi_book';
type StoredBook = BookSession & { accountId: string };

const json = <T extends ZodType>(schema: T) =>
  zValidator('json', schema, (result, c) => {
    if (!result.success) return c.json({ message: 'Invalid request' }, 400);
  });

export function createApp(opts: AppOptions) {
  const { db, secret, accountAuth } = opts;

  const readBook = async (c: Context<Env>): Promise<StoredBook | null> => {
    const raw = await getSignedCookie(c, secret, BOOK_COOKIE);
    if (!raw) return null;
    try {
      const book = JSON.parse(raw) as StoredBook;
      return book.accountId === c.get('accountId') ? book : null;
    } catch {
      return null;
    }
  };

  const writeBook = (c: Context<Env>, book: StoredBook) =>
    setSignedCookie(c, BOOK_COOKIE, JSON.stringify(book), secret, {
      path: '/api',
      httpOnly: true,
      sameSite: 'Lax',
      secure: opts.secureCookies ?? false,
    });

  const app = new Hono<Env>()
    .onError((err, c) => {
      if (err instanceof UserError) {
        return c.json({ message: err.message, fieldErrors: err.fieldErrors }, 422);
      }
      console.error(err);
      return c.json({ message: 'Something went wrong. Please try again.' }, 500);
    })

    .get('/healthz', (c) => c.json({ ok: true }))

    // ── Layer 1: account ────────────────────────────────────────────────────────
    .on(['GET', 'POST'], '/api/auth/*', (c) =>
      accountAuth ? accountAuth.handler(c.req.raw) : c.json({ message: 'Not available' }, 404),
    )

    .use('/api/*', async (c, next) => {
      if (c.req.path.startsWith('/api/auth/')) return next();
      if (!accountAuth) {
        c.set('accountId', 'local');
        return next();
      }
      const session = await accountAuth.api.getSession({ headers: c.req.raw.headers });
      if (!session) return c.json({ message: 'Please sign in to your account.' }, 401);
      c.set('accountId', session.user.id);
      return next();
    })

    .get('/api/account', (c) => c.json({ accountId: c.get('accountId') }))

    // ── Company & year registry (the screen before MDA's login) ─────────────────
    .get('/api/book-index', async (c) => c.json(await listBookIndex(db, c.get('accountId'))))
    .get('/api/companies', async (c) => c.json(await listCompanies(db, c.get('accountId'))))
    .post('/api/companies', json(contract.companyCreate), async (c) =>
      c.json(await createCompany(db, c.get('accountId'), c.req.valid('json')), 201),
    )
    .put('/api/companies/:companyId', json(contract.companyCreate), async (c) =>
      c.json(
        await updateCompany(db, c.get('accountId'), c.req.param('companyId'), c.req.valid('json')),
      ),
    )
    .delete('/api/companies/:companyId', async (c) => {
      await deleteCompany(db, c.get('accountId'), c.req.param('companyId'));
      return c.json({ ok: true });
    })
    .delete('/api/years/:yearId', async (c) => {
      await deleteYear(db, c.get('accountId'), c.req.param('yearId'));
      return c.json({ ok: true });
    })
    .get('/api/companies/:companyId/years', async (c) =>
      c.json(await listYears(db, c.get('accountId'), c.req.param('companyId'))),
    )
    .post('/api/companies/:companyId/years', json(contract.yearCreate), async (c) =>
      c.json(
        await createYear(db, c.get('accountId'), c.req.param('companyId'), c.req.valid('json')),
        201,
      ),
    )

    // ── Layer 2: book login (MDA's login) ───────────────────────────────────────
    .post('/api/book/login', json(contract.bookLogin), async (c) => {
      let book: BookSession;
      try {
        book = await bookLogin(db, c.get('accountId'), c.req.valid('json'));
      } catch (err) {
        if (err instanceof UserError) throw err;
        console.error(err);
        return c.json({ message: loginMessages.failed }, 500);
      }
      await writeBook(c, { ...book, accountId: c.get('accountId') });
      return c.json(book);
    })
    .get('/api/book/me', async (c) => {
      const book = await readBook(c);
      return book ? c.json(book) : c.json({ message: 'Not logged in to a book.' }, 401);
    })
    .post('/api/book/change-password', json(contract.changePassword), async (c) => {
      const book = await readBook(c);
      if (!book) return c.json({ message: 'Not logged in to a book.' }, 401);
      await changeBookPassword(db, book, c.req.valid('json'));
      const updated = { ...book, mustChangePassword: false };
      await writeBook(c, updated);
      return c.json(updated);
    })
    .get('/api/dashboard', async (c) => {
      const book = await readBook(c);
      if (!book) return c.json({ message: 'Not logged in to a book.' }, 401);
      return c.json(await getDashboard(db, book));
    })

    // ── Masters (book-scoped) ────────────────────────────────────────────────────
    .get('/api/groups', async (c) => {
      const book = await readBook(c);
      if (!book) return c.json({ message: 'Not logged in to a book.' }, 401);
      return c.json(await listGroups(db, book.bookId));
    })
    .post('/api/groups', json(contract.groupCreate), async (c) => {
      const book = await readBook(c);
      if (!book) return c.json({ message: 'Not logged in to a book.' }, 401);
      return c.json(await createGroup(db, book.bookId, c.req.valid('json')), 201);
    })
    .put('/api/groups/:grpCode', json(contract.groupCreate), async (c) => {
      const book = await readBook(c);
      if (!book) return c.json({ message: 'Not logged in to a book.' }, 401);
      return c.json(
        await updateGroup(db, book.bookId, c.req.param('grpCode'), c.req.valid('json')),
      );
    })
    .delete('/api/groups/:grpCode', async (c) => {
      const book = await readBook(c);
      if (!book) return c.json({ message: 'Not logged in to a book.' }, 401);
      await deleteGroup(db, book.bookId, c.req.param('grpCode'));
      return c.json({ ok: true });
    })

    .post('/api/book/logout', (c) => {
      deleteCookie(c, BOOK_COOKIE, { path: '/api' });
      return c.json({ ok: true });
    });

  return app;
}

export type AppType = ReturnType<typeof createApp>;
