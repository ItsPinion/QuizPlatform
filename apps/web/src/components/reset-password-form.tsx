'use client';

import { PASSWORD_RULES, passwordProgress } from '@/lib/auth-params';
import { Check, CircleCheck, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { PasswordField } from '@/components/auth/auth-fields';
import { Button } from '@/components/ui/button';
import { client } from '@/lib/api';
import { parseApiFailure } from '@/lib/api-error';
import { cn } from '@/lib/utils';
import { resetPasswordSchema } from '@quiz/shared/password';

/**
 * Choose a new password, with the token from the mail.
 *
 * The token is read from the URL by the page (server side) and handed down, so
 * this form never has to look at `window.location` and the page can explain a
 * missing link before any JavaScript runs.
 *
 * The checklist is the same one registration uses — a reset that would have been
 * refused at sign-up is not a password this platform accepts.
 */
export function ResetPasswordForm({ token, email }: { token: string; email: string | null }) {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({});
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const progress = passwordProgress(password);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const nextErrors: { password?: string; confirm?: string } = {};
    const firstUnmet = PASSWORD_RULES.find((rule) => !rule.test(password));

    if (firstUnmet) nextErrors.password = firstUnmet.requirement;
    if (password !== confirm) nextErrors.confirm = 'The two passwords do not match.';

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setPending(true);

    try {
      const res = await client.api.auth['reset-password'].$post({
        json: resetPasswordSchema.parse({ token, password }),
      });

      if (!res.ok) {
        setError(parseApiFailure(await res.json()).message);
        return;
      }

      setDone(true);

      // A moment to read the confirmation, then the sign-in screen with the
      // address prefilled — the next thing anybody wants to do is sign in.
      setTimeout(() => {
        router.push(email ? `/login?email=${encodeURIComponent(email)}` : '/login');
      }, 1600);
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    } finally {
      setPending(false);
    }
  }

  if (done) {
    return (
      <div className="space-y-4" role="status">
        <div className="border-success/30 bg-success/10 flex items-start gap-3 rounded-xl border px-4 py-3">
          <CircleCheck aria-hidden className="text-success mt-0.5 size-4 shrink-0" />
          <div className="space-y-1">
            <p className="text-[13.5px] font-medium">Password changed</p>
            <p className="text-muted-foreground text-[12.5px] leading-relaxed">
              Every other reset link for this account is now dead. Taking you to sign in…
            </p>
          </div>
        </div>

        <Link href="/login" className="text-foreground text-[13px] font-medium underline">
          Go to sign in now
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <PasswordField
        id="password"
        name="password"
        label="New password"
        autoComplete="new-password"
        placeholder="Choose a new password"
        value={password}
        error={errors.password}
        onChange={(event) => {
          setPassword(event.target.value);
          if (errors.password) setErrors((current) => ({ ...current, password: undefined }));
        }}
        rules={
          <div id="password-rules" className="mt-1 flex flex-col gap-1.5">
            <div className="flex items-center gap-2.5">
              <div
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={PASSWORD_RULES.length}
                aria-valuenow={progress.score}
                aria-label={`Password strength: ${progress.label}`}
                className="bg-secondary h-1.5 flex-1 overflow-hidden rounded-full"
              >
                <div
                  className={cn(
                    'h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none',
                    progress.complete
                      ? 'bg-success shadow-[0_0_12px_var(--success)]'
                      : 'bg-warning',
                  )}
                  style={{ width: `${(progress.score / PASSWORD_RULES.length) * 100}%` }}
                />
              </div>
              <span className="text-muted-foreground w-24 text-right text-[11.5px]">
                {progress.label}
              </span>
            </div>

            <ul className="flex flex-col gap-1.5">
              {PASSWORD_RULES.map((rule, index) => (
                <li
                  key={rule.label}
                  className={cn(
                    'flex items-center gap-2 text-[12.5px] transition-colors',
                    progress.passed[index] ? 'text-success' : 'text-muted-foreground',
                  )}
                >
                  <span
                    className={cn(
                      'grid size-4 shrink-0 place-items-center rounded-full border transition-colors',
                      progress.passed[index]
                        ? 'border-success/40 bg-success/15'
                        : 'border-border/70',
                    )}
                  >
                    <Check
                      aria-hidden
                      className={cn(
                        'size-2.5 transition-opacity',
                        progress.passed[index] ? 'opacity-100' : 'opacity-0',
                      )}
                    />
                  </span>
                  {rule.label}
                  <span className="sr-only">
                    {progress.passed[index] ? '— met' : '— not met yet'}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        }
        required
      />

      <PasswordField
        id="confirm-password"
        name="confirm-password"
        label="Repeat the new password"
        autoComplete="new-password"
        placeholder="Type it again"
        value={confirm}
        error={errors.confirm}
        onChange={(event) => {
          setConfirm(event.target.value);
          if (errors.confirm) setErrors((current) => ({ ...current, confirm: undefined }));
        }}
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
        {pending ? 'Saving…' : 'Set new password'}
      </Button>

      <p className="text-muted-foreground text-[12px] leading-relaxed">
        Lost the link?{' '}
        <Link href="/forgot-password" className="underline">
          Ask for a new one
        </Link>{' '}
        — links expire after an hour and work once.
      </p>
    </form>
  );
}
