import type { AuthSession } from '@quiz/shared/auth';
import { describe, expect, it } from 'vitest';

import { decideAccess } from './guards';
import { safeNextPath } from './redirect';

function sessionFor(role: AuthSession['user']['role']): AuthSession {
  return {
    user: {
      id: '11111111-1111-4111-8111-111111111111',
      name: 'Test User',
      email: 'test@quiz.dev',
      role,
      status: 'ACTIVE',
      createdAt: '2026-01-02T03:04:05.000Z',
    },
    expiresAt: '2026-01-09T03:04:05.000Z',
  };
}

describe('decideAccess', () => {
  it('sends anonymous visitors to sign in and remembers where they were going', () => {
    expect(decideAccess(null, 'ADMIN', '/admin')).toEqual({
      allowed: false,
      redirectTo: '/login?next=%2Fadmin',
    });
  });

  it('keeps query strings when encoding the return path', () => {
    expect(decideAccess(null, 'ADMIN', '/admin?tab=users')).toEqual({
      allowed: false,
      redirectTo: '/login?next=%2Fadmin%3Ftab%3Dusers',
    });
  });

  it('redirects a student away from the admin area', () => {
    expect(decideAccess(sessionFor('STUDENT'), 'ADMIN', '/admin')).toEqual({
      allowed: false,
      redirectTo: '/student',
    });
  });

  it('redirects an admin away from the student area', () => {
    expect(decideAccess(sessionFor('ADMIN'), 'STUDENT', '/student')).toEqual({
      allowed: false,
      redirectTo: '/admin',
    });
  });

  it('allows the matching role and returns the session', () => {
    const session = sessionFor('ADMIN');
    const decision = decideAccess(session, 'ADMIN', '/admin');

    expect(decision.allowed).toBe(true);
    if (decision.allowed) expect(decision.session).toBe(session);
  });
});

describe('safeNextPath', () => {
  it('keeps same-origin paths', () => {
    expect(safeNextPath('/admin')).toBe('/admin');
    expect(safeNextPath('/student?tab=results')).toBe('/student?tab=results');
  });

  it('falls back for missing values', () => {
    expect(safeNextPath(undefined)).toBe('/');
    expect(safeNextPath(null)).toBe('/');
    expect(safeNextPath('')).toBe('/');
    expect(safeNextPath(undefined, '/student')).toBe('/student');
  });

  it.each([
    ['an absolute URL', 'https://evil.example/phish'],
    ['a protocol-relative URL', '//evil.example/phish'],
    ['a backslash trick', '/\\evil.example'],
    ['a relative path', 'admin'],
    ['a scheme', 'javascript:alert(1)'],
    ['a tab inside the path', '/ad\tmin'],
    ['a newline', '/admin\nLocation: //evil.example'],
  ])('rejects %s', (_label, candidate) => {
    expect(safeNextPath(candidate)).toBe('/');
  });

  it('uses the first value when the query key repeats', () => {
    expect(safeNextPath(['/admin', '/student'])).toBe('/admin');
    expect(safeNextPath(['//evil.example', '/admin'])).toBe('/');
  });
});
