import type { CertificateResponse } from '@quiz/shared/certificate';
import { normalizeCertificateCode } from '@quiz/shared/certificate';
import { BadgeCheck, CircleAlert, ExternalLink } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { Ambience } from '@/components/cinema/ambience';
import { SkipLink } from '@/components/skip-link';
import { SiteHeader } from '@/components/site-header';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { serverApi } from '@/lib/api-server';
import { getSession } from '@/lib/session';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Verify a certificate — QuizPlatform',
  description:
    'Check that a QuizPlatform certificate is genuine: who earned it, for which quiz, and when.',
  robots: { index: false, follow: false },
};

interface PageProps {
  params: Promise<{ code: string }>;
}

/**
 * Public certificate verification.
 *
 * This page has no session requirement and no link to the console — the person
 * reading it is usually a recruiter or a teacher who was handed a link. It shows
 * exactly what the certificate claims (name, quiz, category, score, date) and
 * nothing else: no account, no email, no history.
 *
 * The API answers 404 for an unknown code and this page renders that as a plain
 * "not found", not as an error page, because a typo is the common case.
 */
export default async function VerifyPage({ params }: PageProps) {
  const { code } = await params;
  const normalized = normalizeCertificateCode(decodeURIComponent(code));

  const session = await getSession();

  let certificate: CertificateResponse['certificate'] | null = null;
  let unavailable = false;

  try {
    const api = await serverApi();
    const res = await api.api.certificates.verify[':code'].$get({ param: { code: normalized } });

    if (res.ok) certificate = (await res.json()).certificate;
  } catch {
    unavailable = true;
  }

  return (
    <div className="relative isolate flex min-h-dvh flex-col overflow-x-clip">
      <Ambience />
      <SkipLink href="#verify" label="Skip to the certificate" />
      <SiteHeader user={session?.user ?? null} />

      <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-6 pt-28 pb-16 sm:px-8 lg:pt-32">
        <div id="verify" tabIndex={-1} className="outline-none">
          <p className="text-primary/80 font-mono text-[11px] tracking-[0.2em] uppercase">
            Certificate verification
          </p>

          {certificate ? (
            <article className="border-border/70 bg-card/70 card-sheen mt-4 rounded-2xl border p-6 shadow-[0_40px_120px_-70px] shadow-black sm:p-9">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Badge variant="success" className="gap-1.5">
                  <BadgeCheck aria-hidden className="size-3.5" />
                  Genuine
                </Badge>
                <span className="text-muted-foreground font-mono text-[12px] tracking-[0.12em]">
                  {certificate.code}
                </span>
              </div>

              <p className="text-muted-foreground mt-6 text-[13px]">This certifies that</p>
              <h1 className="font-display mt-1.5 text-[2.4rem] leading-[1.03] font-extralight text-balance sm:text-[3.2rem]">
                {certificate.studentName}
              </h1>

              <p className="text-muted-foreground mt-5 text-[13px]">passed</p>
              <p className="mt-1 text-[1.35rem] leading-snug font-medium">
                {certificate.quizTitle}
              </p>
              <p className="text-muted-foreground mt-1 text-[12.5px]">{certificate.categoryName}</p>

              <dl className="border-border/60 mt-7 grid grid-cols-2 gap-5 border-t pt-6 sm:grid-cols-3">
                <div>
                  <dt className="text-muted-foreground font-mono text-[10.5px] tracking-[0.16em] uppercase">
                    Score
                  </dt>
                  <dd className="mt-1 text-[1.35rem] font-light tabular-nums">
                    {certificate.score}
                    <span className="text-muted-foreground text-[13px]">
                      {' '}
                      / {certificate.totalMarks}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground font-mono text-[10.5px] tracking-[0.16em] uppercase">
                    Percentage
                  </dt>
                  <dd className="mt-1 text-[1.35rem] font-light tabular-nums">
                    {certificate.percentage}%
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground font-mono text-[10.5px] tracking-[0.16em] uppercase">
                    Issued
                  </dt>
                  <dd className="mt-1 text-[1.35rem] font-light tabular-nums">
                    {new Date(certificate.issuedAt).toISOString().slice(0, 10)}
                  </dd>
                </div>
              </dl>

              <p className="text-muted-foreground border-border/60 mt-7 border-t pt-5 text-[12px] leading-relaxed">
                Checked live against the platform&apos;s record of the attempt. The code above is
                the certificate&apos;s identity — a printout with a different code is not this
                document.
              </p>
            </article>
          ) : (
            <div className="border-border/70 bg-card/70 mt-4 rounded-2xl border p-6 sm:p-9">
              <div className="flex items-start gap-3">
                <CircleAlert aria-hidden className="text-warning mt-0.5 size-5 shrink-0" />
                <div>
                  <h1 className="text-[1.6rem] leading-tight font-light">
                    {unavailable ? 'Verification is unavailable' : 'No certificate has this code'}
                  </h1>
                  <p className="text-muted-foreground mt-2 text-[13.5px] leading-relaxed">
                    {unavailable
                      ? 'The certificate service did not answer. Try again in a moment.'
                      : 'A code is eight characters after “QP-”, in two groups. Check for swapped characters — the alphabet leaves out ones that are easy to confuse.'}
                  </p>
                  <p className="text-muted-foreground mt-3 font-mono text-[12.5px]">
                    {normalized || '(no code)'}
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="mt-6 flex flex-wrap gap-2">
            <Link href="/" className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}>
              What is QuizPlatform?
              <ExternalLink aria-hidden />
            </Link>
            <Link href="/verify" className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}>
              Check another code
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
