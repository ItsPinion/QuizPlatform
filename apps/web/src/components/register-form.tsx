'use client';

import { Check, CircleAlert, Loader2, Mail, UserRound, UserPlus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useRef, useState } from 'react';

import { PasswordField, TextField } from '@/components/auth/auth-fields';
import { Button } from '@/components/ui/button';
import { client } from '@/lib/api';
import { parseApiFailure, toApiFailure, type ApiFailure } from '@/lib/api-error';
import { PASSWORD_RULES, passwordProgress } from '@/lib/auth-params';
import { cn } from '@/lib/utils';

/**
 * Create an account.
 *
 * The password rules are shown before they are broken, checked as the person
 * types, and announced — not left for the server to reveal after a round trip.
 * Every control is 56px, every message is next to its field, and the button is
 * never a disabled mystery: it is always pressable and validation explains
 * itself.
 */

interface FieldErrors {
  name?: string;
  email?: string;
  password?: string;
  confirmation?: string;
}

export function RegisterForm() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});

  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmationRef = useRef<HTMLInputElement>(null);

  const progress = useMemo(() => passwordProgress(password), [password]);
  const mismatch = confirmation.length > 0 && confirmation !== password;
  const ready = name.trim().length >= 2 && progress.complete && confirmation === password;

  function validate() {
    const found: FieldErrors = {};

    if (name.trim().length < 2) found.name = 'Enter your name — two characters or more.';

    if (!email.trim()) found.email = 'Enter your email address.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      found.email = 'That does not look like an email address.';
    }

    const firstUnmet = PASSWORD_RULES.find((rule) => !rule.test(password));
    if (firstUnmet) found.password = firstUnmet.requirement;

    if (password.length > 0 && confirmation !== password) {
      found.confirmation = 'Passwords do not match.';
    }

    setErrors(found);

    if (found.name) nameRef.current?.focus();
    else if (found.email) emailRef.current?.focus();
    else if (found.password) passwordRef.current?.focus();
    else if (found.confirmation) confirmationRef.current?.focus();

    return Object.keys(found).length === 0;
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFailure(null);

    if (!validate()) return;

    setPending(true);

    try {
      const res = await client.api.auth.register.$post({
        json: { name: name.trim(), email: email.trim(), password },
      });

      if (!res.ok) {
        setFailure(parseApiFailure(await res.json(), 'Could not create your account.'));

        return;
      }

      // Straight into the catalogue: a brand-new account has nothing to see on a
      // dashboard yet, and the empty state is not the point of signing up.
      router.replace('/student/quizzes');
      router.refresh();
    } catch (cause) {
      setFailure(toApiFailure(cause));
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      aria-labelledby="register-heading"
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

      <div className="reveal" style={{ '--reveal-delay': '90ms' } as React.CSSProperties}>
        <TextField
          ref={nameRef}
          id="name"
          name="name"
          label="Your name"
          autoComplete="name"
          placeholder="Ada Lovelace"
          icon={UserRound}
          error={errors.name}
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            if (errors.name) setErrors((current) => ({ ...current, name: undefined }));
          }}
          required
          minLength={2}
          maxLength={120}
        />
      </div>

      <div className="reveal" style={{ '--reveal-delay': '160ms' } as React.CSSProperties}>
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
          hint="This is how you sign in — no confirmation email is sent."
          error={errors.email}
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
            if (errors.email) setErrors((current) => ({ ...current, email: undefined }));
          }}
          required
        />
      </div>

      <div className="reveal" style={{ '--reveal-delay': '230ms' } as React.CSSProperties}>
        <PasswordField
          ref={passwordRef}
          id="password"
          name="password"
          label="Password"
          autoComplete="new-password"
          placeholder="Choose a password"
          value={password}
          error={errors.password}
          onChange={(event) => {
            setPassword(event.target.value);
            if (errors.password) setErrors((current) => ({ ...current, password: undefined }));
          }}
          rules={
            <div id="password-rules" aria-live="polite" className="mt-1 flex flex-col gap-2">
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
          minLength={8}
          maxLength={128}
        />
      </div>

      <div className="reveal" style={{ '--reveal-delay': '300ms' } as React.CSSProperties}>
        <PasswordField
          ref={confirmationRef}
          id="confirm-password"
          name="confirmPassword"
          label="Confirm password"
          autoComplete="new-password"
          placeholder="Type it again"
          value={confirmation}
          onChange={(event) => {
            setConfirmation(event.target.value);
            if (errors.confirmation) {
              setErrors((current) => ({ ...current, confirmation: undefined }));
            }
          }}
          error={errors.confirmation ?? (mismatch ? 'Passwords do not match.' : null)}
          required
        />
      </div>

      <Button
        type="submit"
        variant="cta"
        size="cta"
        className="reveal w-full"
        style={{ '--reveal-delay': '370ms' } as React.CSSProperties}
        disabled={pending}
        aria-busy={pending}
      >
        {pending ? (
          <>
            <Loader2 aria-hidden className="animate-spin" />
            Creating your account…
          </>
        ) : (
          <>
            <UserPlus aria-hidden />
            Create account
          </>
        )}
      </Button>

      <p className="text-muted-foreground text-center text-[13px] leading-relaxed">
        {ready
          ? 'You will be signed in straight away.'
          : 'Four fields, three password rules — then you are in.'}
      </p>
    </form>
  );
}
