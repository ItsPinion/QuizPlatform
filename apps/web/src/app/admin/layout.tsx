import type { Metadata } from 'next';

import { Ambience } from '@/components/cinema/ambience';
import { SectionNav } from '@/components/cinema/section-nav';
import { SiteHeader } from '@/components/site-header';
import { SkipLink } from '@/components/skip-link';
import { getSession } from '@/lib/session';

export const metadata: Metadata = {
  title: 'Admin console — QuizPlatform',
  description: 'Manage users, quizzes, categories and questions, and read platform statistics.',
};

/** The console's pages, as the rail sees them. */
const SECTIONS = [
  { href: '/admin', label: 'Overview', icon: 'overview' },
  { href: '/admin/users', label: 'Users', icon: 'users' },
  { href: '/admin/quizzes', label: 'Quizzes', icon: 'quizzes', prefix: true },
  { href: '/admin/categories', label: 'Categories', icon: 'categories' },
  { href: '/admin/analytics', label: 'Analytics', icon: 'analytics' },
  { href: '/admin/system', label: 'System', icon: 'system' },
] as const;

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
    <div className="relative isolate flex min-h-dvh flex-col overflow-x-clip">
      <Ambience />
      <SkipLink href="#main" label="Skip to the content" />
      <SiteHeader user={session?.user ?? null} />

      <div className="mx-auto grid w-full max-w-6xl flex-1 gap-8 px-6 pt-28 pb-16 sm:px-8 lg:grid-cols-[190px_minmax(0,1fr)] lg:gap-12 lg:pt-32">
        <SectionNav label="Admin sections" items={SECTIONS} />
        <main id="main" tabIndex={-1} className="min-w-0 outline-none">
          {children}
        </main>
      </div>
    </div>
  );
}
