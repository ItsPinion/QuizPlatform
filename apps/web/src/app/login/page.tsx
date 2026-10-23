import { ShieldCheck, UserRound } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { LoginForm } from '@/components/login-form';
import { SiteHeader } from '@/components/site-header';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export const metadata: Metadata = {
  title: 'Sign in — QuizPlatform',
  description: 'Sign in to your QuizPlatform account.',
};

const DEMO_ACCOUNTS = [
  { email: 'admin@quiz.dev', password: 'Admin12345', role: 'ADMIN' as const },
  { email: 'rahul@quiz.dev', password: 'Password123', role: 'STUDENT' as const },
];

export default function LoginPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />

      <main className="flex flex-1 items-center justify-center px-5 py-12 sm:px-8">
        <div className="w-full max-w-md">
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">Welcome back</CardTitle>
              <CardDescription>
                Sign in to keep your attempts, results and progress.
              </CardDescription>
            </CardHeader>

            <CardContent className="flex flex-col gap-6">
              <LoginForm />

              <p className="text-muted-foreground text-sm">
                New here?{' '}
                <Link href="/register" className="text-primary underline-offset-4 hover:underline">
                  Create an account
                </Link>
              </p>
            </CardContent>
          </Card>

          <div className="border-border/60 bg-card/40 mt-4 rounded-xl border px-4 py-3">
            <p className="text-muted-foreground mb-2 text-xs font-medium tracking-wide uppercase">
              Seeded demo accounts
            </p>
            <ul className="flex flex-col gap-1.5">
              {DEMO_ACCOUNTS.map((account) => (
                <li key={account.email} className="flex items-center gap-2 text-xs">
                  {account.role === 'ADMIN' ? (
                    <ShieldCheck className="text-warning size-3.5" />
                  ) : (
                    <UserRound className="text-primary size-3.5" />
                  )}
                  <code className="font-mono">{account.email}</code>
                  <span className="text-muted-foreground">/</span>
                  <code className="font-mono">{account.password}</code>
                  <Badge variant="outline" className="ml-auto text-[10px]">
                    {account.role}
                  </Badge>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </main>
    </div>
  );
}
