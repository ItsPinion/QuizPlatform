import type { StudentDashboard } from '@quiz/shared/dashboard';
import { ActivityChart } from '@/components/activity-chart';
import { CategoryBreakdown } from '@/components/category-breakdown';
import { ScoreTrendChart } from '@/components/score-trend-chart';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const TREND: StudentDashboard['trend'] = [
  {
    attemptId: 't1',
    quizTitle: 'SQL Databases',
    percentage: 40,
    passed: false,
    completedAt: '2026-02-18T10:00:00.000Z',
  },
  {
    attemptId: 't2',
    quizTitle: 'Python Programming',
    percentage: 60,
    passed: true,
    completedAt: '2026-02-24T10:00:00.000Z',
  },
  {
    attemptId: 't3',
    quizTitle: 'JavaScript Fundamentals',
    percentage: 55,
    passed: false,
    completedAt: '2026-03-01T10:00:00.000Z',
  },
  {
    attemptId: 't4',
    quizTitle: 'React Basics',
    percentage: 75,
    passed: true,
    completedAt: '2026-03-05T10:00:00.000Z',
  },
  {
    attemptId: 't5',
    quizTitle: 'Node.js REST APIs',
    percentage: 70,
    passed: true,
    completedAt: '2026-03-09T10:00:00.000Z',
  },
  {
    attemptId: 't6',
    quizTitle: 'CSS Essentials',
    percentage: 86,
    passed: true,
    completedAt: '2026-03-12T10:00:00.000Z',
  },
];

const DAYS = [
  ['2026-03-01', 0],
  ['2026-03-02', 1],
  ['2026-03-03', 0],
  ['2026-03-04', 2],
  ['2026-03-05', 1],
  ['2026-03-06', 0],
  ['2026-03-07', 0],
  ['2026-03-08', 1],
  ['2026-03-09', 1],
  ['2026-03-10', 0],
  ['2026-03-11', 0],
  ['2026-03-12', 2],
  ['2026-03-13', 1],
  ['2026-03-14', 0],
] as const;

const ACTIVITY: StudentDashboard['activity'] = DAYS.map(([date, attempts]) => ({
  date,
  label: `${Number(date.slice(8))} Mar`,
  attempts,
  averagePercentage: attempts > 0 ? 72 : null,
}));

const CATEGORIES: StudentDashboard['categories'] = [
  {
    categoryId: 'c1',
    categoryName: 'JavaScript',
    attempts: 3,
    averagePercentage: 82,
    bestPercentage: 92,
    passed: 3,
    failed: 0,
  },
  {
    categoryId: 'c2',
    categoryName: 'React',
    attempts: 2,
    averagePercentage: 74,
    bestPercentage: 80,
    passed: 2,
    failed: 0,
  },
  {
    categoryId: 'c3',
    categoryName: 'Databases',
    attempts: 2,
    averagePercentage: 46,
    bestPercentage: 50,
    passed: 1,
    failed: 1,
  },
  {
    categoryId: 'c4',
    categoryName: 'Python',
    attempts: 1,
    averagePercentage: 40,
    bestPercentage: 40,
    passed: 0,
    failed: 1,
  },
];

const STATS = [
  ['Quizzes attempted', '4', 'of 8 published'],
  ['Passed', '6', 'of 8 graded'],
  ['Failed', '2', '75% pass rate'],
  ['Average score', '71.4%', '74% accuracy'],
  ['Highest score', '92%', 'low 40%'],
  ['Questions answered', '63', '46 correct'],
] as const;

/** Landing-page preview of Day 10; the live screen is `/student`. */
export function StudentDashboardPreview() {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
        {STATS.map(([label, value, caption]) => (
          <Card key={label} className="py-3">
            <CardContent className="space-y-0.5 px-3">
              <p className="text-muted-foreground text-[9.5px] tracking-wider uppercase">{label}</p>
              <p className="text-xl font-semibold tabular-nums">{value}</p>
              <p className="text-muted-foreground truncate text-[10px]">{caption}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader className="pb-1">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-[12.5px]">Score trend</CardTitle>
              <Badge variant="outline" className="text-[9.5px]">
                last 12 graded attempts
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-1">
            <ScoreTrendChart trend={TREND} passMark={60} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-[12.5px]">Activity · 14 days</CardTitle>
          </CardHeader>
          <CardContent className="pt-2">
            <ActivityChart days={ACTIVITY} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-1">
          <CardTitle className="text-[12.5px]">By category</CardTitle>
        </CardHeader>
        <CardContent className="pt-2">
          <div className="grid gap-x-6 sm:grid-cols-2">
            <CategoryBreakdown categories={CATEGORIES.slice(0, 2)} />
            <CategoryBreakdown categories={CATEGORIES.slice(2)} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
