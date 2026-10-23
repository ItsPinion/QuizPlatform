import { describe, expect, it } from 'vitest';

import { hashPassword, verifyPassword } from './crypto';

describe('password hashing', () => {
  it('produces a scrypt record with its own salt', async () => {
    const record = await hashPassword('CorrectHorse1');

    const parts = record.split('$');
    expect(parts).toHaveLength(6);
    expect(parts[0]).toBe('scrypt');
    expect(parts[1]).toBe('16384');
    expect(parts[2]).toBe('8');
    expect(parts[3]).toBe('1');
    expect(parts[4]).toMatch(/^[0-9a-f]{32}$/); // 16-byte salt
    expect(parts[5]).toMatch(/^[0-9a-f]{128}$/); // 64-byte digest
  });

  it('never stores the plaintext password', async () => {
    const record = await hashPassword('super-secret-value-1');
    expect(record).not.toContain('super-secret-value-1');
  });

  it('salts every hash independently', async () => {
    const [a, b] = await Promise.all([
      hashPassword('same-password-1'),
      hashPassword('same-password-1'),
    ]);
    expect(a).not.toBe(b);
  });

  it('verifies the correct password', async () => {
    const record = await hashPassword('CorrectHorse1');
    await expect(verifyPassword('CorrectHorse1', record)).resolves.toBe(true);
  });

  it('rejects a wrong password', async () => {
    const record = await hashPassword('CorrectHorse1');
    await expect(verifyPassword('CorrectHorse2', record)).resolves.toBe(false);
    await expect(verifyPassword('correcthorse1', record)).resolves.toBe(false);
  });

  it('normalises unicode consistently', async () => {
    const record = await hashPassword('pässwörd1');
    await expect(verifyPassword('pa\u0308sswo\u0308rd1', record)).resolves.toBe(true);
  });

  it('fails closed on malformed records', async () => {
    for (const bad of [
      '',
      'plaintext',
      'scrypt$1$2$3',
      'bcrypt$16384$8$1$aa$bb',
      'scrypt$x$y$z$aa$bb',
    ]) {
      await expect(verifyPassword('whatever1', bad)).resolves.toBe(false);
    }
  });

  it('verifies the seeded demo credential', async () => {
    // The API's login route (Day 2) relies on this exact contract.
    const record = await hashPassword('Password123');
    await expect(verifyPassword('Password123', record)).resolves.toBe(true);
  });
});
