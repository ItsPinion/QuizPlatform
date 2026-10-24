import type { LucideIcon } from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

const TONES = {
  default: 'text-white',
  primary: 'text-white',
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
    <Card className="group gap-3 py-5 transition-transform duration-300 hover:-translate-y-0.5 motion-reduce:hover:translate-y-0">
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <span className="cine-label text-[9px] text-gray-400">{label}</span>
          <span className="grid size-7 place-items-center rounded-full border border-white/10 bg-white/4 text-gray-400 transition-colors group-hover:border-white/25 group-hover:text-white">
            <Icon aria-hidden className="size-3.5" />
          </span>
        </div>

        <p
          className={cn(
            'font-display text-[2.1rem] leading-none font-light tracking-tight tabular-nums',
            TONES[tone],
          )}
        >
          {value}
        </p>

        {hint ? <p className="text-[11px] leading-snug font-light text-gray-400">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}
