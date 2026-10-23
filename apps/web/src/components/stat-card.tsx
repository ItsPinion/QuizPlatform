import type { LucideIcon } from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

const TONES = {
  default: 'text-foreground',
  primary: 'text-primary',
  success: 'text-success',
  warning: 'text-warning',
  destructive: 'text-destructive',
} as const;

export type StatTone = keyof typeof TONES;

/**
 * One number, one label, one hint.
 *
 * The dashboard shows six of these, all fed from a single `/api/admin/stats`
 * payload — no card fetches on its own.
 */
export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'default',
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon: LucideIcon;
  tone?: StatTone;
}) {
  return (
    <Card className="gap-3 py-5">
      <CardContent className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground text-[11px] font-medium tracking-wider uppercase">
            {label}
          </span>
          <Icon className="text-muted-foreground/70 size-4" />
        </div>

        <p className={cn('text-3xl font-semibold tracking-tight tabular-nums', TONES[tone])}>
          {value}
        </p>

        {hint ? <p className="text-muted-foreground text-[12px] leading-snug">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}
