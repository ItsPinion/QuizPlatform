import type { Metadata } from 'next';

import { SiteHeader } from '@/components/site-header';
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
      <SiteHeader />

      <div className="mx-auto grid w-full max-w-6xl flex-1 gap-8 px-5 py-10 sm:px-8 lg:grid-cols-[190px_minmax(0,1fr)]">
        <StudentNav />
        <main className="min-w-0">{children}</main>
      </div>
    </div>
  );
}
