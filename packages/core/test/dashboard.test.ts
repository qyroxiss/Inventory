// Cases from MDA-Inventory test/dashboard_service_test.dart ('relative time', 'an empty book'),
// plus the formats of main.dart:680-731.
import { describe, expect, test } from 'vitest';
import {
  ago,
  compact,
  emptyDashboard,
  grouped,
  inr,
  pct,
  signed,
  trends,
  weekLabels,
} from '../src/dashboard.ts';

describe('relative time (dashboard_service_test.dart)', () => {
  const now = new Date(2026, 5, 12, 15, 0);

  test('minutes and hours within the day', () => {
    expect(ago('2026-06-12T14:58:00.000', null, now)).toBe('2m ago');
    expect(ago('2026-06-12T13:00:00.000', null, now)).toBe('2h ago');
    expect(ago('2026-06-12T15:00:00.000', null, now)).toBe('Just now');
  });

  test('days, then a plain date once it is a week old', () => {
    expect(ago('2026-06-11T09:00:00.000', null, now)).toBe('Yesterday');
    expect(ago('2026-06-09T09:00:00.000', null, now)).toBe('3 days ago');
    expect(ago('2026-06-01T09:00:00.000', null, now)).toBe('01-06-2026');
  });

  test('falls back to the voucher date when there is no entry time', () => {
    expect(ago(null, '2026-06-11', now)).toBe('Yesterday');
    expect(ago(null, null, now)).toBe('');
  });
});

describe('an empty book', () => {
  test('the week runs seven days up to and including today', () => {
    // 12 June 2026 is a Friday, so the window opens on the Saturday before.
    expect(weekLabels('2026-06-12')).toEqual(['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri']);
  });

  test('no activity: zero figures, no recent list, trends as MDA words them', () => {
    const d = emptyDashboard('2026-06-12');
    expect(d.weekValues).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(d.recent).toEqual([]);
    expect(trends(d)).toEqual({
      stock: { text: '+₹0', up: true },
      sales: { text: '+₹0', up: true },
      bills: { text: 'none overdue', up: true },
      cash: { text: '+₹0', up: true },
    });
  });
});

describe('money formats (main.dart:680-711)', () => {
  test('Indian grouping and the ₹ sign', () => {
    expect(grouped(0)).toBe('0');
    expect(grouped(999)).toBe('999');
    expect(grouped(1000)).toBe('1,000');
    expect(grouped(1842350)).toBe('18,42,350');
    expect(grouped(123456789)).toBe('12,34,56,789');
    expect(inr(126480)).toBe('₹1,26,480');
    expect(inr(-500)).toBe('−₹500');
    expect(inr(-0.004)).toBe('₹0');
  });

  test('compact trend amounts', () => {
    expect(compact(950)).toBe('950');
    expect(compact(32400)).toBe('32K');
    expect(compact(180000)).toBe('1.8L');
    expect(compact(24000000)).toBe('2.4Cr');
    expect(signed(-46200)).toBe('−₹46K');
    expect(signed(46200)).toBe('+₹46K');
  });

  test('percent change, and the fallback when there is nothing to compare with', () => {
    expect(pct(13980, 112500)).toBe('+12.4%');
    expect(pct(-5000, 100000)).toBe('−5.0%');
    const d = {
      ...emptyDashboard('2026-06-12'),
      todaySales: 1180,
      overdueBills: 3,
      cashToday: -2500,
    };
    expect(trends(d).sales).toEqual({ text: '+₹1K', up: true });
    expect(trends(d).bills).toEqual({ text: '3 overdue', up: false });
    expect(trends(d).cash).toEqual({ text: '−₹3K', up: false });
  });
});
