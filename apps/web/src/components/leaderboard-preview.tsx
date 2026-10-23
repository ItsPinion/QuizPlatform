import type { LeaderboardEntryWire } from '@quiz/shared/leaderboard';

import { LeaderboardBoard } from '@/components/leaderboard-board';
import { LeaderboardPodium } from '@/components/leaderboard-podium';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const entry = (
  rank: number,
  name: string,
  average: number,
  best: number,
  quizzes: number,
  attempts: number,
  gap: number,
): LeaderboardEntryWire => ({
  rank,
  userId: `preview-${rank}`,
  name,
  averagePercentage: average,
  bestPercentage: best,
  attempts,
  quizzesCompleted: quizzes,
  passed: Math.max(0, attempts - 1),
  failed: 1,
  passRate: attempts > 1 ? Math.round(((attempts - 1) / attempts) * 10_000) / 100 : null,
  lastAttemptAt: '2026-03-14T10:00:00.000Z',
  isCurrentUser: rank === 2,
  gapToNext: gap,
});

const ENTRIES: LeaderboardEntryWire[] = [
  entry(1, 'Rahul Verma', 96, 100, 5, 6, 0),
  entry(2, 'Priya Nair', 93, 100, 4, 4, 3),
  entry(3, 'Amit Shah', 91, 95, 3, 4, 2),
  entry(4, 'Sana Iqbal', 84, 90, 3, 3, 7),
];

/** Landing-page preview of Day 12; the live screen is `/student/leaderboard`. */
export function LeaderboardPreview() {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {['Average', 'Best', 'Completed'].map((label, index) => (
          <span
            key={label}
            className={
              index === 0
                ? 'bg-primary text-primary-foreground rounded-md px-2.5 py-1 text-[11px] font-medium'
                : 'border-border/60 text-muted-foreground rounded-md border px-2.5 py-1 text-[11px]'
            }
          >
            {label}
          </span>
        ))}
        <span className="bg-border mx-1 h-4 w-px" aria-hidden="true" />
        {['All time', 'This month', 'This week'].map((label, index) => (
          <span
            key={label}
            className={
              index === 0
                ? 'bg-primary text-primary-foreground rounded-md px-2.5 py-1 text-[11px] font-medium'
                : 'border-border/60 text-muted-foreground rounded-md border px-2.5 py-1 text-[11px]'
            }
          >
            {label}
          </span>
        ))}
      </div>

      <LeaderboardPodium entries={ENTRIES} metric="average" />

      <Card>
        <CardHeader className="pb-1">
          <CardTitle className="text-[12.5px]">Overall · Average score</CardTitle>
        </CardHeader>
        <CardContent className="pt-1">
          <LeaderboardBoard entries={ENTRIES} metric="average" />
        </CardContent>
      </Card>
    </div>
  );
}
