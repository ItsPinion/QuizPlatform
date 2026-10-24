import { describe, expect, it } from 'vitest';

import {
  changePasswordSchema,
  forgotPasswordSchema,
  isResetTokenUsable,
  resetPasswordSchema,
} from './password';

describe('forgotPasswordSchema', () => {
  it('lower-cases the address, like every other entry point', () => {
    expect(forgotPasswordSchema.parse({ email: ' Ravi@Example.COM ' }).email).toBe(
      'ravi@example.com',
    );
  });

  it('refuses a non-address', () => {
    expect(forgotPasswordSchema.safeParse({ email: 'nope' }).success).toBe(false);
  });
});

describe('resetPasswordSchema', () => {
  it('applies the registration password rule', () => {
    expect(
      resetPasswordSchema.safeParse({ token: 'x'.repeat(40), password: 'short' }).success,
    ).toBe(false);
    expect(
      resetPasswordSchema.safeParse({ token: 'x'.repeat(40), password: 'abcdefg1' }).success,
    ).toBe(true);
  });

  it('refuses an obviously wrong token', () => {
    expect(resetPasswordSchema.safeParse({ token: 'abc', password: 'abcdefg1' }).success).toBe(
      false,
    );
  });
});

describe('isResetTokenUsable', () => {
  const now = Date.parse('2026-10-24T12:00:00Z');

  it('is usable before it expires', () => {
    expect(isResetTokenUsable({ expiresAt: '2026-10-24T13:00:00Z' }, now)).toBe(true);
  });

  it('is not usable after the expiry', () => {
    expect(isResetTokenUsable({ expiresAt: '2026-10-24T11:00:00Z' }, now)).toBe(false);
  });

  it('is not usable once it has been spent', () => {
    expect(
      isResetTokenUsable(
        { expiresAt: '2026-10-24T13:00:00Z', usedAt: '2026-10-24T11:30:00Z' },
        now,
      ),
    ).toBe(false);
  });
});

describe('changePasswordSchema', () => {
  const valid = { currentPassword: 'Password123', newPassword: 'Str0nger456' };

  it('accepts a genuinely new password', () => {
    expect(changePasswordSchema.safeParse(valid).success).toBe(true);
  });

  it('applies the registration rule to the new password', () => {
    expect(changePasswordSchema.safeParse({ ...valid, newPassword: 'short' }).success).toBe(false);
    expect(changePasswordSchema.safeParse({ ...valid, newPassword: 'alllowercase' }).success).toBe(
      false,
    );
  });

  it('requires the current password', () => {
    expect(changePasswordSchema.safeParse({ ...valid, currentPassword: '' }).success).toBe(false);
  });

  it('refuses a "new" password that is the old one', () => {
    const result = changePasswordSchema.safeParse({
      currentPassword: 'Password123',
      newPassword: 'Password123',
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['newPassword']);
  });

  it('refuses a case-only change, which is not a new password', () => {
    expect(
      changePasswordSchema.safeParse({
        currentPassword: 'Password123',
        newPassword: 'password123',
      }).success,
    ).toBe(false);
  });

  it('points the mistake at the field it belongs to', () => {
    const result = changePasswordSchema.safeParse({
      currentPassword: '',
      newPassword: 'Str0nger456',
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['currentPassword']);
  });
});
