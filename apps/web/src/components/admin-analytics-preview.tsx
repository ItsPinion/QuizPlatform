import type { AdminAnalytics, AnalyticsTimelinePoint } from '@quiz/shared/analytics';

import { AnalyticsTimeline } from '@/components/analytics-timeline';
import { PassFailChart } from '@/components/pass-fail-chart';
import { QuizPerformanceChart } from '@/components/quiz-performance-chart';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const SERIES: Array<[string, number, number]> = [
  ['2026-03-02', 2, 0],
  ['2026-03-03', 3, 1],
  ['2026-03-04', 1, 0],
  ['2026-03-05', 4, 0],
  ['2026-03-06', 2, 2],
  ['2026-03-07', 5, 0],
  ['2026-03-08', 3, 0],
  ['2026-03-09', 6, 1],
  ['2026-03-10', 4, 0],
  ['2026-03-11', 2, 0],
  ['2026-03-12', 7, 0],
  ['2026-03-13', 3, 1],
  ['2026-03-14', 5, 0],
  ['2026-03-15', 4, 2],
];

const POINTS: AnalyticsTimelinePoint[] = SERIES.map(([date, attempts, registrations]) => ({
  date,
  label: `${Number(date.slice(8))} Mar`,
  attempts,
  registrations,
  passed: Math.round(attempts * 0.65),
  failed: Math.round(attempts * 0.35),
  averagePercentage: 66 + attempts,
}));

const ATTEMPTS: AdminAnalytics['attempts'] = {
  total: 51,
  graded: 48,
  passed: 33,
  failed: 13,
  expired: 2,
  inProgress: 0,
  averagePercentage: 68.4,
  passRate: 71.7,
  averageTimeSeconds: 615,
  questionsAnswered: 246,
  accuracy: 64.1,
  inWindow: 51,
  inPreviousWindow: 34,
};

const QUIZZES: AdminAnalytics['quizPerformance'] = [
  {
    quizId: 'q1',
    title: 'JavaScript Fundamentals',
    slug: 'javascript-fundamentals',
    categoryName: 'JavaScript',
    status: 'PUBLISHED',
    attempts: 14,
    learners: 6,
    averagePercentage: 74.2,
    bestPercentage: 95,
    passRate: 78.6,
    lastAttemptAt: '2026-03-15T09:40:00.000Z',
  },
  {
    quizId: 'q2',
    title: 'SQL & Databases',
    slug: 'sql-databases',
    categoryName: 'Database',
    status: 'PUBLISHED',
    attempts: 11,
    learners: 5,
    averagePercentage: 57.3,
    bestPercentage: 80,
    passRate: 45.5,
    lastAttemptAt: '2026-03-14T16:10:00.000Z',
  },
  {
    quizId: 'q3',
    title: 'React Basics',
    slug: 'react-basics',
    categoryName: 'React',
    status: 'PUBLISHED',
    attempts: 8,
    learners: 4,
    averagePercentage: 69.8,
    bestPercentage: 90,
    passRate: 62.5,
    lastAttemptAt: '2026-03-13T11:05:00.000Z',
  },
];

const TILES = [
  ['Students', '3', '3 active · 2 joined this month'],
  ['Attempts', '51', '+50% more than the previous 30 days'],
  ['Pass rate', '71.7%', '33 passed · 13 failed · 2 expired'],
  ['Average score', '68.4%', '64.1% answer accuracy'],
] as const;

/** Landing-page preview of Day 11; the live screen is `/admin/analytics`. */
export function AdminAnalyticsPreview() {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        {TILES.map(([label, value, caption]) => (
          <Card key={label} className="py-3">
            <CardContent className="space-y-0.5 px-3">
              <p className="text-muted-foreground text-[9.5px] tracking-wider uppercase">{label}</p>
              <p className="text-xl font-semibold tabular-nums">{value}</p>
              <p className="text-muted-foreground truncate text-[10px]">{caption}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-3 lg:grid-cols-[1.5fr_1fr]">
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-[12.5px]">Attempts over time</CardTitle>
          </CardHeader>
          <CardContent className="pt-1">
            <AnalyticsTimeline points={POINTS} days={14} height={128} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-[12.5px]">Pass / fail</CardTitle>
          </CardHeader>
          <CardContent className="pt-2">
            <PassFailChart attempts={ATTEMPTS} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-1">
          <CardTitle className="text-[12.5px]">Most popular quizzes</CardTitle>
        </CardHeader>
        <CardContent className="pt-2">
          <QuizPerformanceChart rows={QUIZZES} limit={3} />
        </CardContent>
      </Card>
    </div>
  );
}
