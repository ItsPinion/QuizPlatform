import { describe, expect, it } from 'vitest';

import {
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  authSessionSchema,
  authUserSchema,
  loginSchema,
  registerSchema,
} from './auth';

describe('session constants', () => {
  it('pins the cookie name and a seven-day lifetime', () => {
    expect(SESSION_COOKIE).toBe('quiz_session');
    expect(SESSION_TTL_SECONDS).toBe(604_800);
  });
});

describe('registerSchema', () => {
  const valid = { name: 'Ada Lovelace', email: 'ada@quiz.dev', password: 'Secret12345' };

  it('accepts a well-formed payload and trims the name', () => {
    const parsed = registerSchema.parse({ ...valid, name: '  Ada Lovelace  ' });

    expect(parsed.name).toBe('Ada Lovelace');
    expect(parsed.email).toBe('ada@quiz.dev');
  });

  it('lowercases the email', () => {
    expect(registerSchema.parse({ ...valid, email: 'ADA@Quiz.DEV' }).email).toBe('ada@quiz.dev');
  });

  it('strips unknown keys such as a client-supplied role', () => {
    const parsed = registerSchema.parse({ ...valid, role: 'ADMIN', status: 'ACTIVE' });

    expect(parsed).not.toHaveProperty('role');
    expect(parsed).not.toHaveProperty('status');
  });

  it.each([
    ['a one-character name', { ...valid, name: 'A' }],
    ['an invalid email', { ...valid, email: 'not-an-email' }],
    ['a password without a number', { ...valid, password: 'OnlyLetters' }],
    ['a password without a letter', { ...valid, password: '12345678' }],
    ['a password shorter than 8 characters', { ...valid, password: 'Ab1' }],
    ['a missing password', { email: valid.email, name: valid.name }],
  ])('rejects %s', (_label, payload) => {
    expect(registerSchema.safeParse(payload).success).toBe(false);
  });

  it('reports a helpful message for a short password', () => {
    const result = registerSchema.safeParse({ ...valid, password: 'Ab1' });
    const messages = result.error?.issues.map((issue) => issue.message).join(' ');

    expect(messages).toContain('at least 8 characters');
  });
});

describe('loginSchema', () => {
  it('accepts any non-empty password so login never leaks the policy', () => {
    expect(loginSchema.safeParse({ email: 'ada@quiz.dev', password: 'x' }).success).toBe(true);
  });

  it('lowercases the email', () => {
    expect(loginSchema.parse({ email: 'ADA@quiz.dev', password: 'x' }).email).toBe('ada@quiz.dev');
  });

  it('rejects an empty password and a malformed email', () => {
    expect(loginSchema.safeParse({ email: 'ada@quiz.dev', password: '' }).success).toBe(false);
    expect(loginSchema.safeParse({ email: 'ada', password: 'x' }).success).toBe(false);
  });
});

describe('response schemas', () => {
  const user = {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Ada Lovelace',
    email: 'ada@quiz.dev',
    role: 'STUDENT',
    status: 'ACTIVE',
    createdAt: '2026-01-02T03:04:05.000Z',
  };

  it('accepts a valid user and session envelope', () => {
    expect(authUserSchema.safeParse(user).success).toBe(true);
    expect(
      authSessionSchema.safeParse({ user, expiresAt: '2026-01-09T03:04:05.000Z' }).success,
    ).toBe(true);
  });

  it('rejects an unknown role or status', () => {
    expect(authUserSchema.safeParse({ ...user, role: 'SUPERUSER' }).success).toBe(false);
    expect(authUserSchema.safeParse({ ...user, status: 'PENDING' }).success).toBe(false);
  });
});
