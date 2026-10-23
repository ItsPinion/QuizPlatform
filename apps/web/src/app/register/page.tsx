import type { Metadata } from 'next';
import Link from 'next/link';

import { RegisterForm } from '@/components/register-form';
import { SiteHeader } from '@/components/site-header';
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card';

export const metadata: Metadata = {
  title: 'Create an account — QuizPlatform',
  description: 'Register for a student account on QuizPlatform.',
};

export default function RegisterPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />

      <main className="flex flex-1 items-center justify-center px-5 py-12 sm:px-8">
        <div className="w-full max-w-md">
          <Card>
            <CardHeader>
              <h1 className="text-xl leading-none font-semibold tracking-tight">
                Create your account
              </h1>
              <CardDescription>
                Student accounts can take quizzes and track results. Administrator accounts are
                created by an owner.
              </CardDescription>
            </CardHeader>

            <CardContent className="flex flex-col gap-6">
              <RegisterForm />

              <p className="text-muted-foreground text-sm">
                Already registered?{' '}
                <Link href="/login" className="text-primary underline-offset-4 hover:underline">
                  Sign in
                </Link>
              </p>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
