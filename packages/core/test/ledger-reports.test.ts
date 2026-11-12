import { describe, expect, test } from 'vitest';
import {
  ageingOf,
  drCr,
  ledgerStatement,
  outstandingBills,
  trialBalance,
  type BillRef,
  type ReportGroup,
} from '../src/index.ts';

describe('ledgerStatement', () => {
  test('running balance from the opening, with totals and closing', () => {
    const s = ledgerStatement(1000, [
      { date: '2026-04-05', vchrNo: 'SB-1', type: 'SAL', particulars: 'Sales', narration: '', debit: 500, credit: 0 },
      { date: '2026-04-09', vchrNo: 'RCP-1', type: 'RCP', particulars: 'Cash', narration: '', debit: 0, credit: 1200.5 },
    ]); // prettier-ignore
    expect(s.rows.map((r) => r.balance)).toEqual([1500, 299.5]);
    expect(s).toMatchObject({ opening: 1000, debit: 500, credit: 1200.5, closing: 299.5 });
  });
  test('Dr / Cr sides', () => {
    const f = (n: number) => n.toFixed(2);
    expect(drCr(250, f)).toBe('250.00 Dr');
    expect(drCr(-80, f)).toBe('80.00 Cr');
    expect(drCr(0.001, f)).toBe('0.00');
  });
});

describe('trialBalance', () => {
  const groups = new Map<string, ReportGroup>([
    ['A001', { grpCode: 'A001', grpName: 'Current Assets', grpType: 'Assets', parentGrp: 'Parent' }],
    ['A007', { grpCode: 'A007', grpName: 'Sundry Debtors', grpType: 'Assets', parentGrp: 'A001' }],
    ['I001', { grpCode: 'I001', grpName: 'Sales Accounts', grpType: 'Income', parentGrp: 'Parent' }],
  ]); // prettier-ignore
  test('balances on their side, grouped, zero balances left out', () => {
    const t = trialBalance(
      [
        { accCode: 'AC1', accName: 'Gupta', grpCode: 'A007', balance: 1180 },
        { accCode: 'SAL', accName: 'Sales A/c', grpCode: 'I001', balance: -1180 },
        { accCode: 'AC2', accName: 'Idle', grpCode: 'A007', balance: 0 },
      ],
      groups,
    );
    expect(t.rows).toEqual([
      { accCode: 'AC1', accName: 'Gupta', grpName: 'Current Assets', opening: 0, trDebit: 0, trCredit: 0, debit: 1180, credit: 0 },
      { accCode: 'SAL', accName: 'Sales A/c', grpName: 'Sales Accounts', opening: 0, trDebit: 0, trCredit: 0, debit: 0, credit: 1180 },
    ]); // prettier-ignore
    expect(t).toMatchObject({ debit: 1180, credit: 1180, difference: 0 });
  });
  test('opening balances that do not agree show as the difference', () => {
    const t = trialBalance(
      [{ accCode: 'AC1', accName: 'Gupta', grpCode: 'A007', balance: 500 }],
      groups,
    );
    expect(t.difference).toBe(500);
  });
  test("opening, the period's entries and the closing; a ledger with only an opening still shows", () => {
    const t = trialBalance(
      [
        { accCode: 'AC1', accName: 'Gupta', grpCode: 'A007', balance: 700, opening: 1000, trDebit: 200, trCredit: 500 },
        { accCode: 'AC2', accName: 'Settled', grpCode: 'A007', balance: 0, opening: 300, trDebit: 0, trCredit: 300 },
      ],
      groups,
    ); // prettier-ignore
    expect(t.rows.map((r) => [r.accName, r.opening, r.trDebit, r.trCredit, r.debit])).toEqual([
      ['Gupta', 1000, 200, 500, 700],
      ['Settled', 300, 0, 300, 0],
    ]);
    expect(t).toMatchObject({ opening: 1300, trDebit: 200, trCredit: 800, debit: 700 });
  });
});

describe('outstandingBills', () => {
  const ref = (o: Partial<BillRef>): BillRef => ({
    accCode: 'AC1',
    accName: 'Gupta',
    billNo: 'TI-1',
    refType: 'New',
    billDate: '2026-08-01',
    amount: 1000,
    creditDays: 30,
    side: 'receivable',
    ...o,
  });
  test('settlements clear the oldest bills first; due = bill date + credit days', () => {
    const open = outstandingBills(
      [
        ref({ billNo: 'TI-2', billDate: '2026-09-01', amount: 600 }),
        ref({ billNo: 'TI-1', billDate: '2026-08-01', amount: 1000 }),
        ref({ billNo: 'RCP-1', refType: 'Agst', amount: 1200 }),
      ],
      '2026-10-25',
    );
    expect(open).toEqual([
      {
        accCode: 'AC1',
        accName: 'Gupta',
        billNo: 'TI-2',
        billDate: '2026-09-01',
        dueDate: '2026-10-01',
        amount: 600,
        pending: 400,
        overdueDays: 24,
        side: 'receivable',
      },
    ]);
  });
  test('not yet due, and the ageing columns', () => {
    const [b] = outstandingBills([ref({ billDate: '2026-10-20' })], '2026-10-25');
    expect(b!.overdueDays).toBe(0);
    expect([0, 1, 30, 31, 60, 61, 90, 91].map(ageingOf)).toEqual([
      'Not due', '1-30', '1-30', '31-60', '31-60', '61-90', '61-90', 'Over 90',
    ]); // prettier-ignore
  });
});
