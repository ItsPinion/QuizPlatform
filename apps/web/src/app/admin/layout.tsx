import type { Metadata } from 'next';

import { AdminNav } from '@/components/admin-nav';
import { SiteHeader } from '@/components/site-header';

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
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />

      <div className="mx-auto grid w-full max-w-6xl flex-1 gap-8 px-5 py-10 sm:px-8 lg:grid-cols-[190px_minmax(0,1fr)]">
        <AdminNav />
        <main className="min-w-0">{children}</main>
      </div>
    </div>
  );
}
