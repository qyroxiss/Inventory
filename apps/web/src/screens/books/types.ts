import { formatDmy } from '@qi/core';
import type { OkBody, api } from '../../api.ts';

/** One company of the index, as /api/book-index returns it. */
export type IndexCompany = OkBody<
  Awaited<ReturnType<(typeof api.api)['book-index']['$get']>>
>[number];
export type IndexYear = IndexCompany['years'][number];

/** The company list's element id, so the sign-in panel can scroll to it on a phone. */
export const BOOK_INDEX_ID = 'book-index';
/** The sign-in panel's element id, so picking a year on a phone can scroll back up to it. */
export const SIGN_IN_ID = 'book-sign-in';

/** '01/04/2026 – 31/03/2027' */
export const yearRange = (y: IndexYear) => `${formatDmy(y.fromDate)} – ${formatDmy(y.toDate)}`;
