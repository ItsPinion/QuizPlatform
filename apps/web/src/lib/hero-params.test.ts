import { describe, expect, it } from 'vitest';

import { heroActions } from './hero-params';

describe('heroActions', () => {
  it('asks a visitor to sign up', () => {
    expect(heroActions(null)).toEqual({
      primary: { label: 'Get started', href: '/register' },
      secondary: { label: 'See it working', href: '#tour' },
    });
  });

  it('sends a signed-in student straight to the quizzes', () => {
    const actions = heroActions('STUDENT');

    expect(actions.primary).toEqual({ label: 'Take a quiz', href: '/student/quizzes' });
    expect(actions.secondary).toEqual({ label: 'My dashboard', href: '/student' });
  });

  it('sends an admin to the console, not to a quiz they cannot sit', () => {
    expect(heroActions('ADMIN').primary).toEqual({
      label: 'Open the console',
      href: '/admin',
    });
  });

  it('never points a signed-in role at the login page', () => {
    for (const role of ['STUDENT', 'ADMIN'] as const) {
      expect(heroActions(role).primary.href).not.toMatch(/^\/(login|register)$/);
    }
  });

  it('falls back to the visitor actions for an unknown role', () => {
    expect(heroActions('TEACHER').primary.href).toBe('/register');
  });
});
