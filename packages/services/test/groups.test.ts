import { beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { openDatabase, sql, type Db } from '@qi/db';
import {
  UserError,
  createCompany,
  createGroup,
  createSubGroup,
  createYear,
  deleteGroup,
  deleteSubGroup,
  listGroups,
  listSubGroups,
  updateGroup,
  updateSubGroup,
} from '../src/index.ts';

const ACC = 'acc-1';
let db: Db;
let bookId: string;

beforeAll(async () => {
  ({ db } = await openDatabase());
});
beforeEach(async () => {
  await db.execute(
    sql`TRUNCATE audit_log, book_users, account_groups, financial_years, books, companies RESTART IDENTITY CASCADE`,
  );
  const company = await createCompany(db, ACC, { compName: 'Sharma Traders' }, 1000);
  const year = await createYear(db, ACC, company.id, {
    yearName: '2026-2027',
    fromDate: '01/04/2026',
    toDate: '31/03/2027',
  });
  bookId = year.bookId;
});

const rejects = async (p: Promise<unknown>, message: string) => {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(UserError);
  expect((err as UserError).message).toBe(message);
};

describe('a new book', () => {
  test('starts with the 16 default top-level groups', async () => {
    const rows = await listGroups(db, bookId);
    expect(rows).toHaveLength(16);
    expect(rows.map((g) => g.grpCode)).toContain('A001');
    expect(rows.every((g) => g.parentGrp === 'Parent')).toBe(true);
  });
});

describe('createGroup', () => {
  test('generates the next code for the type, after the seeded ones', async () => {
    const g = await createGroup(db, bookId, { name: 'Petty Cash', type: 'Assets' });
    expect(g.grpCode).toBe('A011'); // A001..A010 are already seeded
    expect(g.parentGrp).toBe('Parent');
    expect(g.isLedger).toBe('No');
  });

  test('Group Ledger defaults to No when left unselected', async () => {
    const g = await createGroup(db, bookId, { name: 'Misc Group', type: 'Income' });
    expect(g.isLedger).toBe('No');
  });

  test('rejects a duplicate name, even against a seeded group', async () => {
    await rejects(
      createGroup(db, bookId, { name: 'Current Assets', type: 'Assets' }),
      'Name is Already Exists..',
    );
  });

  test('requires a name and a type', async () => {
    await rejects(createGroup(db, bookId, { name: '', type: 'Assets' }), 'Group name is required');
    await rejects(createGroup(db, bookId, { name: 'Petty Cash' }), 'Please select a group type');
  });
});

describe('updateGroup', () => {
  test('renames and re-types a group, keeping it top level', async () => {
    const g = await createGroup(db, bookId, { name: 'Temp', type: 'Assets' });
    const updated = await updateGroup(db, bookId, g.grpCode, {
      name: 'Petty Cash',
      type: 'Income',
    });
    expect(updated.grpName).toBe('Petty Cash');
    expect(updated.grpType).toBe('Income');
    expect(updated.parentGrp).toBe('Parent');
  });

  test('rejects a rename onto an existing name', async () => {
    await createGroup(db, bookId, { name: 'Petty Cash', type: 'Assets' });
    const g = await createGroup(db, bookId, { name: 'Temp', type: 'Assets' });
    await rejects(
      updateGroup(db, bookId, g.grpCode, { name: 'Petty Cash', type: 'Assets' }),
      'This Name Already Exists',
    );
  });

  test('updating a group onto its own unchanged name is not a clash', async () => {
    const g = await createGroup(db, bookId, { name: 'Petty Cash', type: 'Assets' });
    const updated = await updateGroup(db, bookId, g.grpCode, {
      name: 'Petty Cash',
      type: 'Expenses',
    });
    expect(updated.grpType).toBe('Expenses');
  });
});

describe('deleteGroup', () => {
  test('a top-level group can never be removed from Group Master (Q-16)', async () => {
    const g = await createGroup(db, bookId, { name: 'Petty Cash', type: 'Assets' });
    await rejects(deleteGroup(db, bookId, g.grpCode), 'This record will be not deleted');
    expect(await listGroups(db, bookId)).toHaveLength(17); // 16 seeded + the new one, untouched
  });

  test('a seeded top-level group is equally protected', async () => {
    await rejects(deleteGroup(db, bookId, 'A001'), 'This record will be not deleted');
  });
});

describe('createSubGroup', () => {
  test('inherits GrpType from the chosen parent and generates an SG code', async () => {
    const g = await createSubGroup(db, bookId, { name: 'Petty Cash', under: 'A001' });
    expect(g.grpCode).toBe('SG0001');
    expect(g.grpType).toBe('Assets'); // A001 is Assets
    expect(g.parentGrp).toBe('A001');
  });

  test('rejects a duplicate name, even against a top-level group', async () => {
    await rejects(
      createSubGroup(db, bookId, { name: 'Current Assets', under: 'A001' }),
      'Error: Sub Group "Current Assets" may already exist.',
    );
  });

  test('requires a name and an under group', async () => {
    await rejects(
      createSubGroup(db, bookId, { name: '', under: 'A001' }),
      'Sub group name is required',
    );
    await rejects(
      createSubGroup(db, bookId, { name: 'Petty Cash' }),
      'Please select an under group',
    );
  });

  test("falls back to Assets when the chosen parent does not exist (MDA's own fallback)", async () => {
    const g = await createSubGroup(db, bookId, { name: 'Orphan', under: 'NOPE' });
    expect(g.grpType).toBe('Assets');
    expect(g.parentGrp).toBe('NOPE');
  });
});

describe('updateSubGroup', () => {
  test('renames and re-parents, but never changes GrpType (Q-18)', async () => {
    const g = await createSubGroup(db, bookId, { name: 'Temp', under: 'A001' }); // Assets
    const updated = await updateSubGroup(db, bookId, g.grpCode, {
      name: 'Renamed',
      under: 'L002', // Capital Account — Liabilities
    });
    expect(updated.grpName).toBe('Renamed');
    expect(updated.parentGrp).toBe('L002');
    expect(updated.grpType).toBe('Assets'); // unchanged, even under a Liabilities parent
  });

  test('rejects a rename onto an existing name', async () => {
    await createSubGroup(db, bookId, { name: 'Petty Cash', under: 'A001' });
    const g = await createSubGroup(db, bookId, { name: 'Temp', under: 'A001' });
    await rejects(
      updateSubGroup(db, bookId, g.grpCode, { name: 'Petty Cash', under: 'A001' }),
      'Error: "Petty Cash" may conflict with an existing sub group.',
    );
  });
});

describe('listSubGroups', () => {
  test('joins the parent name in, and never lists top-level groups', async () => {
    await createSubGroup(db, bookId, { name: 'Petty Cash', under: 'A001' });
    const rows = await listSubGroups(db, bookId);
    const mine = rows.find((r) => r.grpName === 'Petty Cash');
    expect(mine?.parentGrpName).toBe('Current Assets');
    expect(rows.every((r) => r.parentGrp !== 'Parent')).toBe(true);
  });

  test('a fresh book already has the 12 seeded sub groups', async () => {
    const rows = await listSubGroups(db, bookId);
    expect(rows).toHaveLength(12);
  });
});

describe('deleteSubGroup', () => {
  test('removes outright, with no guard (unlike Group Master)', async () => {
    const g = await createSubGroup(db, bookId, { name: 'Petty Cash', under: 'A001' });
    await deleteSubGroup(db, bookId, g.grpCode);
    expect(await listSubGroups(db, bookId)).toHaveLength(12); // back to just the seeded ones
  });
});
