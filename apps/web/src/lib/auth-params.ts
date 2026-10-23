import type { LandingPayload } from '@quiz/shared/landing';

/**
 * The auth screens' arithmetic.
 *
 * Two things live here rather than in the components: the password checklist,
 * which has to mirror `passwordSchema` in `@quiz/shared` exactly, and the live
 * numbers the side panel prints. Both are pure, so both are tested without a
 * browser — and neither can drift silently into "it looks right".
 */

export interface PasswordRule {
  /** Shown to the person typing. Short, because it sits under a 56px field. */
  label: string;
  /** What the API would say if this rule failed. */
  requirement: string;
  test: (value: string) => boolean;
}

/** Mirrors `passwordSchema`: 8 characters, a letter, a number. Order matters — read top to bottom. */
export const PASSWORD_RULES: readonly PasswordRule[] = [
  {
    label: '8 characters or more',
    requirement: 'Password must be at least 8 characters',
    test: (value) => value.length >= 8,
  },
  {
    label: 'At least one letter',
    requirement: 'Password must contain a letter',
    test: (value) => /[A-Za-z]/.test(value),
  },
  {
    label: 'At least one number',
    requirement: 'Password must contain a number',
    test: (value) => /[0-9]/.test(value),
  },
];

export interface PasswordProgress {
  /** One entry per rule, in the same order. */
  passed: boolean[];
  /** Every rule met — the same bar the API applies. */
  complete: boolean;
  /** 0–3. */
  score: number;
  /** `Empty`, `Weak`, `Getting there`, `Ready` — for the meter's accessible name. */
  label: string;
}

export function passwordProgress(value: string): PasswordProgress {
  const passed = PASSWORD_RULES.map((rule) => rule.test(value));
  const score = passed.filter(Boolean).length;

  if (value.length === 0) return { passed, complete: false, score: 0, label: 'Empty' };

  const label = score === passed.length ? 'Ready' : score === 0 ? 'Weak' : 'Getting there';

  return { passed, complete: score === passed.length, score, label };
}

/** What a person is called in the UI. The database stores `ADMIN`; a button says Administrator. */
export function roleLabel(role: string): string {
  if (role === 'ADMIN') return 'Administrator';
  if (role === 'STUDENT') return 'Student';

  return role.charAt(0) + role.slice(1).toLowerCase();
}

export interface AuthStat {
  value: string;
  label: string;
}

/**
 * The side panel's numbers, already formatted.
 *
 * Each one is a fact from `/api/landing`; an unreachable API yields an empty
 * list and the panel simply does not draw a stat row, rather than printing a
 * zero that reads like an empty database.
 */
export function authStats(kind: 'login' | 'register', payload: LandingPayload | null): AuthStat[] {
  if (!payload) return [];

  const { counts } = payload;

  if (kind === 'register') {
    return [
      { value: String(counts.publishedQuizzes), label: 'quizzes to sit' },
      { value: String(counts.questions), label: 'questions in rotation' },
      { value: String(counts.categories), label: 'categories' },
    ];
  }

  return [
    { value: String(counts.gradedAttempts), label: 'papers graded' },
    { value: String(counts.categories), label: 'categories' },
    { value: String(counts.publishedQuizzes), label: 'quizzes open' },
  ];
}

/** Where a role lands after signing in when the URL did not ask for somewhere specific. */
export function homeFor(role: string): string {
  return role === 'ADMIN' ? '/admin' : '/student';
}

/** The screen-reader sentence a demo button announces after it fills the form. */
export function demoFillAnnouncement(email: string): string {
  return `Filled in ${email}. Press Sign in to continue.`;
}
