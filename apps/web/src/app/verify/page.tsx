import { ShieldCheck } from 'lucide-react';
import type { Metadata } from 'next';

import { Ambience } from '@/components/cinema/ambience';
import { SkipLink } from '@/components/skip-link';
import { SiteHeader } from '@/components/site-header';
import { VerifyLookup } from '@/components/verify-lookup';
import { getSession } from '@/lib/session';

export const metadata: Metadata = {
  title: 'Verify a certificate — QuizPlatform',
  description: 'Enter the code from a QuizPlatform certificate to check who earned it and when.',
};

/**
 * The entry point to verification, for someone who was handed a code on paper
 * rather than a link.
 */
export default async function VerifyIndexPage() {
  const session = await getSession();

  return (
    <div className="relative isolate flex min-h-dvh flex-col overflow-x-clip">
      <Ambience />
      <SkipLink href="#verify" label="Skip to the form" />
      <SiteHeader user={session?.user ?? null} />

      <main id="main" className="mx-auto w-full max-w-2xl flex-1 px-6 pt-28 pb-16 sm:px-8 lg:pt-36">
        <div id="verify" tabIndex={-1} className="outline-none">
          <p className="text-primary/80 font-mono text-[11px] tracking-[0.2em] uppercase">
            Certificate verification
          </p>

          <h1 className="font-display mt-3 text-[2.6rem] leading-[1.02] font-extralight text-balance sm:text-[3.4rem]">
            Check a certificate
          </h1>

          <p className="text-muted-foreground mt-4 max-w-xl text-[15px] leading-relaxed">
            Every certificate this platform issues carries a code that points at the attempt behind
            it. Type it here and you will see who earned it, for which quiz, with what score, and
            when — read live from the record, not from the image.
          </p>

          <div className="border-border/70 bg-card/70 card-sheen mt-8 rounded-2xl border p-6 shadow-[0_40px_120px_-70px] shadow-black sm:p-8">
            <VerifyLookup />
          </div>

          <div className="border-border/60 mt-8 flex items-start gap-3 border-t pt-6">
            <ShieldCheck aria-hidden className="text-muted-foreground mt-0.5 size-4 shrink-0" />
            <p className="text-muted-foreground text-[12.5px] leading-relaxed">
              Verification needs no account and shows nothing private: not the student&apos;s email,
              not their other attempts. A certificate with no matching code was not issued here.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
