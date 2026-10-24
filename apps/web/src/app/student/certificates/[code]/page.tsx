import type { Certificate, CertificateListResponse } from '@quiz/shared/certificate';
import { normalizeCertificateCode } from '@quiz/shared/certificate';
import { ArrowLeft, BadgeCheck, ShieldCheck } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { PrintButton } from '@/components/print-button';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { serverApi } from '@/lib/api-server';
import { decideAccess } from '@/lib/guards';
import { getSession } from '@/lib/session';
import { cn } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'Certificate — QuizPlatform',
  description: 'Your certificate, with its public verification code.',
};

/**
 * One certificate, as the document it is.
 *
 * Owner-scoped by construction: the code is looked up in **your own** list, not
 * by a public endpoint. Somebody else's code is a 404 here, even though
 * `/verify/:code` would answer it — that page is the public view, this one is
 * the copy you keep.
 */
export default async function CertificatePage({ params }: { params: Promise<{ code: string }> }) {
  const decision = decideAccess(await getSession(), 'STUDENT', '/student/certificates');
  if (!decision.allowed) redirect(decision.redirectTo);

  const { code } = await params;
  const wanted = normalizeCertificateCode(decodeURIComponent(code));

  let mine: Certificate[] = [];

  try {
    const api = await serverApi();
    const res = await api.api.student.certificates.$get();
    if (res.ok) mine = ((await res.json()) as CertificateListResponse).certificates;
  } catch {
    mine = [];
  }

  const certificate = mine.find((entry) => entry.code === wanted);

  if (!certificate) notFound();

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/student/certificates"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-[12.5px] transition-colors"
        >
          <ArrowLeft aria-hidden className="size-3.5" />
          All certificates
        </Link>

        <div className="flex flex-wrap gap-1.5">
          <Badge variant="success" className="gap-1.5">
            <BadgeCheck aria-hidden className="size-3.5" />
            Verified
          </Badge>
          <PrintButton />
        </div>
      </div>

      <article className="border-border/70 bg-card/70 card-sheen relative overflow-hidden rounded-2xl border p-6 shadow-[0_40px_120px_-70px] shadow-black sm:p-10 print:border-0 print:bg-white print:text-black print:shadow-none">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-32 -right-24 size-[26rem] rounded-full bg-[radial-gradient(closest-side,rgba(255,255,255,0.07),transparent)] blur-2xl print:hidden"
        />

        <div className="relative">
          <p className="font-mono text-[10.5px] tracking-[0.24em] text-gray-400 uppercase print:text-gray-600">
            Certificate of completion
          </p>

          <p className="text-muted-foreground mt-8 text-[13px] print:text-gray-600">
            This certifies that
          </p>
          <h1 className="font-display mt-2 text-[2.6rem] leading-[1.02] font-extralight text-balance sm:text-[3.6rem]">
            {certificate.studentName}
          </h1>

          <p className="text-muted-foreground mt-7 text-[13px] print:text-gray-600">has passed</p>
          <p className="mt-1.5 text-[1.4rem] leading-snug font-medium sm:text-[1.6rem]">
            {certificate.quizTitle}
          </p>
          <p className="text-muted-foreground mt-1 text-[12.5px] print:text-gray-600">
            {certificate.categoryName}
          </p>

          <dl className="border-border/60 mt-9 grid grid-cols-2 gap-6 border-t pt-6 sm:grid-cols-4 print:border-gray-300">
            {[
              { label: 'Score', value: `${certificate.score} / ${certificate.totalMarks}` },
              { label: 'Percentage', value: `${certificate.percentage}%` },
              {
                label: 'Issued',
                value: new Date(certificate.issuedAt).toISOString().slice(0, 10),
              },
              { label: 'Code', value: certificate.code },
            ].map((item) => (
              <div key={item.label}>
                <dt className="font-mono text-[10px] tracking-[0.16em] text-gray-500 uppercase">
                  {item.label}
                </dt>
                <dd className="mt-1 text-[1.05rem] font-light tabular-nums">{item.value}</dd>
              </div>
            ))}
          </dl>

          <div className="border-border/60 mt-9 flex flex-wrap items-center gap-x-6 gap-y-2 border-t pt-5 print:border-gray-300">
            <span className="inline-flex items-center gap-1.5 font-mono text-[11px] tracking-[0.14em] text-gray-400 uppercase print:text-gray-600">
              <ShieldCheck aria-hidden className="size-3.5" />
              Verify at /verify/{certificate.code}
            </span>
            <span className="text-muted-foreground text-[11.5px] print:text-gray-600">
              QuizPlatform · attempt {certificate.attemptId.slice(0, 8)}
            </span>
          </div>
        </div>
      </article>

      <div className="flex flex-wrap gap-2 print:hidden">
        <Link
          href={`/verify/${certificate.code}`}
          className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
        >
          See the public view
        </Link>
        <Link
          href="/student/quizzes"
          className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}
        >
          Take another quiz
        </Link>
      </div>

      <p className="text-muted-foreground text-[11.5px] leading-relaxed print:hidden">
        The public link shows this same document to anyone — name, quiz, score, date — and asks for
        no account. Send it to whoever needs the proof.
      </p>
    </div>
  );
}
