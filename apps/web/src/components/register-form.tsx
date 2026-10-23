'use client';

import { Check, CircleAlert, Eye, EyeOff, Loader2, UserPlus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { client } from '@/lib/api';
import { parseApiFailure, toApiFailure, type ApiFailure } from '@/lib/api-error';
import { cn } from '@/lib/utils';

/** Mirrors the server-side password policy so people are not guessed at. */
const PASSWORD_RULES = [
  { label: 'At least 8 characters', test: (value: string) => value.length >= 8 },
  { label: 'Contains a letter', test: (value: string) => /[A-Za-z]/.test(value) },
  { label: 'Contains a number', test: (value: string) => /[0-9]/.test(value) },
];

export function RegisterForm() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<ApiFailure | null>(null);

  const passed = useMemo(() => PASSWORD_RULES.map((rule) => rule.test(password)), [password]);
  const passwordValid = passed.every(Boolean);
  const mismatch = confirmation.length > 0 && confirmation !== password;
  const canSubmit = name.trim().length >= 2 && passwordValid && confirmation === password;

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canSubmit) {
      setFailure({
        code: 'VALIDATION_ERROR',
        message: mismatch
          ? 'Passwords do not match.'
          : 'Choose a name and a password that meets every rule.',
      });
      return;
    }

    setPending(true);
    setFailure(null);

    try {
      const res = await client.api.auth.register.$post({
        json: { name: name.trim(), email, password },
      });

      if (!res.ok) {
        setFailure(parseApiFailure(await res.json(), 'Could not create your account.'));
        return;
      }

      router.replace('/');
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
        <Label htmlFor="name">Full name</Label>
        <Input
          id="name"
          name="name"
          autoComplete="name"
          placeholder="Ada Lovelace"
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
          minLength={2}
          maxLength={120}
        />
      </div>

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
          autoComplete="new-password"
          placeholder="••••••••"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />

        <ul className="mt-1 flex flex-col gap-1">
          {PASSWORD_RULES.map((rule, index) => (
            <li
              key={rule.label}
              className={cn(
                'flex items-center gap-1.5 text-xs transition-colors',
                passed[index] ? 'text-success' : 'text-muted-foreground',
              )}
            >
              <Check
                className={cn('size-3.5', passed[index] ? 'opacity-100' : 'opacity-25')}
                aria-hidden="true"
              />
              {rule.label}
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="confirm-password">Confirm password</Label>
        <Input
          id="confirm-password"
          name="confirmPassword"
          type={showPassword ? 'text' : 'password'}
          autoComplete="new-password"
          placeholder="••••••••"
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          required
          aria-invalid={mismatch || undefined}
        />
        {mismatch ? <p className="text-destructive text-xs">Passwords do not match.</p> : null}
      </div>

      <Button type="submit" className="w-full" disabled={pending || !canSubmit}>
        {pending ? <Loader2 className="animate-spin" /> : <UserPlus />}
        {pending ? 'Creating account…' : 'Create account'}
      </Button>
    </form>
  );
}
