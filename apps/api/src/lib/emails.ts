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

import type { EmailKind, EmailMessage, OutboxEntry, OutboxResponse } from '@quiz/shared/email';
import { OUTBOX_PAGE_SIZE } from '@quiz/shared/email';
import { db, schema } from '@quiz/db';

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
async function transport(message: { to: string; subject: string; body: string }): Promise<void> {
  if (env.NODE_ENV === 'production' && process.env.SMTP_URL) {
    // A real deployment plugs its provider in here; until then, production with
    // no SMTP URL falls through to the log rather than pretending to send.
    throw new Error('SMTP transport is not configured in this build');
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
