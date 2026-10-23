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
  const [scheme, nRaw, rRaw, pRaw, saltHex, hashHex] = stored.split('$');

  if (scheme !== 'scrypt' || !nRaw || !rRaw || !pRaw || !saltHex || !hashHex) return false;
  if (!/^[0-9a-f]+$/i.test(saltHex) || !/^[0-9a-f]+$/i.test(hashHex)) return false;

  const params = { N: Number(nRaw), r: Number(rRaw), p: Number(pRaw) };
  // Reject nonsense cost parameters instead of letting scrypt throw: a corrupt
  // record must fail closed, never crash the login route.
  if (!Object.values(params).every((value) => Number.isInteger(value) && value > 0)) return false;

  const expected = Buffer.from(hashHex, 'hex');
  if (expected.length === 0) return false;

  let derived: Buffer;
  try {
    derived = await scryptAsync(
      password.normalize('NFKC'),
      Buffer.from(saltHex, 'hex'),
      expected.length,
      params,
    );
  } catch {
    return false;
  }

  return derived.length === expected.length && timingSafeEqual(derived, expected);
}
