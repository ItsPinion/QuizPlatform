import { Check, Clock, Lock, X } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

/**
 * Product shots.
 *
 * Small, deliberately literal reproductions of three real screens — an attempt in
 * progress, a finished result, and the admin console. They carry no explanatory
 * copy: the surrounding section says what the screen means, and the screen itself
 * only has to look like the thing it is.
 */

const OPTIONS = [
  { text: 'var', state: 'idle' },
  { text: 'let', state: 'idle' },
  { text: 'const', state: 'selected' },
  { text: 'static', state: 'idle' },
] as const;

export function AttemptShot() {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[12.5px] font-medium">JavaScript Fundamentals</p>
          <p className="text-muted-foreground text-[10.5px]">Question 5 of 8</p>
        </div>
        <Badge variant="outline" className="gap-1.5 font-mono text-[10px] tabular-nums">
          <Clock className="size-3" />
          14:32
        </Badge>
      </div>

      <div className="bg-muted h-1 overflow-hidden rounded-full">
        <div className="bg-primary h-full w-[62%] rounded-full" />
      </div>

      <p className="text-[12.5px] leading-relaxed">
        Which keyword declares a binding that cannot be reassigned?
      </p>

      <ul className="grid gap-1.5 sm:grid-cols-2">
        {OPTIONS.map((option) => (
          <li
            key={option.text}
            className={cn(
              'flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-[11.5px]',
              option.state === 'selected'
                ? 'border-primary/60 bg-primary/10 text-foreground'
                : 'border-border/70 bg-background/40 text-muted-foreground',
            )}
          >
            <span
              className={cn(
                'grid size-3.5 shrink-0 place-items-center rounded-full border',
                option.state === 'selected' ? 'border-primary bg-primary' : 'border-border',
              )}
              aria-hidden
            >
              {option.state === 'selected' ? <Check className="size-2.5 text-white" /> : null}
            </span>
            <span className="font-mono">{option.text}</span>
          </li>
        ))}
      </ul>

      <div className="text-muted-foreground flex items-center justify-between gap-2 text-[10px]">
        <span className="text-success inline-flex items-center gap-1">
          <span className="bg-success size-1 rounded-full" />
          saved
        </span>
        <span className="flex items-center gap-1.5">
          <Lock className="size-2.5" /> key not in this payload
        </span>
      </div>
    </div>
  );
}

const VERDICTS = [
  { index: 1, ok: true },
  { index: 2, ok: true },
  { index: 3, ok: false },
  { index: 4, ok: true },
  { index: 5, ok: true },
  { index: 6, ok: 'blank' },
] as const;

export function ResultShot() {
  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-muted-foreground font-mono text-[10px] tracking-wide uppercase">
            Result
          </p>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-semibold tracking-tight tabular-nums">86</span>
            <span className="text-muted-foreground text-sm">%</span>
          </div>
          <p className="text-muted-foreground mt-0.5 text-[10.5px]">13 of 15 marks · 12m 04s</p>
        </div>
        <Badge variant="success" className="text-[10px]">
          PASSED
        </Badge>
      </div>

      <div className="flex gap-1" aria-hidden>
        {VERDICTS.map((verdict) => (
          <span
            key={verdict.index}
            className={cn(
              'grid h-6 flex-1 place-items-center rounded-sm border text-[9px]',
              verdict.ok === true && 'border-success/40 bg-success/15 text-success',
              verdict.ok === false && 'border-destructive/40 bg-destructive/15 text-destructive',
              verdict.ok === 'blank' && 'border-border/70 bg-muted/40 text-muted-foreground',
            )}
          >
            {verdict.ok === true ? (
              <Check className="size-2.5" />
            ) : verdict.ok === false ? (
              <X className="size-2.5" />
            ) : (
              '–'
            )}
          </span>
        ))}
      </div>

      <div className="border-border/60 bg-background/40 space-y-1 rounded-md border p-2 text-[10.5px]">
        <p className="text-foreground font-medium">Q3 · Which array method mutates?</p>
        <p className="text-muted-foreground">
          Your answer <span className="text-destructive font-mono">map</span> · correct{' '}
          <span className="text-success font-mono">splice</span>
        </p>
      </div>
    </div>
  );
}

