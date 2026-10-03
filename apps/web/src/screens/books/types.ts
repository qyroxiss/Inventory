import { formatDmy } from '@qi/core';
import type { OkBody, api } from '../../api.ts';

/** One company of the index, as /api/book-index returns it. */
export type IndexCompany = OkBody<
  Awaited<ReturnType<(typeof api.api)['book-index']['$get']>>
>[number];
export type IndexYear = IndexCompany['years'][number];

/** '01/04/2026 – 31/03/2027' */
export const yearRange = (y: IndexYear) => `${formatDmy(y.fromDate)} – ${formatDmy(y.toDate)}`;
