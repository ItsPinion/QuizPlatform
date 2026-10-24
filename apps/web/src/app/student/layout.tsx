import type { Metadata } from 'next';

import { SiteHeader } from '@/components/site-header';
import { SkipLink } from '@/components/skip-link';
import { StudentNav } from '@/components/student-nav';

export const metadata: Metadata = {
  title: 'Student area — QuizPlatform',
  description: 'Browse published quizzes, take an attempt and pick it up again where you left off.',
};

/**
 * Shell for the student area.
 *
 * Chrome only: each page runs `decideAccess(session, 'STUDENT', path)` itself so
 * the sign-in redirect can carry the exact page the visitor asked for. The
 * attempt screen opts out of the sidebar by rendering its own full-width layout.
 */
export default function StudentLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <SkipLink href="#main" label="Skip to the content" />
      <SiteHeader />

      <div className="mx-auto grid w-full max-w-6xl flex-1 gap-8 px-5 pt-28 pb-10 sm:px-8 lg:grid-cols-[190px_minmax(0,1fr)]">
        <StudentNav />
        <main id="main" tabIndex={-1} className="min-w-0 outline-none">
          {children}
        </main>
      </div>
    </div>
  );
}
