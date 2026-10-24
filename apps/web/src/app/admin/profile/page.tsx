import { CalendarDays, KeyRound, Mail, ShieldCheck, UserRound } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { PageHeader } from '@/components/cinema/page-header';
import { ChangePasswordForm } from '@/components/change-password-form';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { decideAccess } from '@/lib/guards';
import { getSession } from '@/lib/session';
import { cn } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'Account — Admin console',
  description: 'The account you are signed in as, and the password that protects it.',
};

/**
 * The administrator's own account.
 *
 * The console had every tool except the one nobody should have to ask for: a
 * way to change the password you are signed in with. The students had it on
 * `/student/profile`; this is the same form, on the same endpoint, for the role
 * that runs the place.
 *
 * It is a small page on purpose. There is no "profile" to edit — name, email and
 * role belong to the platform, and changing them from the same screen you are
 * signed in to is how an administrator locks themselves out. Password only, with
 * the current password required, which `POST /api/auth/change-password` enforces
 * whether or not the form remembers to ask.
 */
export default async function AdminAccountPage() {
  const decision = decideAccess(await getSession(), 'ADMIN', '/admin/profile');
  if (!decision.allowed) redirect(decision.redirectTo);

  const session = await getSession();
  const user = session!.user;

  const rows = [
    { icon: UserRound, label: 'Name', value: user.name },
    { icon: Mail, label: 'Email', value: user.email },
    { icon: ShieldCheck, label: 'Role', value: 'Administrator' },
    {
      icon: CalendarDays,
      label: 'Account created',
      value: new Date(user.createdAt).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }),
    },
  ];

  return (
    <div className="space-y-8">
      <PageHeader
        label="Your account"
        title={user.name}
        description="Who you are signed in as, and the two minutes that keep the console yours."
        aside={
          <>
            <Badge variant="outline">{user.role}</Badge>
            <Badge variant={user.status === 'ACTIVE' ? 'success' : 'destructive'}>
              {user.status}
            </Badge>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Signed in as</CardTitle>
            <CardDescription className="text-[11.5px]">
              These fields belong to the platform, not to this screen. An administrator with server
              access can change them; nobody can change them from here, so a stolen session cannot
              quietly take the account over.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-[13px]">
            {rows.map((row) => (
              <div
                key={row.label}
                className="border-border/50 flex items-center justify-between gap-4 border-b pb-2.5 last:border-0 last:pb-0"
              >
                <span className="text-muted-foreground inline-flex items-center gap-2">
                  <row.icon aria-hidden className="size-3.5" />
                  {row.label}
                </span>
                <span className="min-w-0 truncate text-right font-medium">{row.value}</span>
              </div>
            ))}

            <p className="text-muted-foreground flex items-start gap-2 pt-1 text-[11.5px] leading-relaxed">
              <KeyRound aria-hidden className="mt-0.5 size-3.5 shrink-0" />
              Sessions last seven days. Signing out clears the cookie; changing the password here
              also cancels any reset link that was requested but not used.
            </p>

            <Link
              href="/admin/system"
              className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'mt-1')}
            >
              Open system status
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Change password</CardTitle>
            <CardDescription className="text-[11.5px]">
              Needs the current password, even though you are signed in — a borrowed laptop is as
              likely as its owner.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ChangePasswordForm />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
