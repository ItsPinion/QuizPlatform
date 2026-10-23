'use client';

import { CircleAlert, Eye, EyeOff, type LucideIcon } from 'lucide-react';
import { useId, useState } from 'react';

import { cn } from '@/lib/utils';

/**
 * The two controls the auth screens are built from.
 *
 * Both are deliberately large — 56px tall, 16px text — because a sign-in form is
 * the one screen every visitor has to get through, on whatever device they own.
 * Both are real `<input>`/`<label>` pairs with a stable id, so password managers,
 * autofill, screen readers and the browser's own validation all work without a
 * polyfill:
 *
 *   - the label is always visible (never a placeholder standing in for one);
 *   - `aria-describedby` carries the hint and the error, so neither is decoration;
 *   - `aria-invalid` is set only when something is actually wrong;
 *   - the reveal button is `aria-pressed` and 44px, not a 14px eye icon.
 */

const FIELD_BASE =
  'border-input bg-background/70 h-14 w-full rounded-xl border text-base transition-colors outline-none ' +
  'placeholder:text-muted-foreground/60 ' +
  'focus-visible:border-primary/70 focus-visible:ring-ring/45 focus-visible:ring-[3px] ' +
  'aria-invalid:border-destructive/70 aria-invalid:ring-destructive/25 aria-invalid:ring-[3px] ' +
  'disabled:pointer-events-none disabled:opacity-60';

function FieldChrome({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-[0.95rem] leading-none font-medium">
        {label}
      </label>
      {children}
      {hint && !error ? (
        <p id={`${id}-hint`} className="text-muted-foreground text-[13px] leading-relaxed">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p
          id={`${id}-error`}
          className="text-destructive flex items-start gap-1.5 text-[13px] leading-relaxed"
        >
          <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  );
}

function describedBy(id: string, hint?: string, error?: string | null) {
  if (error) return `${id}-error`;

  return hint ? `${id}-hint` : undefined;
}

export interface TextFieldProps extends Omit<React.ComponentProps<'input'>, 'id'> {
  id: string;
  label: string;
  icon: LucideIcon;
  hint?: string;
  error?: string | null;
}

export function TextField({
  id,
  label,
  icon: Icon,
  hint,
  error,
  className,
  ...props
}: TextFieldProps) {
  return (
    <FieldChrome id={id} label={label} hint={hint} error={error}>
      <div className="relative">
        <Icon
          aria-hidden
          className="text-muted-foreground pointer-events-none absolute top-1/2 left-4 size-[18px] -translate-y-1/2"
        />
        <input
          id={id}
          aria-describedby={describedBy(id, hint, error)}
          aria-invalid={error ? true : undefined}
          className={cn(FIELD_BASE, 'pr-4 pl-12', className)}
          {...props}
        />
      </div>
    </FieldChrome>
  );
}

export interface PasswordFieldProps extends Omit<React.ComponentProps<'input'>, 'id' | 'type'> {
  id: string;
  label: string;
  hint?: string;
  error?: string | null;
  /** Renders the checklist underneath and connects it with `aria-describedby`. */
  rules?: React.ReactNode;
}

export function PasswordField({
  id,
  label,
  hint,
  error,
  rules,
  className,
  onKeyDown,
  onKeyUp,
  ...props
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const capsId = `${id}-caps`;

  const described = [
    describedBy(id, hint, error),
    rules ? `${id}-rules` : null,
    capsLock ? capsId : null,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <FieldChrome id={id} label={label} hint={hint} error={error}>
      <div className="relative">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          aria-describedby={described || undefined}
          aria-invalid={error ? true : undefined}
          className={cn(FIELD_BASE, 'pr-16 pl-4', className)}
          onKeyDown={(event) => {
            onKeyDown?.(event);

            if (event.getModifierState) setCapsLock(event.getModifierState('CapsLock'));
          }}
          onKeyUp={(event) => {
            onKeyUp?.(event);

            if (event.getModifierState) setCapsLock(event.getModifierState('CapsLock'));
          }}
          {...props}
        />
        <button
          type="button"
          onClick={() => setVisible((value) => !value)}
          aria-pressed={visible}
          aria-label={visible ? 'Hide password' : 'Show password'}
          className="text-muted-foreground hover:text-foreground hover:bg-accent focus-visible:ring-ring/60 absolute top-1/2 right-1.5 grid size-11 -translate-y-1/2 place-items-center rounded-lg transition-colors outline-none focus-visible:ring-[3px]"
        >
          {visible ? (
            <EyeOff aria-hidden className="size-[18px]" />
          ) : (
            <Eye aria-hidden className="size-[18px]" />
          )}
        </button>
      </div>

      {capsLock ? (
        <p id={capsId} className="text-warning flex items-center gap-1.5 text-[13px]">
          <CircleAlert aria-hidden className="size-3.5" />
          Caps Lock is on.
        </p>
      ) : null}

      {rules}
    </FieldChrome>
  );
}

/** A single shared id for the "forgot password" style notes, so pages stay consistent. */
export function useFieldId(prefix: string) {
  const base = useId();

  return `${prefix}-${base.replace(/:/g, '')}`;
}
