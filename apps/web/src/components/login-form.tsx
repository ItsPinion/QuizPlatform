'use client';

import { CircleAlert, Eye, EyeOff, Loader2, LogIn } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { client } from '@/lib/api';
import { parseApiFailure, toApiFailure, type ApiFailure } from '@/lib/api-error';

export function LoginForm({ next = '/' }: { next?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<ApiFailure | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setFailure(null);

    try {
      const res = await client.api.auth.login.$post({ json: { email, password } });

      if (!res.ok) {
        setFailure(parseApiFailure(await res.json(), 'Email or password is incorrect.'));
        return;
      }

      // Refresh so server components re-render with the new session cookie.
      router.replace(next);
      router.refresh();
    } catch (cause) {
      setFailure(toApiFailure(cause));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
      {failure ? (
        <div
          role="alert"
          className="border-destructive/35 bg-destructive/10 text-destructive flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm"
        >
          <CircleAlert className="mt-0.5 size-4 shrink-0" />
          <span>{failure.message}</span>
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@quiz.dev"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
          aria-invalid={failure?.code === 'VALIDATION_ERROR' || undefined}
        />
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="password">Password</Label>
          <button
            type="button"
            onClick={() => setShowPassword((value) => !value)}
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs transition-colors"
          >
            {showPassword ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
            {showPassword ? 'Hide' : 'Show'}
          </button>
        </div>
        <Input
          id="password"
          name="password"
          type={showPassword ? 'text' : 'password'}
          autoComplete="current-password"
          placeholder="••••••••"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
      </div>

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : <LogIn />}
        {pending ? 'Signing in…' : 'Sign in'}
      </Button>
    </form>
  );
}
