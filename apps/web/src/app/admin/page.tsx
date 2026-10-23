import { BarChart3, FolderTree, ListChecks, ShieldCheck, Users } from 'lucide-react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { SiteHeader } from '@/components/site-header';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { decideAccess } from '@/lib/guards';
import { getSession } from '@/lib/session';

export const metadata: Metadata = {
  title: 'Admin area — QuizPlatform',
  description: 'Administrator workspace for managing quizzes, questions, categories and users.',
};

const MODULES = [
  { day: 4, title: 'User management', detail: 'List, edit and deactivate accounts.', icon: Users },
  {
    day: 5,
    title: 'Quiz management',
    detail: 'Create, edit, delete and publish quizzes.',
    icon: ListChecks,
  },
  {
    day: 6,
    title: 'Categories & questions',
    detail: 'Category CRUD, questions, options and correct answers.',
    icon: FolderTree,
  },
  {
    day: 11,
    title: 'Analytics',
    detail: 'Attempts, pass rates and popular quizzes.',
    icon: BarChart3,
  },
];

export default async function AdminPage() {
  // Two different problems, two different destinations: sign in first, or go to
  // the area your role actually owns.
  const decision = decideAccess(await getSession(), 'ADMIN', '/admin');
  if (!decision.allowed) redirect(decision.redirectTo);

  const { session } = decision;
  const permissions = [
    'Manage quizzes',
    'Manage questions',
    'Manage categories',
    'Manage users',
    'Read analytics',
  ];

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />

      <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-12 sm:px-8">
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant="warning" className="gap-1.5">
            <ShieldCheck className="size-3" />
            ADMIN
          </Badge>
          <h1 className="text-2xl font-semibold tracking-tight">
            Welcome back, {session.user.name.split(' ')[0]}
          </h1>
        </div>

        <p className="text-muted-foreground mt-2 max-w-2xl text-sm">
          This page is served only after{' '}
          <code className="bg-muted rounded px-1 py-0.5">/api/admin/access</code> confirms an{' '}
          <code className="bg-muted rounded px-1 py-0.5">ADMIN</code> session. Students who open it
          are redirected to their own area.
        </p>

        <div className="mt-8 grid gap-4 lg:grid-cols-[1fr_2fr]">
          <Card>
            <CardHeader>
              <CardTitle>Your session</CardTitle>
              <CardDescription>Verified on the server for this request.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2.5 text-[13px]">
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Email</span>
                <span className="truncate font-mono text-[12px]">{session.user.email}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Role</span>
                <span className="font-mono text-[12px]">{session.user.role}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Expires</span>
                <span className="font-mono text-[12px]">
                  {new Date(session.expiresAt).toLocaleDateString(undefined, {
                    day: '2-digit',
                    month: 'short',
                  })}
                </span>
              </div>

              <div className="border-border/60 mt-4 border-t pt-3">
                <p className="text-muted-foreground mb-2 text-[11px] tracking-wide uppercase">
                  Permissions
                </p>
                <ul className="space-y-1">
                  {permissions.map((permission) => (
                    <li key={permission} className="text-[12.5px]">
                      · {permission}
                    </li>
                  ))}
                </ul>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-3 sm:grid-cols-2">
            {MODULES.map((module) => (
              <Card key={module.title} className="bg-card/40">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <module.icon className="text-primary size-4" />
                    {module.title}
                  </CardTitle>
                  <CardDescription>{module.detail}</CardDescription>
                </CardHeader>
                <CardContent>
                  <Badge variant="outline" className="text-[10px]">
                    Day {module.day}
                  </Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
