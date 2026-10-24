'use client';

import { CircleCheck, Loader2, Mail } from 'lucide-react';
import { useState } from 'react';

import { TextField } from '@/components/auth/auth-fields';
import { Button } from '@/components/ui/button';
import { client } from '@/lib/api';
import { parseApiFailure } from '@/lib/api-error';
import { forgotPasswordSchema } from '@quiz/shared/password';

/**
 * Ask for a reset link.
 *
 * The form's success state is deliberately vague: "if that address has an
 * account, a link is on its way". Anything more specific — "no such user" — turns
 * this box into a way to test whether somebody has an account here, which is the
 * same reason the API answers identically either way.
 */
export function ForgotPasswordForm() {
  const [email, setEmail] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState<{ to: string; minutes: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const parsed = forgotPasswordSchema.safeParse({ email });
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message ?? 'Enter your email address.');
      return;
    }

    setFieldError(null);
    setPending(true);

    try {
      const res = await client.api.auth['forgot-password'].$post({ json: parsed.data });

      if (!res.ok) {
        setError(parseApiFailure(await res.json()).message);
        return;
      }

      const body = await res.json();
      setSent({ to: parsed.data.email, minutes: body.expiresInMinutes });
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    } finally {
      setPending(false);
    }
  }

  if (sent) {
    return (
      <div className="space-y-4" role="status">
        <div className="border-success/30 bg-success/10 flex items-start gap-3 rounded-xl border px-4 py-3">
          <CircleCheck aria-hidden className="text-success mt-0.5 size-4 shrink-0" />
          <div className="space-y-1">
            <p className="text-[13.5px] font-medium">Check your inbox</p>
            <p className="text-muted-foreground text-[12.5px] leading-relaxed">
              If an account exists for <span className="text-foreground font-mono">{sent.to}</span>,
              a reset link is on its way. It expires in {sent.minutes} minutes and works once.
            </p>
          </div>
        </div>

        <p className="text-muted-foreground text-[12px] leading-relaxed">
          No message after a minute? Check the spam folder, then try again. On a development machine
          the link is printed in the API log instead of being emailed.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <TextField
        id="email"
        label="Email address"
        icon={Mail}
        type="email"
        autoComplete="email"
        placeholder="you@example.com"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        error={fieldError}
        hint="The address you registered with."
        required
      />

      {error ? (
        <div
          role="alert"
          className="border-destructive/30 bg-destructive/10 text-destructive rounded-lg border px-3 py-2 text-[12.5px]"
        >
          {error}
        </div>
      ) : null}

      <Button type="submit" variant="cta" size="cta" className="w-full" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : null}
        {pending ? 'Sending…' : 'Send reset link'}
      </Button>
    </form>
  );
}
