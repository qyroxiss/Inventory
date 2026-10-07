// The HTTP app. Mounted by src/server.ts (cloud / local dev) and, in Phase 7, by apps/desktop.
//
// Two login layers (docs/ARCHITECTURE.md §3.7):
//   1. account  — better-auth at /api/auth/*  (cloud only; desktop is always account 'local')
//   2. book     — MDA's login at /api/book/*, kept in a signed cookie per browser

import { zValidator } from '@hono/zod-validator';
import type { AccountAuth } from '@qi/auth';
import * as contract from '@qi/contract';
import { MISC_CITY_CODE_PREFIX, MISC_MASTER_KINDS, loginMessages } from '@qi/core';
import type { Db } from '@qi/db';
import {
  UserError,
  addMiscIfNew,
  bookLogin,
  changeBookPassword,
  createCompany,
  createGroup,
  createLedger,
  createSubGroup,
  createMiscMaster,
  createStockGroup,
  createStockSubGroup,
  createSaleType,
  createStockItem,
  cancelVoucher,
  listVouchers,
  nextVoucherNo,
  saveVoucher,
  updateVoucher,
  voucherForPrint,
  voucherLinesOf,
  createYear,
  deleteCompany,
  deleteGroup,
  deleteLedger,
  deleteSubGroup,
  deleteYear,
  getDashboard,
  importMda,
  listAllGroups,
  listGroups,
  listLedgers,
  listMisc,
  listSubGroups,
  listMiscMaster,
  listStockGroups,
  listStockSubGroups,
  listSaleTypes,
  listStockItems,
  removeMiscMaster,
  removeStockGroup,
  removeStockSubGroup,
  removeSaleType,
  removeStockItem,
  updateCompany,
  updateGroup,
  updateLedger,
  updateSubGroup,
  updateMiscMaster,
  updateStockGroup,
  updateStockSubGroup,
  updateSaleType,
  updateStockItem,
  listBookIndex,
  listCompanies,
  listYears,
  type BookSession,
} from '@qi/services';
import { Hono, type Context } from 'hono';
import { deleteCookie, getSignedCookie, setSignedCookie } from 'hono/cookie';
import { type ZodType, z } from 'zod';

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

/** `:kind` (and `:code`) of /api/misc-masters: 'unit' or 'godown'; any other kind is a 404. */
const params = <T extends z.ZodRawShape>(shape: T) =>
  zValidator('param', z.object(shape), (result, c) => {
    if (!result.success) return c.json({ message: 'Not found' }, 404);
  });
const kindParam = params({ kind: z.enum(MISC_MASTER_KINDS) });
const kindCodeParam = params({ kind: z.enum(MISC_MASTER_KINDS), code: z.string() });