const BARS = [38, 62, 45, 80, 55, 90, 70];

const CONSOLE_ROWS = [
  { title: 'CSS Layout Basics', status: 'PUBLISHED', attempts: 9 },
  { title: 'Python Data Types', status: 'DRAFT', attempts: 0 },
  { title: 'Network Protocols', status: 'PUBLISHED', attempts: 7 },
] as const;

export function ConsoleShot() {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-1.5">
        {[
          ['4', 'users'],
          ['10', 'quizzes'],
          ['16', 'attempts'],
        ].map(([value, label]) => (
          <div
            key={label}
            className="border-border/60 bg-background/40 rounded-md border px-2 py-1.5"
          >
            <div className="text-base font-semibold tabular-nums">{value}</div>
            <div className="text-muted-foreground text-[9.5px]">{label}</div>
          </div>
        ))}
      </div>

      <div className="border-border/60 bg-background/40 rounded-md border p-2">
        <div className="text-muted-foreground mb-1.5 flex justify-between text-[9.5px]">
          <span>Attempts · 14 days</span>
          <span className="tabular-nums">16</span>
        </div>
        <div className="flex h-10 items-end gap-1" aria-hidden>
          {BARS.map((height, index) => (
            <span
              key={index}
              style={{ height: `${height}%` }}
              className="bg-primary/60 flex-1 rounded-sm"
            />
          ))}
        </div>
      </div>

      <ul className="divide-border/50 divide-y">
        {CONSOLE_ROWS.map((row) => (
          <li key={row.title} className="flex items-center justify-between gap-2 py-1.5">
            <span className="truncate text-[11px]">{row.title}</span>
            <span className="flex shrink-0 items-center gap-1.5">
              <span className="text-muted-foreground font-mono text-[9.5px] tabular-nums">
                {row.attempts}
              </span>
              <Badge
                variant={row.status === 'PUBLISHED' ? 'success' : 'secondary'}
                className="text-[8.5px]"
              >
                {row.status}
              </Badge>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const CATALOGUE = [
  {
    title: 'JavaScript Fundamentals',
    category: 'JavaScript',
    level: 'EASY',
    minutes: 15,
    best: '86%',
    state: 'In progress',
  },
  {
    title: 'CSS Layout Basics',
    category: 'CSS',
    level: 'MEDIUM',
    minutes: 20,
    best: '—',
    state: 'Not started',
  },
  {
    title: 'Network Protocols',
    category: 'Networks',
    level: 'HARD',
    minutes: 25,
    best: '71%',
    state: '2 of 2 used',
  },
] as const;

export function CatalogueShot() {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] font-medium">Catalogue</span>
        <span className="text-muted-foreground font-mono text-[9.5px]">8 published</span>
      </div>

      <ul className="space-y-1.5">
        {CATALOGUE.map((quiz) => (
          <li
            key={quiz.title}
            className="border-border/60 bg-background/40 rounded-md border px-2.5 py-2"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-[11.5px] font-medium">{quiz.title}</span>
              <span
                className={cn(
                  'shrink-0 font-mono text-[9px]',
                  quiz.state === 'In progress'
                    ? 'text-warning'
                    : quiz.state === 'Not started'
                      ? 'text-muted-foreground'
                      : 'text-muted-foreground/60',
                )}
              >
                {quiz.state}
              </span>
            </div>
            <div className="text-muted-foreground mt-1 flex items-center gap-2 text-[9.5px]">
              <span>{quiz.category}</span>
              <span className="bg-border size-0.5 rounded-full" />
              <span>{quiz.level}</span>
              <span className="bg-border size-0.5 rounded-full" />
              <span className="tabular-nums">{quiz.minutes} min</span>
              <span className="ml-auto tabular-nums">best {quiz.best}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
