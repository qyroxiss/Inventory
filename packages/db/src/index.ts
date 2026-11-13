// @qi/db — Drizzle schema (pg dialect), migrations and the database client.
export * as schema from './schema.ts';
export { openDatabase, type Db, type DbOptions, type Schema } from './client.ts';
// Query helpers re-exported so every package uses this package's single copy of drizzle-orm.
export { and, asc, count, desc, eq, gt, gte, inArray, lt, lte, max, ne, or, sql } from 'drizzle-orm';
export { alias } from 'drizzle-orm/pg-core';
