import { Check, CircleDashed } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface Day {
  day: number;
  title: string;
  detail: string;
}

const weekOne: Day[] = [
  { day: 1, title: 'Project setup', detail: 'Monorepo, API, database schema, git, env config' },
  { day: 2, title: 'Authentication', detail: 'Register, login, logout, hashing, JWT cookies' },
  {
    day: 3,
    title: 'Role-based auth',
    detail: 'Guarded API namespaces + protected admin and student areas',
  },
  { day: 4, title: 'Admin dashboard', detail: 'Layout, statistics, user management' },
  { day: 5, title: 'Quiz management', detail: 'Create, edit, delete, publish / unpublish' },
  { day: 6, title: 'Categories & questions', detail: 'CRUD, options, correct answers' },
  { day: 7, title: 'Student quiz UI', detail: 'Listing, details, navigation, timer' },
];

/** Highest day that has landed in the repo — keep in sync with README + /api/meta. */
const SHIPPED_THROUGH_DAY = 8;

const weekTwo: Day[] = [
  { day: 8, title: 'Submission & scoring', detail: 'Server-side grading, expiry enforcement' },
  { day: 9, title: 'Results', detail: 'Result page, answer review, history' },
  { day: 10, title: 'Student dashboard', detail: 'Stats, performance charts' },
  { day: 11, title: 'Admin analytics', detail: 'Attempts, pass/fail, popular quizzes' },
  { day: 12, title: 'Leaderboard', detail: 'Overall and category rankings' },
  { day: 13, title: 'Testing & security', detail: 'Authz tests, validation, rate limits' },
  { day: 14, title: 'Deployment & docs', detail: 'Production DB, README, screenshots' },
];

function DayRow({ item }: { item: Day }) {
  const done = item.day <= SHIPPED_THROUGH_DAY;

  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors',
        done ? 'border-primary/35 bg-primary/8' : 'border-border/60 bg-card/30 hover:border-border',
      )}
    >
      <span
        className={cn(
          'mt-0.5 grid size-6 shrink-0 place-items-center rounded-md border text-[11px] font-semibold',
          done
            ? 'border-primary/40 bg-primary/20 text-primary'
            : 'border-border/70 bg-background/60 text-muted-foreground',
        )}
      >
        {done ? <Check className="size-3.5" /> : item.day}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'text-[13px] font-medium',
              done ? 'text-foreground' : 'text-foreground/85',
            )}
          >
            {item.title}
          </span>
          <span className="text-muted-foreground font-mono text-[10px]">D{item.day}</span>
        </div>
        <p className="text-muted-foreground mt-0.5 text-[11.5px] leading-relaxed">{item.detail}</p>
      </div>
      {done ? (
        <Badge variant="success" className="shrink-0">
          Done
        </Badge>
      ) : (
        <CircleDashed className="text-muted-foreground/50 mt-1 size-3.5 shrink-0" />
      )}
    </div>
  );
}

export function Roadmap() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-2.5">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-[13px] font-semibold tracking-tight">Week 1</h3>
          <span className="text-muted-foreground font-mono text-[10.5px]">
            {weekOne.filter((item) => item.day <= SHIPPED_THROUGH_DAY).length} / 7 shipped
          </span>
        </div>
        {weekOne.map((item) => (
          <DayRow key={item.day} item={item} />
        ))}
      </div>

      <div className="space-y-2.5">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-[13px] font-semibold tracking-tight">Week 2</h3>
          <span className="text-muted-foreground font-mono text-[10.5px]">
            {weekTwo.filter((item) => item.day <= SHIPPED_THROUGH_DAY).length} / 7 shipped
          </span>
        </div>
        {weekTwo.map((item) => (
          <DayRow key={item.day} item={item} />
        ))}
      </div>
    </div>
  );
}
