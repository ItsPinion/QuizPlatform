/**
 * Mail: render, queue, deliver.
 *
 * The outbox pattern, in about eighty lines. A caller never awaits a mail
 * server: `send()` writes the rendered message into `email_outbox` and returns.
 * `deliver()` then hands queued messages to the transport — with no SMTP
 * configured that is the development transport, which logs the message and marks
 * it `SENT`, so the whole flow is exercised on a laptop with no credentials.
 *
 * The console can read the outbox (`GET /api/admin/emails`), which is how a real
 * deployment would debug "I never got the email" without a mail-provider login.
 */
import { randomUUID } from 'node:crypto';

import { and, count, desc, eq } from 'drizzle-orm';

import type {
  EmailKind,
  EmailMessage,
  OutboxEntry,
  OutboxResponse,
  RetryEmailResponse,
} from '@quiz/shared/email';
import { OUTBOX_PAGE_SIZE, retryEmailResponseSchema } from '@quiz/shared/email';
import { db, schema } from '@quiz/db';

import { ApiError } from './errors';
import { env } from './env';

const { emailOutbox } = schema;

/**
 * The transport.
 *
 * A function so a deployment can swap it, and `console` so a developer can see
 * what would have been sent. Nothing in the request path depends on it
 * succeeding: a delivery failure marks the row `FAILED` with the reason and the
 * caller carries on.
 */
/**
 * How a message leaves the process.
 *
 * Three transports, chosen by `MAIL_TRANSPORT` and usable everywhere this
 * project runs (Bun, Node, a container, a test):
 *
 *   - **`log`** (default) — the development transport. It writes the whole
 *     message to stdout and marks it sent, so registration and submission work
 *     with no mail server anywhere, and the reset link is still readable.
 *   - **`webhook`** — `POST { to, from, subject, text }` to `MAIL_WEBHOOK_URL`.
 *     Anything that accepts a JSON POST works: a relay, a queue, an in-house
 *     mailer.
 *   - **`resend`** — the Resend HTTP API, when `RESEND_API_KEY` is set.
 *
 * Deliberately not SMTP. An SMTP client is a dependency, a socket and a set of
 * timeout behaviours to get wrong; every provider that matters offers an HTTPS
 * endpoint, and `fetch` is already here.
 *
 * A failure throws, and `deliver()` records it against the row with the reason —
 * a transport problem must never look like a successful send.
 */
async function transport(message: { to: string; subject: string; body: string }): Promise<void> {
  const mode = env.RESEND_API_KEY ? 'resend' : env.MAIL_TRANSPORT;

  if (mode === 'resend') {
    if (!env.RESEND_API_KEY) {
      throw new Error('MAIL_TRANSPORT=resend needs RESEND_API_KEY');
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.RESEND_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from: env.MAIL_FROM,
        to: [message.to],
        subject: message.subject,
        text: message.body,
      }),
    });

    if (!res.ok) {
      throw new Error(
        `Resend refused the message (${res.status}): ${(await res.text()).slice(0, 200)}`,
      );
    }

    return;
  }

  if (mode === 'webhook') {
    if (!env.MAIL_WEBHOOK_URL) {
      throw new Error('MAIL_TRANSPORT=webhook needs MAIL_WEBHOOK_URL');
    }

    const res = await fetch(env.MAIL_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        to: message.to,
        from: env.MAIL_FROM,
        subject: message.subject,
        text: message.body,
      }),
    });

    if (!res.ok) {
      throw new Error(`Mail webhook answered ${res.status}`);
    }

    return;
  }

  // One line per message, body included — the point is to be able to read it.
  console.info(
    `[mail] → ${message.to}\n        ${message.subject}\n${message.body
      .split('\n')
      .map((line) => `        ${line}`)
      .join('\n')}`,
  );
}

/**
 * Queue a message and try to deliver it.
 *
 * Returns the row id. Never throws for a delivery problem: mail must not be able
 * to fail a registration or a submission.
 */
export async function queueEmail(message: EmailMessage): Promise<string> {
  const id = randomUUID();

  await db.insert(emailOutbox).values({
    id,
    kind: message.kind,
    toEmail: message.to,
    subject: message.subject,
    body: message.body,
    status: 'QUEUED',
    relatedId: message.relatedId ?? null,
  });

  await deliver(id);

  return id;
}

