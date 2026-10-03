import { describe, expect, test } from 'vitest';
import { hashPassword, isLegacyPassword, verifyPassword } from '../src/password.ts';
import { golden } from './golden.ts';

type Case = { password: string; stored: string };
const cases = golden<Case[]>('password_hashes');

describe('verifyPassword accepts hashes made by the Dart app', () => {
  test.each(cases)('$password', async ({ password, stored }) => {
    expect(await verifyPassword(password, stored)).toBe(true);
    expect(await verifyPassword(`${password}x`, stored)).toBe(false);
  });
});

describe('hashPassword', () => {
  test('produces the MDA storage format and round-trips', async () => {
    const stored = await hashPassword('Secret@123');
    expect(stored).toMatch(/^pbkdf2\$20000\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
    expect(await verifyPassword('Secret@123', stored)).toBe(true);
    expect(await verifyPassword('secret@123', stored)).toBe(false);
  });

  test('a fresh salt every time', async () => {
    expect(await hashPassword('admin')).not.toBe(await hashPassword('admin'));
  });

  test('legacy plain text and malformed values', async () => {
    expect(isLegacyPassword('admin')).toBe(true);
    expect(isLegacyPassword(null)).toBe(true);
    expect(isLegacyPassword('pbkdf2$1$a$b')).toBe(false);
    expect(await verifyPassword('admin', 'admin')).toBe(true);
    expect(await verifyPassword('admin', null)).toBe(false);
    expect(await verifyPassword('admin', 'pbkdf2$20000$onlythree')).toBe(false);
  });
});
