'use client';

import type { LandingDemoAccount } from '@quiz/shared/landing';
import {
  ArrowRight,
  CircleAlert,
  Loader2,
  LockKeyhole,
  Mail,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';

import { PasswordField, TextField } from '@/components/auth/auth-fields';
import { Button } from '@/components/ui/button';
import { client } from '@/lib/api';
import { parseApiFailure, toApiFailure, type ApiFailure } from '@/lib/api-error';
import { demoFillAnnouncement, homeFor, roleLabel } from '@/lib/auth-params';
import { cn } from '@/lib/utils';

/**
 * Sign in.
 *
 * Three things a sign-in form owes people, in order of how often they matter:
 *
 *   1. It works with their password manager. Real inputs, real labels,
 *      `autocomplete="current-password"`, no custom widgets.
 *   2. It tells them what went wrong, next to the field that went wrong, and
 *      moves the focus there.
 *   3. It never makes them type a demo password from a screenshot. The accounts
 *      come from `/api/landing` — the ones that actually exist in this
 *      deployment — and a button fills the form. It does not submit for them:
 *      a sign-in that happens without a click is a sign-in you did not agree to.
 */

interface LoginFormProps {
  next?: string;
  demo?: LandingDemoAccount[];
}

export function LoginForm({ next = '/', demo = [] }: LoginFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [announcement, setAnnouncement] = useState('');
  const [filled, setFilled] = useState(false);

  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const submitRef = useRef<HTMLButtonElement>(null);

  const rejected = failure?.code === 'UNAUTHORIZED' || failure?.code === 'INVALID_CREDENTIALS';

  function validate() {
    const found: { email?: string; password?: string } = {};

    if (!email.trim()) found.email = 'Enter your email address.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      found.email = 'That does not look like an email address.';
    }

    if (!password) found.password = 'Enter your password.';

    setErrors(found);

    if (found.email) emailRef.current?.focus();
    else if (found.password) passwordRef.current?.focus();

    return Object.keys(found).length === 0;
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFailure(null);

    if (!validate()) return;

    setPending(true);

    try {
      const res = await client.api.auth.login.$post({ json: { email: email.trim(), password } });

      if (!res.ok) {
        const detail = parseApiFailure(await res.json(), 'Email or password is incorrect.');
        setFailure(detail);
        setAnnouncement(detail.message);

        if (detail.code === 'UNAUTHORIZED' || detail.code === 'INVALID_CREDENTIALS') {
          passwordRef.current?.focus();
          passwordRef.current?.select();
        }

        return;
      }

      // Where they were going, or where their role lives. Refresh so server
      // components re-render with the new session cookie.
      const session = await res.json();
      const destination = next === '/' ? homeFor(session.user.role) : next;

      router.replace(destination);
      router.refresh();
    } catch (cause) {
      const detail = toApiFailure(cause);
      setFailure(detail);
      setAnnouncement(detail.message);
    } finally {
      setPending(false);
    }
  }

  function fillDemo(account: LandingDemoAccount) {
    setEmail(account.email);
    setPassword(account.password);
    setErrors({});
    setFailure(null);
    setFilled(true);
    setAnnouncement(demoFillAnnouncement(account.email));
    submitRef.current?.focus();
  }

  return (
    <form
      onSubmit={onSubmit}
      aria-labelledby="sign-in-heading"
      className="flex flex-col gap-6"
      noValidate
    >
      <div aria-live="assertive" aria-atomic="true">
        {failure ? (
          <div
            role="alert"
            className="border-destructive/40 bg-destructive/10 text-destructive flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm"
          >
            <CircleAlert aria-hidden className="mt-0.5 size-[18px] shrink-0" />
            <span className="leading-relaxed">{failure.message}</span>
          </div>
        ) : null}
      </div>

      <div className="reveal" style={{ '--reveal-delay': '120ms' } as React.CSSProperties}>
        <TextField
          ref={emailRef}
          id="email"
          name="email"
          label="Email address"
          type="email"
          inputMode="email"
          autoComplete="email"
          spellCheck={false}
          autoCapitalize="none"
          placeholder="you@quiz.dev"
          icon={Mail}
          hint="The address you registered with."
          error={errors.email}
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
            if (errors.email) setErrors((current) => ({ ...current, email: undefined }));
          }}
          required
        />
      </div>

      <div className="reveal" style={{ '--reveal-delay': '200ms' } as React.CSSProperties}>
        <PasswordField
          ref={passwordRef}
          id="password"
          name="password"
          label="Password"
          autoComplete="current-password"
          placeholder="Your password"
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
            if (errors.password) setErrors((current) => ({ ...current, password: undefined }));
          }}
          error={
            errors.password ?? (rejected ? 'Check the email and password and try again.' : null)
          }
          required
        />
      </div>

      <Button
        ref={submitRef}
        type="submit"
        variant="cta"
        size="cta"
        className="reveal w-full"
        style={{ '--reveal-delay': '280ms' } as React.CSSProperties}
        disabled={pending}
        aria-busy={pending}
      >
        {pending ? (
          <>
            <Loader2 aria-hidden className="animate-spin" />
            Signing in…
          </>
        ) : (
          <>
            Sign in
            <ArrowRight aria-hidden />
          </>
        )}
      </Button>

      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>

      {demo.length > 0 ? (
        <section aria-labelledby="demo-accounts-heading" className="border-t border-white/10 pt-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="demo-accounts-heading" className="text-[13px] font-medium">
              Or try a demo account
            </h2>
            <p className="text-muted-foreground text-[11.5px]">
              {filled ? 'Filled in — press Sign in.' : 'Fills the form, does not submit it.'}
            </p>
          </div>

          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {demo.map((account) => {
              const Icon = account.role === 'ADMIN' ? ShieldCheck : UserRound;

              return (
                <li key={account.email}>
                  <button
                    type="button"
                    onClick={() => fillDemo(account)}
                    className={cn(
                      'border-white/10 bg-white/[0.03] backdrop-blur-md hover:border-white/30 hover:bg-white/[0.06]',
                      'focus-visible:ring-ring/60 group flex min-h-14 w-full items-center gap-3 rounded-xl border px-3.5 py-2.5 text-left transition-colors outline-none focus-visible:ring-[3px]',
                    )}
                  >
                    <span
                      className={cn(
                        'grid size-9 shrink-0 place-items-center rounded-lg',
                        account.role === 'ADMIN'
                          ? 'bg-warning/15 text-warning'
                          : 'bg-primary/15 text-primary',
                      )}
                    >
                      <Icon aria-hidden className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-medium">
                        {roleLabel(account.role)}
                      </span>
                      <span className="text-muted-foreground block truncate font-mono text-[11px]">
                        {account.email}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </form>
  );
}
