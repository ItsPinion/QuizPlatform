import type { CertificateListResponse } from '@quiz/shared/certificate';
import { Award, ArrowUpRight, BadgeCheck, Copy } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { PageHeader } from '@/components/cinema/page-header';
import { StatCard } from '@/components/stat-card';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { serverApi } from '@/lib/api-server';
import { decideAccess } from '@/lib/guards';
import { getSession } from '@/lib/session';
import { cn } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'Certificates — QuizPlatform',
  description: 'Every certificate you have earned, with its public verification code.',
};

/**
 * The student's certificates.
 *
 * One row per pass on a quiz that issues them. Each card carries the code, which
 * is the whole point of the feature: a certificate is only worth something if a
 * stranger can check it, so the code and its verification link sit on the card
 * rather than behind a download.
 */
export default async function CertificatesPage() {
  const decision = decideAccess(await getSession(), 'STUDENT', '/student/certificates');
  if (!decision.allowed) redirect(decision.redirectTo);

  let data: CertificateListResponse | null = null;

  try {
    const api = await serverApi();
    const res = await api.api.student.certificates.$get();
    if (res.ok) data = await res.json();
  } catch {
    data = null;
  }

  const certificates = data?.certificates ?? [];
  const best = certificates.reduce(
    (top, entry) => (entry.percentage > (top?.percentage ?? -1) ? entry : top),
    certificates[0],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        label="Student · proof"
        title="Your certificates"
        description="Every pass that earned one, newest first. Each carries a code that verifies the attempt behind it — share the link with anyone who wants proof."
        aside={
          <Badge variant="outline" className="gap-1.5">
            <BadgeCheck aria-hidden className="size-3" />
            Public verification
          </Badge>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Certificates" value={data ? data.total : '—'} icon={Award} />
        <StatCard
          label="Best percentage"
          value={best ? `${best.percentage}%` : '—'}
          hint={best ? best.quizTitle : 'Pass a quiz that issues them'}
          icon={BadgeCheck}
          tone={best ? 'success' : 'default'}
        />
        <StatCard
          label="Verification"
          value="Public"
          hint="No account needed to check a code"
          icon={ArrowUpRight}
        />
      </div>

      {certificates.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">No certificates yet</CardTitle>
            <CardDescription>
              You earn one by passing a quiz that has certificates enabled. The quiz list marks
              which ones do.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Link href="/student/quizzes" className={cn(buttonVariants({ size: 'sm' }))}>
              Find a quiz to pass
            </Link>
            <Link href="/verify" className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}>
              Check someone else&apos;s code
            </Link>
          </CardContent>
        </Card>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {certificates.map((certificate) => (
            <li key={certificate.code}>
              <Card className="group h-full gap-4 py-5 transition-transform duration-300 hover:-translate-y-0.5 motion-reduce:hover:translate-y-0">
                <CardContent className="space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="cine-label text-[9px] text-gray-400">
                        {certificate.categoryName}
                      </p>
                      <h2 className="mt-1.5 truncate text-[15px] font-medium">
                        {certificate.quizTitle}
                      </h2>
                    </div>
                    <Award aria-hidden className="text-success size-5 shrink-0" />
                  </div>

                  <div className="flex items-end justify-between gap-3">
                    <div>
                      <p className="font-display text-[2rem] leading-none font-light tabular-nums">
                        {certificate.percentage}%
                      </p>
                      <p className="text-muted-foreground mt-1 text-[11.5px] tabular-nums">
                        {certificate.score} / {certificate.totalMarks} marks ·{' '}
                        {new Date(certificate.issuedAt).toISOString().slice(0, 10)}
                      </p>
                    </div>

                    <span className="border-border/70 bg-background/60 rounded-lg border px-2.5 py-1 font-mono text-[11.5px] tracking-[0.1em]">
                      {certificate.code}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    <Link
                      href={`/student/certificates/${certificate.code}`}
                      className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
                    >
                      Open
                    </Link>
                    <Link
                      href={`/verify/${certificate.code}`}
                      className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}
                    >
                      <Copy aria-hidden />
                      Verify
                    </Link>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <p className="text-muted-foreground text-[11.5px] leading-relaxed">
        A code is public by design — it identifies the certificate, not you. Anyone with the link
        sees the name on the document, the quiz, the score and the date, and nothing else.
      </p>
    </div>
  );
}