/** Who is posting and the open year, for the posting gate. */
const postingContext = (book: BookSession) => ({
  bookId: book.bookId,
  userName: book.userName,
  fyFrom: book.fyFrom,
  fyTo: book.fyTo,
  financialYearLabel: book.financialYearLabel,
});

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
    .post('/api/import/mda', json(contract.mdaImport), async (c) =>
      c.json(await importMda(db, c.get('accountId'), c.req.valid('json')), 201),
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
    .get('/api/sub-groups', async (c) => {
      const book = await readBook(c);
      if (!book) return c.json({ message: 'Not logged in to a book.' }, 401);
      return c.json(await listSubGroups(db, book.bookId));
    })
    .post('/api/sub-groups', json(contract.subGroupCreate), async (c) => {
      const book = await readBook(c);
      if (!book) return c.json({ message: 'Not logged in to a book.' }, 401);
      return c.json(await createSubGroup(db, book.bookId, c.req.valid('json')), 201);
    })
    .put('/api/sub-groups/:grpCode', json(contract.subGroupCreate), async (c) => {
      const book = await readBook(c);
      if (!book) return c.json({ message: 'Not logged in to a book.' }, 401);
      return c.json(
        await updateSubGroup(db, book.bookId, c.req.param('grpCode'), c.req.valid('json')),
      );
    })
    .delete('/api/sub-groups/:grpCode', async (c) => {
      const book = await readBook(c);
      if (!book) return c.json({ message: 'Not logged in to a book.' }, 401);
      await deleteSubGroup(db, book.bookId, c.req.param('grpCode'));
      return c.json({ ok: true });
    })

    .get('/api/groups/all', async (c) => {
      const book = await readBook(c);
      if (!book) return c.json({ message: 'Not logged in to a book.' }, 401);
      return c.json(await listAllGroups(db, book.bookId));
    })
    .get('/api/ledgers', async (c) => {
      const book = await readBook(c);
      if (!book) return c.json({ message: 'Not logged in to a book.' }, 401);
      return c.json(await listLedgers(db, book.bookId));
    })
    .post('/api/ledgers', json(contract.ledgerCreate), async (c) => {
      const book = await readBook(c);
      if (!book) return c.json({ message: 'Not logged in to a book.' }, 401);
      return c.json(await createLedger(db, book.bookId, c.req.valid('json')), 201);
    })
    .put('/api/ledgers/:accCode', json(contract.ledgerCreate), async (c) => {
      const book = await readBook(c);
      if (!book) return c.json({ message: 'Not logged in to a book.' }, 401);
      return c.json(
        await updateLedger(db, book.bookId, c.req.param('accCode'), c.req.valid('json')),
      );
    })
    .delete('/api/ledgers/:accCode', async (c) => {
      const book = await readBook(c);
      if (!book) return c.json({ message: 'Not logged in to a book.' }, 401);
      await deleteLedger(db, book.bookId, c.req.param('accCode'));
      return c.json({ ok: true });
    })

    // ── Unit Master and Godown (Misc_Master rows of type 'Unit' / 'Godown') ────────
    .get('/api/misc-masters/:kind', kindParam, async (c) => {
      const book = await readBook(c);
      if (!book) return c.json({ message: 'Not logged in to a book.' }, 401);
      return c.json(await listMiscMaster(db, book.bookId, c.req.valid('param').kind));
    })
    .post('/api/misc-masters/:kind', kindParam, json(contract.miscMasterSave), async (c) => {
      const book = await readBook(c);
      if (!book) return c.json({ message: 'Not logged in to a book.' }, 401);
      const { kind } = c.req.valid('param');
      return c.json(await createMiscMaster(db, book.bookId, kind, c.req.valid('json')), 201);
    })
    .put(
      '/api/misc-masters/:kind/:code',
      kindCodeParam,
      json(contract.miscMasterSave),
      async (c) => {
        const book = await readBook(c);
        if (!book) return c.json({ message: 'Not logged in to a book.' }, 401);
        const { kind, code } = c.req.valid('param');
        return c.json(await updateMiscMaster(db, book.bookId, kind, code, c.req.valid('json')));
      },
    )
    .delete('/api/misc-masters/:kind/:code', kindCodeParam, async (c) => {
      const book = await readBook(c);
      if (!book) return c.json({ message: 'Not logged in to a book.' }, 401);
      const { kind, code } = c.req.valid('param');
      await removeMiscMaster(db, book.bookId, kind, code);
      return c.json({ ok: true });
    })

    // ── Stock Group (Misc_Master rows of type 'StockGroup') ──────────────────────
    .get('/api/stock-groups', async (c) => {
      const book = await readBook(c);
      if (!book) return c.json({ message: 'Not logged in to a book.' }, 401);
      return c.json(await listStockGroups(db, book.bookId));
    })
    .post('/api/stock-groups', json(contract.stockGroupSave), async (c) => {
      const book = await readBook(c);
      if (!book) return c.json({ message: 'Not logged in to a book.' }, 401);
      return c.json(await createStockGroup(db, book.bookId, c.req.valid('json')), 201);
    })
    .put('/api/stock-groups/:code', json(contract.stockGroupSave), async (c) => {
      const book = await readBook(c);
      if (!book) return c.json({ message: 'Not logged in to a book.' }, 401);
      return c.json(
        await updateStockGroup(db, book.bookId, c.req.param('code'), c.req.valid('json')),
      );
    })
    .delete('/api/stock-groups/:code', async (c) => {
      const book = await readBook(c);
      if (!book) return c.json({ message: 'Not logged in to a book.' }, 401);
      await removeStockGroup(db, book.bookId, c.req.param('code'));
      return c.json({ ok: true });
    })

    // ── Stock Sub Group ──
    .get('/api/stock-sub-groups', async (c) => {
      const book = await readBook(c);
      if (!book) return c.json({ message: 'Not logged in to a book.' }, 401);
      return c.json(await listStockSubGroups(db, book.bookId));
    })
    .post('/api/stock-sub-groups', json(contract.stockSubGroupSave), async (c) => {
      const book = await readBook(c);
      if (!book) return c.json({ message: 'Not logged in to a book.' }, 401);
      return c.json(await createStockSubGroup(db, book.bookId, c.req.valid('json')), 201);
    })
    .put('/api/stock-sub-groups/:code', json(contract.stockSubGroupSave), async (c) => {
      const book = await readBook(c);
      if (!book) return c.json({ message: 'Not logged in to a book.' }, 401);
      return c.json(
        await updateStockSubGroup(db, book.bookId, c.req.param('code'), c.req.valid('json')),
      );
    })
    .delete('/api/stock-sub-groups/:code', async (c) => {
      const book = await readBook(c);
      if (!book) return c.json({ message: 'Not logged in to a book.' }, 401);
      await removeStockSubGroup(db, book.bookId, c.req.param('code'));
      return c.json({ ok: true });
    })

    // ── Sale Type Master ──
    .get('/api/sale-types', async (c) => {
      const book = await readBook(c);
      if (!book) return c.json({ message: 'Not logged in to a book.' }, 401);
      return c.json(await listSaleTypes(db, book.bookId));
    })
    .post('/api/sale-types', json(contract.saleTypeSave), async (c) => {
      const book = await readBook(c);
      if (!book) return c.json({ message: 'Not logged in to a book.' }, 401);
      return c.json(await createSaleType(db, book.bookId, c.req.valid('json')), 201);
    })
    .put('/api/sale-types/:code', json(contract.saleTypeSave), async (c) => {
      const book = await readBook(c);
      if (!book) return c.json({ message: 'Not logged in to a book.' }, 401);
      return c.json(
        await updateSaleType(db, book.bookId, c.req.param('code'), c.req.valid('json')),
      );
    })
    .delete('/api/sale-types/:code', async (c) => {
      const book = await readBook(c);
      if (!book) return c.json({ message: 'Not logged in to a book.' }, 401);
      await removeSaleType(db, book.bookId, c.req.param('code'));
      return c.json({ ok: true });
    })

    // ── Stock Item (Part_Master) ──
    .get('/api/stock-items', async (c) => {
      const book = await readBook(c);
      if (!book) return c.json({ message: 'Not logged in to a book.' }, 401);
      return c.json(await listStockItems(db, book.bookId));
    })
    .post('/api/stock-items', json(contract.stockItemSave), async (c) => {
      const book = await readBook(c);
      if (!book) return c.json({ message: 'Not logged in to a book.' }, 401);
      return c.json(await createStockItem(db, book.bookId, c.req.valid('json')), 201);
    })
    .put('/api/stock-items/:code', json(contract.stockItemSave), async (c) => {
      const book = await readBook(c);
      if (!book) return c.json({ message: 'Not logged in to a book.' }, 401);
      return c.json(
        await updateStockItem(db, book.bookId, c.req.param('code'), c.req.valid('json')),
      );
    })
    .delete('/api/stock-items/:code', async (c) => {
      const book = await readBook(c);
      if (!book) return c.json({ message: 'Not logged in to a book.' }, 401);
      await removeStockItem(db, book.bookId, c.req.param('code'));
      return c.json({ ok: true });
    })

    // ── Accounting Vouchers (posting_service.dart) ──────────────────────────────
    .get(
      '/api/vouchers',
      zValidator('query', z.object({ types: z.string(), cancelled: z.string().optional() })),
      async (c) => {
        const book = await readBook(c);
        if (!book) return c.json({ message: 'Not logged in to a book.' }, 401);
        const { types, cancelled } = c.req.valid('query');
        return c.json(
          await listVouchers(db, book.bookId, types.split(',').filter(Boolean), cancelled === '1'),
        );
      },
    )
    .get('/api/vouchers/next', zValidator('query', z.object({ type: z.string() })), async (c) => {
      const book = await readBook(c);
      if (!book) return c.json({ message: 'Not logged in to a book.' }, 401);
      return c.json({ vchrNo: await nextVoucherNo(db, book.bookId, c.req.valid('query').type) });
    })
    .get(
      '/api/vouchers/print',
      zValidator('query', z.object({ no: z.string(), kind: z.enum(['receipt', 'payment']) })),
      async (c) => {
        const book = await readBook(c);
        if (!book) return c.json({ message: 'Not logged in to a book.' }, 401);
        const { no, kind } = c.req.valid('query');
        const receipt = kind === 'receipt';
        const v = await voucherForPrint(
          db,
          book.bookId,
          no.trim(),
          receipt ? ['RCP', 'BNK'] : ['PAY', 'BPAY'],
          receipt ? 'cr' : 'dr',
        );
        return c.json({ voucher: v });
      },
    )
    .get('/api/vouchers/:id/lines', async (c) => {
      const book = await readBook(c);
      if (!book) return c.json({ message: 'Not logged in to a book.' }, 401);
      return c.json(await voucherLinesOf(db, book.bookId, c.req.param('id')));
    })
    .post('/api/vouchers', json(contract.voucherSave), async (c) => {
      const book = await readBook(c);
      if (!book) return c.json({ message: 'Not logged in to a book.' }, 401);
      return c.json(await saveVoucher(db, postingContext(book), c.req.valid('json')), 201);
    })
    .put('/api/vouchers/:id', json(contract.voucherUpdate), async (c) => {
      const book = await readBook(c);
      if (!book) return c.json({ message: 'Not logged in to a book.' }, 401);
      return c.json(
        await updateVoucher(db, postingContext(book), c.req.param('id'), c.req.valid('json')),
      );
    })
    .post('/api/vouchers/:id/cancel', async (c) => {
      const book = await readBook(c);
      if (!book) return c.json({ message: 'Not logged in to a book.' }, 401);
      await cancelVoucher(db, postingContext(book), c.req.param('id'));
      return c.json({ ok: true });
    })

    // ── Misc lists (City today; Unit/Godown/Stock Group/Sale Type share this later) ─────────────
    .get(
      '/api/misc-list',
      zValidator('query', z.object({ type: z.string() }), (result, c) => {
        if (!result.success) return c.json({ message: 'Invalid request' }, 400);
      }),
      async (c) => {
        const book = await readBook(c);
        if (!book) return c.json({ message: 'Not logged in to a book.' }, 401);
        return c.json(await listMisc(db, book.bookId, c.req.valid('query').type));
      },
    )
    .post('/api/misc-list', json(contract.miscListAdd), async (c) => {
      const book = await readBook(c);
      if (!book) return c.json({ message: 'Not logged in to a book.' }, 401);
      const { type, name } = c.req.valid('json');
      const stored = await addMiscIfNew(db, book.bookId, type, MISC_CITY_CODE_PREFIX, name);
      return c.json({ name: stored }, 201);
    })

    .post('/api/book/logout', (c) => {
      deleteCookie(c, BOOK_COOKIE, { path: '/api' });
      return c.json({ ok: true });
    });

  return app;
}

export type AppType = ReturnType<typeof createApp>;