/** Attempt one queued message. Failure is recorded, not raised. */
export async function deliver(id: string): Promise<boolean> {
  const [row] = await db
    .select({
      id: emailOutbox.id,
      to: emailOutbox.toEmail,
      subject: emailOutbox.subject,
      body: emailOutbox.body,
    })
    .from(emailOutbox)
    .where(and(eq(emailOutbox.id, id), eq(emailOutbox.status, 'QUEUED')))
    .limit(1);

  if (!row) return false;

  try {
    await transport({ to: row.to, subject: row.subject, body: row.body });

    await db
      .update(emailOutbox)
      .set({ status: 'SENT', sentAt: new Date(), error: null })
      .where(eq(emailOutbox.id, id));

    return true;
  } catch (error) {
    await db
      .update(emailOutbox)
      .set({ status: 'FAILED', error: error instanceof Error ? error.message : String(error) })
      .where(eq(emailOutbox.id, id));

    return false;
  }
}

/**
 * Try one message again, whatever state it is in.
 *
 * Only a message that is not already `SENT` is worth a second attempt; anything
 * else is a no-op that reports the current row. The status is reset to `QUEUED`
 * first because that is the state `deliver()` claims from — the same claim the
 * first attempt made, which is what keeps two retries from sending twice.
 */
export async function retryEmail(id: string): Promise<RetryEmailResponse> {
  const [row] = await db
    .select({ id: emailOutbox.id, status: emailOutbox.status })
    .from(emailOutbox)
    .where(eq(emailOutbox.id, id))
    .limit(1);

  if (!row) {
    throw new ApiError(404, 'EMAIL_NOT_FOUND', 'No such message in the outbox.');
  }

  if (row.status !== 'SENT') {
    await db
      .update(emailOutbox)
      .set({ status: 'QUEUED', error: null })
      .where(eq(emailOutbox.id, id));

    await deliver(id);
  }

  const [after] = await db
    .select({ status: emailOutbox.status, error: emailOutbox.error })
    .from(emailOutbox)
    .where(eq(emailOutbox.id, id))
    .limit(1);

  return retryEmailResponseSchema.parse({
    id,
    status: after?.status ?? 'FAILED',
    error: after?.error ?? null,
  });
}

/** Drain what is waiting. Bounded so one call cannot loop forever. */
export async function drainOutbox(limit = 20): Promise<number> {
  const rows = await db
    .select({ id: emailOutbox.id })
    .from(emailOutbox)
    .where(eq(emailOutbox.status, 'QUEUED'))
    .orderBy(desc(emailOutbox.createdAt))
    .limit(limit);

  let sent = 0;
  for (const row of rows) {
    if (await deliver(row.id)) sent += 1;
  }

  return sent;
}

/** Which transport this process would use right now. */
export function mailTransport(): 'log' | 'webhook' | 'resend' {
  if (env.RESEND_API_KEY) return 'resend';
  return env.MAIL_TRANSPORT;
}

/** How many messages are still waiting. */
export async function countQueued(): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(emailOutbox)
    .where(eq(emailOutbox.status, 'QUEUED'));

  return Number(row?.value ?? 0);
}

/** The console's read: page, filters, and counts for the whole table. */
export async function listOutbox(options: {
  kind?: EmailKind | null;
  status?: 'QUEUED' | 'SENT' | 'FAILED' | null;
  page?: number;
}): Promise<OutboxResponse> {
  const page = Math.max(1, options.page ?? 1);
  const clauses = [];

  if (options.kind) clauses.push(eq(emailOutbox.kind, options.kind));
  if (options.status) clauses.push(eq(emailOutbox.status, options.status));

  const where = clauses.length > 0 ? and(...clauses) : undefined;

  const [rows, [total], counts] = await Promise.all([
    db
      .select()
      .from(emailOutbox)
      .where(where)
      .orderBy(desc(emailOutbox.createdAt))
      .limit(OUTBOX_PAGE_SIZE)
      .offset((page - 1) * OUTBOX_PAGE_SIZE),
    db.select({ value: count() }).from(emailOutbox).where(where),
    db
      .select({ status: emailOutbox.status, value: count() })
      .from(emailOutbox)
      .groupBy(emailOutbox.status),
  ]);

  return {
    emails: rows.map((row): OutboxEntry => ({
      id: row.id,
      kind: row.kind,
      to: row.toEmail,
      subject: row.subject,
      body: row.body,
      status: row.status,
      relatedId: row.relatedId,
      error: row.error,
      sentAt: row.sentAt ? row.sentAt.toISOString() : null,
      createdAt: row.createdAt.toISOString(),
    })),
    transport: mailTransport(),
    counts: {
      queued: Number(counts.find((entry) => entry.status === 'QUEUED')?.value ?? 0),
      sent: Number(counts.find((entry) => entry.status === 'SENT')?.value ?? 0),
      failed: Number(counts.find((entry) => entry.status === 'FAILED')?.value ?? 0),
      total: Object.values(counts).reduce((sum, entry) => sum + Number(entry.value), 0),
    },
    filters: { kind: options.kind ?? null, status: options.status ?? null },
  };
}

/** The origin links in mail should point at. */
export function publicBaseUrl(): string {
  return env.WEB_ORIGIN;
}
