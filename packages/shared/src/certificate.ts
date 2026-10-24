/**
 * Certificates.
 *
 * A certificate is issued when a student **passes** a quiz that allows them, and
 * it carries a short public code. That code is the point: a certificate nobody
 * can verify is a picture. `/verify/:code` answers without a session and says
 * only what the certificate already prints — name, quiz, score, date — so a
 * recruiter or a teacher can check it from a link.
 *
 * Codes are derived from randomness, never from a counter: `QP-XXXX-XXXX` with
 * an unambiguous alphabet (no `0/O`, `1/I`) so one can be read off a printout.
 */
import { z } from 'zod';

/** Crockford-ish alphabet: the characters that survive being read aloud. */
const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
export const CERTIFICATE_CODE_GROUPS = 2;
export const CERTIFICATE_CODE_GROUP_SIZE = 4;

/**
 * A code from `random` (0–1), so it is testable without seeding `crypto`.
 *
 * Format: `QP-AB12-CD34`. The prefix makes it obvious at a glance what it is.
 */
export function certificateCode(random: () => number = Math.random): string {
  const groups: string[] = [];

  for (let group = 0; group < CERTIFICATE_CODE_GROUPS; group += 1) {
    let chunk = '';
    for (let index = 0; index < CERTIFICATE_CODE_GROUP_SIZE; index += 1) {
      const value = Math.floor(random() * ALPHABET.length) % ALPHABET.length;
      chunk += ALPHABET[value];
    }
    groups.push(chunk);
  }

  return `QP-${groups.join('-')}`;
}

/** Upper-cased, trimmed, dashes kept — what a URL or a typed code should match. */
export function normalizeCertificateCode(input: string): string {
  return input.trim().toUpperCase().replace(/\s+/g, '');
}

const codeField = z
  .string()
  .trim()
  .min(4, 'Enter a certificate code')
  .max(32, 'That code is too long')
  .transform(normalizeCertificateCode);

/** The public verification answer. */
export const certificateSchema = z.object({
  code: z.string(),
  studentName: z.string(),
  quizTitle: z.string(),
  categoryName: z.string(),
  percentage: z.number(),
  score: z.number(),
  totalMarks: z.number(),
  issuedAt: z.string(),
  attemptId: z.string(),
});
export type Certificate = z.infer<typeof certificateSchema>;

export const certificateResponseSchema = z.object({ certificate: certificateSchema });
export type CertificateResponse = z.infer<typeof certificateResponseSchema>;

export const verifyQuerySchema = z.object({ code: codeField });
export type VerifyQuery = z.infer<typeof verifyQuerySchema>;

/** A student's own wall of certificates, newest first. */
export const certificateListResponseSchema = z.object({
  certificates: z.array(certificateSchema),
  total: z.number(),
});
export type CertificateListResponse = z.infer<typeof certificateListResponseSchema>;
