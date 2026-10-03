// Port of PasswordHasher (MDA-Inventory lib/security.dart:11-75).
//
// Stored format: `pbkdf2$<iterations>$<saltBase64>$<hashBase64>`, PBKDF2-HMAC-SHA256,
// 20000 iterations, 16-byte salt, 32-byte key. MDA's hand-written single-block PBKDF2 is
// standard PBKDF2 for a 32-byte key, so Web Crypto produces identical bytes.
// Anything without the `pbkdf2$` prefix is a legacy plain-text password and is compared as is.
//
// Uses the Web Crypto API (globalThis.crypto), which Node, browsers and Electron all provide,
// so this stays free of platform imports.

const PREFIX = 'pbkdf2';
const ITERATIONS = 20000;
const KEY_BYTES = 32;

const utf8 = new TextEncoder();

const toBase64 = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes));
const fromBase64 = (b64: string): Uint8Array<ArrayBuffer> =>
  Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

type Bytes = Uint8Array<ArrayBuffer>;

async function pbkdf2(password: string, salt: Bytes, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', utf8.encode(password), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    key,
    KEY_BYTES * 8,
  );
  return new Uint8Array(bits);
}

/** The value to store in book_users.password. */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await pbkdf2(password, salt, ITERATIONS);
  return `${PREFIX}$${ITERATIONS}$${toBase64(salt)}$${toBase64(key)}`;
}

export const isLegacyPassword = (stored: string | null | undefined): boolean =>
  stored == null || !stored.startsWith(`${PREFIX}$`);

/** Constant-time comparison against a stored value; accepts legacy plain-text rows. */
export async function verifyPassword(
  password: string,
  stored: string | null | undefined,
): Promise<boolean> {
  if (stored == null) return false;
  if (isLegacyPassword(stored)) return password === stored;

  const parts = stored.split('$');
  if (parts.length !== 4) return false;
  const iterations = Number.parseInt(parts[1]!, 10) || ITERATIONS;
  let salt: Bytes;
  let expected: Uint8Array;
  try {
    salt = fromBase64(parts[2]!);
    expected = fromBase64(parts[3]!);
  } catch {
    return false;
  }

  const actual = await pbkdf2(password, salt, iterations);
  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual[i]! ^ expected[i]!;
  return diff === 0;
}
