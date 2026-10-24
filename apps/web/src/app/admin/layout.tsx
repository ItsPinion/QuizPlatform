import type { Metadata } from 'next';

import { AdminNav } from '@/components/admin-nav';
import { SiteHeader } from '@/components/site-header';
import { SkipLink } from '@/components/skip-link';
import { getSession } from '@/lib/session';

export const metadata: Metadata = {
  title: 'Admin console — QuizPlatform',
  description: 'Manage users, quizzes, categories and questions, and read platform statistics.',
};

/**
 * Shell for every admin screen.
 *
 * It deliberately renders chrome only: each page performs its own role check so
 * the sign-in redirect can carry the exact `?next=` destination of the page the
 * visitor asked for (a layout never sees the pathname).
 *
 * The one thing the layout does read is the session — not to gate anything, but
 * to hand it to the header, so the bar paints the controls that belong to the
 * visitor instead of correcting itself after hydration. `getSession` is cached
 * per request, so the page's own check costs nothing extra.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();

  return (
    <div className="flex min-h-dvh flex-col">
      <SkipLink href="#main" label="Skip to the content" />
      <SiteHeader user={session?.user ?? null} />

      <div className="mx-auto grid w-full max-w-6xl flex-1 gap-8 px-5 pt-28 pb-10 sm:px-8 lg:grid-cols-[190px_minmax(0,1fr)]">
        <AdminNav />
        <main id="main" tabIndex={-1} className="min-w-0 outline-none">
          {children}
        </main>
      </div>
    </div>
  );
}
