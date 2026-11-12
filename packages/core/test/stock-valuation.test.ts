import { describe, expect, test } from 'vitest';
import { valueItem, type StockMove } from '../src/index.ts';

// 10 opening at 50; buy 10 at 60 (May); sell 15 (June); buy 5 at 70 (July).
const item = { opQty: 10, opRate: 50, mrp: 100, fallback: 40 };
const mv = (date: string, inQty: number, outQty: number, rate: number, vchrType = 'PUR'): StockMove => ({
  date, vchrType, inQty, outQty, rate,
}); // prettier-ignore
const moves = [mv('2026-05-01', 10, 0, 60), mv('2026-06-01', 0, 15, 90, 'SAL'), mv('2026-07-01', 5, 0, 70)];

describe('valueItem', () => {
  test('Opening Rate: every unit at the opening rate', () => {
    expect(valueItem('opening', item, moves, '2026-04-01')).toEqual({
      opening: { qty: 10, value: 500 },
      closing: { qty: 10, value: 500 },
    });
  });
  test('MRP: every unit at MRP', () => {
    expect(valueItem('mrp', item, moves, '2026-04-01').closing).toEqual({ qty: 10, value: 1000 });
  });
  test('Average: 20 @ 55, 15 out at 55, then 5 @ 70 → 10 @ 62.50', () => {
    expect(valueItem('average', item, moves, '2026-04-01').closing).toEqual({ qty: 10, value: 625 });
  });
  test('FIFO: the 10 opening and 5 of May go out; 5 @ 60 + 5 @ 70 remain', () => {
    expect(valueItem('fifo', item, moves, '2026-04-01').closing).toEqual({ qty: 10, value: 650 });
  });
  test('opening of a later period is the stock at its start', () => {
    expect(valueItem('fifo', item, moves, '2026-06-15').opening).toEqual({ qty: 5, value: 300 });
    expect(valueItem('average', item, moves, '2026-06-15').opening).toEqual({ qty: 5, value: 275 });
  });
  test('a sales return comes back at cost, not at the sale price', () => {
    const r = valueItem('average', item, [mv('2026-05-01', 0, 4, 90, 'SAL'), mv('2026-05-02', 2, 0, 90, 'SRT')], '2026-04-01');
    expect(r.closing).toEqual({ qty: 8, value: 400 });
  });
  test('no opening rate: the fallback rate; selling below zero goes on at the last cost', () => {
    const r = valueItem('fifo', { ...item, opRate: 0 }, [mv('2026-05-01', 0, 12, 90, 'SAL')], '2026-04-01');
    expect(r.closing).toEqual({ qty: -2, value: -80 });
  });
});
