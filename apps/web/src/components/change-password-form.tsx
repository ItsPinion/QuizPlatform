'use client';

import { Check, CircleCheck, KeyRound, Loader2, ShieldCheck } from 'lucide-react';
import { useState } from 'react';

import { PasswordField } from '@/components/auth/auth-fields';
import { Button } from '@/components/ui/button';
import { client } from '@/lib/api';
import { parseApiFailure } from '@/lib/api-error';
import { PASSWORD_RULES, passwordProgress } from '@/lib/auth-params';
import { cn } from '@/lib/utils';
import { changePasswordSchema } from '@quiz/shared/password';

type Field = 'currentPassword' | 'newPassword' | 'confirm';

/**
 * Change the password of the account you are signed in as.
 *
 * The rules are shown before they are broken rather than after — the same
 * checklist the register form uses, from the same source — because a password
 * form that only says "too weak" after a submit is a guessing game.
 *
 * The current password is required. A session is a borrowed laptop as often as
 * it is its owner, so re-authenticating is what keeps a passer-by from changing
 * the password and keeping the account.
 *
 * On success the form does not pretend nothing happened: it says the password
 * changed, says how many outstanding reset links were killed by it, and offers a
 * way to clear the fields. Nothing is announced twice, and nothing is announced
 * in a region that is not already in the DOM (`role="status"` is rendered from
 * the start, so the message is read when it appears).
 */
export function ChangePasswordForm() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState<{ revokedLinks: number } | null>(null);

  const progress = passwordProgress(newPassword);

  function reset() {
    setCurrentPassword('');
    setNewPassword('');
    setConfirm('');
    setErrors({});
    setFormError(null);
    setDone(null);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const next: Partial<Record<Field, string>> = {};

    const parsed = changePasswordSchema.safeParse({ currentPassword, newPassword });
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (field === 'currentPassword') next.currentPassword ??= issue.message;
        if (field === 'newPassword') next.newPassword ??= issue.message;
      }
    }

    if (confirm !== newPassword) next.confirm = 'Both passwords must match';

    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setPending(true);

    try {
      const res = await client.api.auth['change-password'].$post({
        json: { currentPassword, newPassword },
      });

      if (!res.ok) {
        const failure = parseApiFailure(await res.json());

        // A wrong current password belongs on that field, not in a banner that
        // does not say which box to fix.
        if (failure.code === 'INVALID_PASSWORD') {
          setErrors({ currentPassword: failure.message });
          return;
        }

        setFormError(failure.message);
        return;
      }

      const body = await res.json();
      setCurrentPassword('');
      setNewPassword('');
      setConfirm('');
      setDone({ revokedLinks: body.revokedLinks });
    } catch {
      setFormError('Could not reach the server. Check your connection and try again.');
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <PasswordField
        id="current-password"
        name="currentPassword"
        label="Current password"
        autoComplete="current-password"
        placeholder="The password you signed in with"
        value={currentPassword}
        error={errors.currentPassword}
        disabled={pending}
        onChange={(event) => {
          setCurrentPassword(event.target.value);
          if (errors.currentPassword)
            setErrors((prev) => ({ ...prev, currentPassword: undefined }));
        }}
        required
      />

      <PasswordField
        id="new-password"
        name="newPassword"
        label="New password"
        autoComplete="new-password"
        placeholder="At least 8 characters"
        value={newPassword}
        error={errors.newPassword}
        disabled={pending}
        onChange={(event) => {
          setNewPassword(event.target.value);
          if (errors.newPassword) setErrors((prev) => ({ ...prev, newPassword: undefined }));
          if (errors.confirm) setErrors((prev) => ({ ...prev, confirm: undefined }));
        }}
        rules={
          <ul id="new-password-rules" className="mt-1 grid gap-1.5 sm:grid-cols-2">
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
                    progress.passed[index] ? 'border-success/40 bg-success/15' : 'border-border/70',
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
        }
        required
      />

      <PasswordField
        id="confirm-password"
        name="confirm"
        label="Repeat the new password"
        autoComplete="new-password"
        placeholder="Type it once more"
        value={confirm}
        error={errors.confirm}
        disabled={pending}
        onChange={(event) => {
          setConfirm(event.target.value);
          if (errors.confirm) setErrors((prev) => ({ ...prev, confirm: undefined }));
        }}
        required
      />

      <div role="status" aria-live="polite">
        {done ? (
          <div className="border-success/30 bg-success/10 flex items-start gap-3 rounded-xl border px-4 py-3">
            <CircleCheck aria-hidden className="text-success mt-0.5 size-4 shrink-0" />
            <div className="text-[13px] leading-relaxed">
              <p className="font-medium">Password changed.</p>
              <p className="text-muted-foreground">
                {done.revokedLinks > 0
                  ? `${done.revokedLinks} outstanding reset ${done.revokedLinks === 1 ? 'link was' : 'links were'} invalidated.`
                  : 'No outstanding reset links were open.'}
              </p>
            </div>
          </div>
        ) : null}

        {formError ? (
          <p className="text-destructive flex items-start gap-2 text-[13px]">
            <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0" />
            {formError}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? <Loader2 aria-hidden className="animate-spin" /> : <KeyRound aria-hidden />}
          {pending ? 'Changing…' : 'Change password'}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={reset} disabled={pending}>
          Clear
        </Button>
      </div>

      <p className="text-muted-foreground text-[11.5px] leading-relaxed">
        You stay signed in on this device. Every other device stays signed in too — sign out from
        the menu if you are on a shared machine.
      </p>
    </form>
  );
}
