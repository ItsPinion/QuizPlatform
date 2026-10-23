/**
 * Password hashing helpers.
 *
 * Exposed from the `@quiz/shared/crypto` subpath only, so that this
 * Node-only module is never pulled into a client bundle.
 *
 * Format: `scrypt$<N>$<r>$<p>$<saltHex>$<hashHex>`
 */
import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';
import { promisify } from 'node:util';

/** promisify() drops the options overload, so describe it explicitly. */
const scryptAsync = promisify(scrypt) as (
  password: string | Buffer,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions,
) => Promise<Buffer>;

const PARAMS = { N: 16384, r: 8, p: 1 } as const;
const KEY_LENGTH = 64;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scryptAsync(password.normalize('NFKC'), salt, KEY_LENGTH, PARAMS);

  return [
    'scrypt',
    PARAMS.N,
    PARAMS.r,
    PARAMS.p,
    salt.toString('hex'),
    derived.toString('hex'),
  ].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, saltHex, hashHex] = stored.split('$');

  if (scheme !== 'scrypt' || !n || !r || !p || !saltHex || !hashHex) return false;

  const expected = Buffer.from(hashHex, 'hex');
  const derived = await scryptAsync(
    password.normalize('NFKC'),
    Buffer.from(saltHex, 'hex'),
    expected.length,
    {
      N: Number(n),
      r: Number(r),
      p: Number(p),
    },
  );

  return derived.length === expected.length && timingSafeEqual(derived, expected);
}
