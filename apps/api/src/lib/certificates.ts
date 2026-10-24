/**
 * Issuing and looking up certificates.
 *
 * Issued once per attempt — the table's unique index on `attempt_id` is the
 * guard, and `issueCertificate` is safe to call twice (a retried submission, or
 * a race between the student's click and the clock) because the second call
 * returns the certificate the first one wrote.
 *
 * Reading is deliberately split in two:
 *
 * - `certificateForCode` is **public**. It answers with exactly what the printed
 *   certificate already shows, because its whole job is to let a stranger check
 *   a claim without an account.
 * - `listCertificates` is owner-scoped. You can see your own wall; nobody sees
 *   anybody else's.
 */
import { randomUUID } from 'node:crypto';

import { asc, count, desc, eq } from 'drizzle-orm';

import type { Certificate, CertificateListResponse } from '@quiz/shared/certificate';
import { certificateCode, normalizeCertificateCode } from '@quiz/shared/certificate';
import { db, schema } from '@quiz/db';

const { attempts, categories, certificates, quizzes, users } = schema;

/** The columns a certificate render needs, in one selection. */
const certificateSelection = {
  code: certificates.code,
  issuedAt: certificates.issuedAt,
  attemptId: certificates.attemptId,
  studentName: users.name,
  quizTitle: quizzes.title,
  categoryName: categories.name,
  percentage: attempts.percentage,
  score: attempts.score,
  totalMarks: attempts.totalMarks,
} as const;

type CertificateRow = {
  code: string;
  issuedAt: Date;
  attemptId: string;
  studentName: string;
  quizTitle: string;
  categoryName: string;
  percentage: number;
  score: number;
  totalMarks: number;
};

function toCertificate(row: CertificateRow): Certificate {
  return {
    code: row.code,
    studentName: row.studentName,
    quizTitle: row.quizTitle,
    categoryName: row.categoryName,
    percentage: Number(row.percentage),
    score: Number(row.score),
    totalMarks: Number(row.totalMarks),
    issuedAt: row.issuedAt.toISOString(),
    attemptId: row.attemptId,
  };
}

function certificateQuery() {
  return db
    .select(certificateSelection)
    .from(certificates)
    .innerJoin(attempts, eq(attempts.id, certificates.attemptId))
    .innerJoin(quizzes, eq(quizzes.id, certificates.quizId))
    .innerJoin(categories, eq(categories.id, quizzes.categoryId))
    .innerJoin(users, eq(users.id, certificates.userId));
}

/** Codes are random, but `QP-XXXX-XXXX` collides eventually; retry a few times. */
async function unusedCode(): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = certificateCode();
    const [existing] = await db
      .select({ id: certificates.id })
      .from(certificates)
      .where(eq(certificates.code, code))
      .limit(1);

    if (!existing) return code;
  }

  // 32^8 possibilities and five misses in a row is not luck: something is wrong
  // with the generator, and silently reusing a code would be worse than failing.
  throw new Error('Could not allocate a unique certificate code');
}

/**
 * Issue (or find) the certificate for a passed attempt.
 *
 * Returns the certificate so the caller can put its code in a mail immediately.
 */
export async function issueCertificate(input: {
  attemptId: string;
  userId: string;
  quizId: string;
}): Promise<Certificate & { created: boolean }> {
  const [existing] = await certificateQuery()
    .where(eq(certificates.attemptId, input.attemptId))
    .limit(1);

  if (existing) return { ...toCertificate(existing), created: false };

  const id = randomUUID();

  try {
    await db.insert(certificates).values({
      id,
      attemptId: input.attemptId,
      userId: input.userId,
      quizId: input.quizId,
      code: await unusedCode(),
    });
  } catch (error) {
    // Lost a race with the other caller: the row exists, so read it back.
    const [won] = await certificateQuery()
      .where(eq(certificates.attemptId, input.attemptId))
      .limit(1);

    if (won) return { ...toCertificate(won), created: false };

    throw error;
  }

  const [row] = await certificateQuery()
    .where(eq(certificates.attemptId, input.attemptId))
    .limit(1);

  if (!row) throw new Error('Certificate was written but could not be read back');

  return { ...toCertificate(row), created: true };
}

/** Public verification. `null` for an unknown code — the route answers 404. */
export async function certificateForCode(rawCode: string): Promise<Certificate | null> {
  const code = normalizeCertificateCode(rawCode);

  const [row] = await certificateQuery().where(eq(certificates.code, code)).limit(1);

  return row ? toCertificate(row) : null;
}

/** A student's certificates, newest first. */
export async function listCertificates(userId: string): Promise<CertificateListResponse> {
  const [rows, [total]] = await Promise.all([
    certificateQuery()
      .where(eq(certificates.userId, userId))
      .orderBy(desc(certificates.issuedAt), asc(certificates.code)),
    db.select({ value: count() }).from(certificates).where(eq(certificates.userId, userId)),
  ]);

  return {
    certificates: rows.map(toCertificate),
    total: Number(total?.value ?? 0),
  };
}
