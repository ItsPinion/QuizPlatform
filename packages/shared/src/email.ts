/**
 * Transactional email.
 *
 * The app renders every message itself and hands it to the outbox; a sender
 * (SMTP, Resend, whatever the deployment has) drains the outbox. That split is
 * deliberate:
 *
 *   - **A request never waits on a mail server.** Registration, a submitted
 *     attempt and a certificate all complete even when mail is down.
 *   - **The message is inspectable.** The admin console can read exactly what
 *     was sent, to whom, and when — which is also how the flow is tested here,
 *     with no credentials and no network.
 *   - **Swapping providers is one function.** `deliver()` in the API is the only
 *     thing that knows how a message leaves the building. With no SMTP
 *     configured it is the development transport: it logs the message and marks
 *     it sent.
 *
 * These bodies are plain text on purpose. A dark, designed product sending a
 * heavy HTML email is a mismatch, and text always renders.
 */
import { z } from 'zod';

export const EMAIL_KINDS = ['WELCOME', 'PASSWORD_RESET', 'RESULT', 'CERTIFICATE'] as const;
export const emailKindSchema = z.enum(EMAIL_KINDS);
export type EmailKind = z.infer<typeof emailKindSchema>;

export const EMAIL_STATUSES = ['QUEUED', 'SENT', 'FAILED'] as const;
export const emailStatusSchema = z.enum(EMAIL_STATUSES);
export type EmailStatus = z.infer<typeof emailStatusSchema>;

export interface EmailMessage {
  kind: EmailKind;
  to: string;
  subject: string;
  body: string;
  /** The row the message is about: an attempt id, a certificate id, a user id. */
  relatedId?: string | null;
}

/** The console's view of one message. */
export const outboxEntrySchema = z.object({
  id: z.string(),
  kind: emailKindSchema,
  to: z.string(),
  subject: z.string(),
  body: z.string(),
  status: emailStatusSchema,
  relatedId: z.string().nullable(),
  error: z.string().nullable(),
  sentAt: z.string().nullable(),
  createdAt: z.string(),
});
export type OutboxEntry = z.infer<typeof outboxEntrySchema>;

export const outboxResponseSchema = z.object({
  emails: z.array(outboxEntrySchema),
  counts: z.object({
    queued: z.number(),
    sent: z.number(),
    failed: z.number(),
    total: z.number(),
  }),
  filters: z.object({
    kind: emailKindSchema.nullable(),
    status: emailStatusSchema.nullable(),
  }),
  /**
   * Where a message actually goes in this deployment. `log` means the outbox is
   * the only place a message exists — which the console says out loud, rather
   * than implying a provider that is not configured.
   */
  transport: z.enum(['log', 'webhook', 'resend']),
});
export type OutboxResponse = z.infer<typeof outboxResponseSchema>;

export const OUTBOX_PAGE_SIZE = 25;

/**
 * Re-sending one message.
 *
 * A `FAILED` row is kept, not deleted: the attempt, the address and the reason
 * are the evidence. Retrying flips it back to `QUEUED` and asks the transport
 * once more, so the outbox is a queue with a history rather than a log.
 */
export const retryEmailResponseSchema = z.object({
  id: z.string(),
  status: emailStatusSchema,
  error: z.string().nullable(),
});
export type RetryEmailResponse = z.infer<typeof retryEmailResponseSchema>;

/** Draining the queue: how many left, how many are still waiting. */
export const drainOutboxResponseSchema = z.object({
  sent: z.number(),
  remaining: z.number(),
});
export type DrainOutboxResponse = z.infer<typeof drainOutboxResponseSchema>;

/* -------------------------------------------------------------------------- */
/*  Templates                                                                 */
/* -------------------------------------------------------------------------- */

const SIGN_OFF = '— The QuizPlatform team';

function percent(value: number): string {
  return `${Number(value.toFixed(2))}%`;
}

/** A new account. Sent on registration, and only when the address is real. */
export function welcomeEmail(input: { name: string; email: string }): EmailMessage {
  return {
    kind: 'WELCOME',
    to: input.email,
    subject: 'Welcome to QuizPlatform',
    body: [
      `Hello ${input.name},`,
      '',
      'Your QuizPlatform account is ready. You can browse every published quiz, take one,',
      'and review the answers afterwards — pass marks, timers and scoring all happen on',
      'the server, so what you see is what was graded.',
      '',
      'Sign in: /login',
      '',
      SIGN_OFF,
    ].join('\n'),
  };
}

/**
 * The reset link.
 *
 * The body is the only place the raw token ever appears — the database holds a
 * hash — so this message is the whole recovery path when mail is real.
 */
export function passwordResetEmail(input: {
  name: string;
  email: string;
  token: string;
  baseUrl: string;
  expiresInMinutes: number;
}): EmailMessage {
  const link = `${input.baseUrl.replace(/\/$/, '')}/reset-password?token=${encodeURIComponent(input.token)}`;

  return {
    kind: 'PASSWORD_RESET',
    to: input.email,
    subject: 'Reset your QuizPlatform password',
    body: [
      `Hello ${input.name},`,
      '',
      'Someone asked to reset the password for this address. If it was you, open this link:',
      '',
      link,
      '',
      `It expires in ${input.expiresInMinutes} minutes and can only be used once.`,
      '',
      'If it was not you, ignore this message — your password has not changed.',
      '',
      SIGN_OFF,
    ].join('\n'),
  };
}

/** A graded attempt. Sent on submission, once, and never on a retry. */
export function resultEmail(input: {
  name: string;
  email: string;
  quizTitle: string;
  attemptId: string;
  percentage: number;
  score: number;
  totalMarks: number;
  passed: boolean;
  passingScore: number;
}): EmailMessage {
  const verdict = input.passed ? 'PASSED' : 'FAILED';

  return {
    kind: 'RESULT',
    to: input.email,
    subject: `${verdict}: ${input.quizTitle} — ${percent(input.percentage)}`,
    body: [
      `Hello ${input.name},`,
      '',
      `Your attempt at ${input.quizTitle} has been graded.`,
      '',
      `  Result:     ${verdict}`,
      `  Score:      ${input.score} / ${input.totalMarks} marks (${percent(input.percentage)})`,
      `  Pass mark:  ${percent(input.passingScore)}`,
      '',
      `Review the paper question by question: /student/attempt/${input.attemptId}/review`,
      '',
      SIGN_OFF,
    ].join('\n'),
    relatedId: input.attemptId,
  };
}

/** The certificate, with the public code so it can be checked by a third party. */
export function certificateEmail(input: {
  name: string;
  email: string;
  quizTitle: string;
  code: string;
  attemptId: string;
  percentage: number;
  baseUrl: string;
}): EmailMessage {
  return {
    kind: 'CERTIFICATE',
    to: input.email,
    subject: `Certificate — ${input.quizTitle}`,
    body: [
      `Hello ${input.name},`,
      '',
      `You passed ${input.quizTitle} with ${percent(input.percentage)}. Your certificate is ready:`,
      '',
      `  /student/certificates/${input.code}`,
      '',
      `Anyone can verify it at ${input.baseUrl.replace(/\/$/, '')}/verify/${input.code}`,
      '',
      SIGN_OFF,
    ].join('\n'),
    relatedId: input.attemptId,
  };
}
