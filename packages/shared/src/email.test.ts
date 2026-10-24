import { describe, expect, it } from 'vitest';

import {
  certificateEmail,
  passwordResetEmail,
  resultEmail,
  type EmailMessage,
  welcomeEmail,
} from './email';

/**
 * The four templates are the only place an address, a token or a score becomes
 * prose, so the assertions here are about what a person actually receives: the
 * greeting names them, the numbers read the way the result screen reads them,
 * the link is the recovery path, and nothing says `undefined`.
 *
 * These run without a database or a mail server — a template is a pure function
 * from facts to a message, which is exactly why the outbox stores the message
 * rather than re-rendering it later.
 */

const SIGN_OFF = '— The QuizPlatform team';

function assertWellFormed(message: EmailMessage) {
  expect(message.to).toBe('rahul@quiz.dev');
  expect(message.subject.trim()).not.toBe('');
  expect(message.body.trim()).not.toBe('');
  expect(message.body).not.toContain('undefined');
  expect(message.body).not.toContain('NaN');
  expect(message.body.trimEnd().endsWith(SIGN_OFF)).toBe(true);
}

describe('welcomeEmail', () => {
  it('greets the person by name and points at the sign-in page', () => {
    const message = welcomeEmail({ name: 'Rahul', email: 'rahul@quiz.dev' });

    expect(message.kind).toBe('WELCOME');
    expect(message.subject).toBe('Welcome to QuizPlatform');
    expect(message.body.startsWith('Hello Rahul,')).toBe(true);
    expect(message.body).toContain('Sign in: /login');
    expect(message.relatedId).toBeUndefined();
    assertWellFormed(message);
  });
});

describe('passwordResetEmail', () => {
  const reset = (overrides: Partial<Parameters<typeof passwordResetEmail>[0]> = {}) =>
    passwordResetEmail({
      name: 'Rahul',
      email: 'rahul@quiz.dev',
      token: 'tok/en+with spaces',
      baseUrl: 'https://quiz.example',
      expiresInMinutes: 30,
      ...overrides,
    });

  it('carries the encoded token exactly once, in the link', () => {
    const message = reset();
    const encoded = encodeURIComponent('tok/en+with spaces');

    expect(message.kind).toBe('PASSWORD_RESET');
    expect(message.body).toContain(`https://quiz.example/reset-password?token=${encoded}`);
    expect(message.body.split(encoded)).toHaveLength(2);
    assertWellFormed(message);
  });

  it('does not double the slash on a base URL that already ends in one', () => {
    expect(reset({ baseUrl: 'https://quiz.example/' }).body).toContain(
      'https://quiz.example/reset-password',
    );
    expect(reset({ baseUrl: 'https://quiz.example/' }).body).not.toContain(
      'https://quiz.example//reset-password',
    );
  });

  it('states the expiry it was given', () => {
    expect(reset({ expiresInMinutes: 45 }).body).toContain('It expires in 45 minutes');
  });
});

describe('resultEmail', () => {
  const result = (overrides: Partial<Parameters<typeof resultEmail>[0]> = {}) =>
    resultEmail({
      name: 'Rahul',
      email: 'rahul@quiz.dev',
      quizTitle: 'Frontend Fundamentals',
      attemptId: 'attempt-1',
      percentage: 83.333,
      score: 25,
      totalMarks: 30,
      passed: true,
      passingScore: 60,
      ...overrides,
    });

  it('puts the verdict and the rounded percentage in the subject', () => {
    expect(result().subject).toBe('PASSED: Frontend Fundamentals — 83.33%');
    expect(result({ passed: false }).subject).toBe('FAILED: Frontend Fundamentals — 83.33%');
  });

  it('shows the score, the pass mark and the review link, and links the attempt', () => {
    const message = result();

    expect(message.kind).toBe('RESULT');
    expect(message.body).toContain('Score:      25 / 30 marks (83.33%)');
    expect(message.body).toContain('Pass mark:  60%');
    expect(message.body).toContain('/student/attempt/attempt-1/review');
    expect(message.relatedId).toBe('attempt-1');
    assertWellFormed(message);
  });

  it('drops trailing zeroes from a round number', () => {
    const message = result({ percentage: 100, score: 30, totalMarks: 30, passingScore: 100 });

    expect(message.subject).toContain('100%');
    expect(message.subject).not.toContain('100.00');
    expect(message.body).toContain('Pass mark:  100%');
  });

  it('says FAILED when it is, rather than leaving the verdict to the score', () => {
    expect(result({ passed: false }).body).toContain('Result:     FAILED');
  });
});

describe('certificateEmail', () => {
  it('names the certificate, the code and where a third party can verify it', () => {
    const message = certificateEmail({
      name: 'Rahul',
      email: 'rahul@quiz.dev',
      quizTitle: 'Frontend Fundamentals',
      code: 'QP-ABC123',
      attemptId: 'attempt-1',
      percentage: 90,
      baseUrl: 'https://quiz.example/',
    });

    expect(message.kind).toBe('CERTIFICATE');
    expect(message.subject).toBe('Certificate — Frontend Fundamentals');
    expect(message.body).toContain('/student/certificates/QP-ABC123');
    expect(message.body).toContain('https://quiz.example/verify/QP-ABC123');
    expect(message.relatedId).toBe('attempt-1');
    assertWellFormed(message);
  });
});
