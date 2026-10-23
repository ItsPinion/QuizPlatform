import type { LandingPayload } from '@quiz/shared/landing';
import { describe, expect, it } from 'vitest';

import {
  PASSWORD_RULES,
  authStats,
  demoFillAnnouncement,
  homeFor,
  passwordProgress,
  roleLabel,
} from './auth-params';

const payload = {
  counts: {
    users: 4,
    categories: 10,
    quizzes: 10,
    publishedQuizzes: 8,
    questions: 47,
    attempts: 16,
    gradedAttempts: 14,
    passedAttempts: 8,
    passRate: 57.14,
    averagePercentage: 68.23,
  },
} as unknown as LandingPayload;

describe('passwordProgress', () => {
  it('starts empty, with every rule unmet', () => {
    const result = passwordProgress('');

    expect(result.passed).toEqual([false, false, false]);
    expect(result.complete).toBe(false);
    expect(result.score).toBe(0);
    expect(result.label).toBe('Empty');
  });

  it('mirrors the server policy: 8 characters, a letter, a number', () => {
    expect(passwordProgress('abc').score).toBe(1); // short, but has a letter
    expect(passwordProgress('abcdefgh').score).toBe(2); // length + letter
    expect(passwordProgress('12345678').score).toBe(2); // length + number
    expect(passwordProgress('abcdefgh1').complete).toBe(true);
    expect(passwordProgress('abcdefgh1').label).toBe('Ready');
  });

  it('describes a half-finished password without calling it weak', () => {
    expect(passwordProgress('abc').label).toBe('Getting there');
    expect(passwordProgress('abcdefgh').label).toBe('Getting there');
  });

  it('reports one pass per rule, in declaration order', () => {
    expect(passwordProgress('abcdefgh1').passed).toEqual([true, true, true]);
    expect(PASSWORD_RULES).toHaveLength(3);
  });
});

describe('roleLabel', () => {
  it('turns the stored enum into something a person reads', () => {
    expect(roleLabel('ADMIN')).toBe('Administrator');
    expect(roleLabel('STUDENT')).toBe('Student');
    expect(roleLabel('TEACHER')).toBe('Teacher');
  });
});

describe('authStats', () => {
  it('draws nothing rather than zeroes when the API is unreachable', () => {
    expect(authStats('login', null)).toEqual([]);
  });

  it('shows the catalogue on the sign-in panel', () => {
    expect(authStats('login', payload).map((stat) => stat.label)).toEqual([
      'papers graded',
      'categories',
      'quizzes open',
    ]);
    expect(authStats('login', payload).map((stat) => stat.value)).toEqual(['14', '10', '8']);
  });

  it('sells the catalogue on the register panel', () => {
    expect(authStats('register', payload)).toEqual([
      { value: '8', label: 'quizzes to sit' },
      { value: '47', label: 'questions in rotation' },
      { value: '10', label: 'categories' },
    ]);
  });
});

describe('homeFor', () => {
  it('sends each role to its own area', () => {
    expect(homeFor('ADMIN')).toBe('/admin');
    expect(homeFor('STUDENT')).toBe('/student');
    expect(homeFor('SOMETHING_ELSE')).toBe('/student');
  });
});

describe('demoFillAnnouncement', () => {
  it('says what happened and what to do next', () => {
    expect(demoFillAnnouncement('admin@quiz.dev')).toBe(
      'Filled in admin@quiz.dev. Press Sign in to continue.',
    );
  });
});
