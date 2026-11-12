import { describe, expect, it } from 'vitest';
import { registerItem, type RegisterMove } from '../src/stock-register.ts';

const mv = (date: string, vchrType: string, inQty: number, outQty: number): RegisterMove => ({
  date,
  vchrType,
  billNo: `${vchrType}-${date}`,
  particulars: '',
  inQty,
  outQty,
  rate: 10,
  amount: (inQty || outQty) * 10,
});

const item = { code: 'RICE', name: 'Rice', unit: 'Bag', opQty: 40 };
const moves = [
  mv('2026-04-02', 'PUR', 10, 0), // before the period
  mv('2026-04-05', 'PUR', 100, 0),
  mv('2026-04-10', 'SAL', 0, 45),
  mv('2026-04-12', 'PRT', 0, 5),
  mv('2026-04-15', 'SRT', 3, 0),
  mv('2026-04-18', 'STJ', 0, 8),
];

describe('registerItem', () => {
  it('runs the balance like a ledger', () => {
    const r = registerItem(item, moves, '2026-04-05', 'all');
    expect(r.opening).toBe(50);
    expect(r.lines.map((l) => l.balance)).toEqual([150, 105, 100, 103, 95]);
    expect(r.inward).toBe(103);
    expect(r.outward).toBe(58);
    expect(r.closing).toBe(95);
    expect(r.amountIn).toBe(1030);
  });

  it('Purchase shows purchases and purchase returns; balances stay the real stock', () => {
    const r = registerItem(item, moves, '2026-04-05', 'purchase');
    expect(r.lines.map((l) => [l.vchrType, l.balance])).toEqual([
      ['PUR', 150],
      ['PRT', 100],
    ]);
    expect(r.inward).toBe(100);
    expect(r.outward).toBe(5);
    expect(r.opening).toBe(50);
    expect(r.closing).toBe(95);
  });

  it('Sales shows sales and sales returns', () => {
    const r = registerItem(item, moves, '2026-04-05', 'sales');
    expect(r.lines.map((l) => l.vchrType)).toEqual(['SAL', 'SRT']);
    expect(r.closing).toBe(95);
  });
});
