import type { StudentQuiz } from '@quiz/shared/attempt';
import { describe, expect, it } from 'vitest';

import {
  attemptsLabel,
  bestScoreLabel,
  clockLabel,
  describeClock,
  describeStudentFilters,
  hasStudentFilters,
  optionLetter,
  parseStudentFilters,
  progressPercent,
  quizzesHref,
  startLabel,
  startState,
  timerClass,
  toStudentQuery,
} from './student-params';

const QUIZ: StudentQuiz = {
  id: 'quiz-1',
  title: 'CSS Essentials',
  slug: 'css-essentials',
  description: null,
  categoryId: 'cat-1',
  categoryName: 'CSS',
  difficulty: 'MEDIUM',
  durationMinutes: 15,
  passingScore: 60,
  maxAttempts: 3,
  questionCount: 4,
  totalMarks: 4,
  thumbnailUrl: null,
  attemptsUsed: 0,
  attemptsRemaining: 3,
  bestPercentage: null,
  lastAttemptAt: null,
  inProgressAttemptId: null,
};

describe('parseStudentFilters', () => {
  it('applies defaults', () => {
    expect(parseStudentFilters({})).toEqual({
      search: '',
      categoryId: '',
      difficulty: '',
      sort: 'newest',
      page: 1,
    });
  });

  it('keeps valid values and trims the search', () => {
    expect(
      parseStudentFilters({
        search: '  css ',
        difficulty: 'easy',
        sort: 'title',
        page: '2',
      }),
    ).toEqual({ search: 'css', categoryId: '', difficulty: 'EASY', sort: 'title', page: 2 });
  });

  it('falls back for hand-edited URLs', () => {
    const parsed = parseStudentFilters({
      difficulty: 'impossible',
      sort: 'popular',
      page: '-4',
      categoryId: 'nope',
    });

    expect(parsed.difficulty).toBe('');
    expect(parsed.sort).toBe('newest');
    expect(parsed.page).toBe(1);
    expect(parsed.categoryId).toBe('');
  });

  it('accepts a uuid category id and takes the first of a repeated param', () => {
    const id = '11111111-1111-4111-8111-111111111111';
    expect(parseStudentFilters({ categoryId: id }).categoryId).toBe(id);
    expect(parseStudentFilters({ search: ['a', 'b'] }).search).toBe('a');
  });
});

describe('toStudentQuery', () => {
  it('sends only the filters that are set', () => {
    expect(toStudentQuery(parseStudentFilters({}))).toEqual({
      sort: 'newest',
      page: '1',
      pageSize: '9',
    });

    expect(
      toStudentQuery(
        parseStudentFilters({ search: 'css', difficulty: 'HARD', sort: 'duration', page: '3' }),
      ),
    ).toEqual({
      sort: 'duration',
      page: '3',
      pageSize: '9',
      search: 'css',
      difficulty: 'HARD',
    });
  });
});

describe('quizzesHref', () => {
  it('round-trips through parseStudentFilters', () => {
    const href = quizzesHref({ search: 'react hooks', categoryId: 'forgiven', page: 2 });
    expect(href).toBe('/student/quizzes?search=react+hooks&page=2');

    const parsed = parseStudentFilters(
      Object.fromEntries(new URL(href, 'http://x').searchParams.entries()),
    );

    expect(parsed.search).toBe('react hooks');
    expect(parsed.page).toBe(2);
  });

  it('omits defaults', () => {
    expect(quizzesHref({})).toBe('/student/quizzes');
    expect(quizzesHref({ sort: 'newest', page: 1 })).toBe('/student/quizzes');
    expect(quizzesHref({ sort: 'title' })).toBe('/student/quizzes?sort=title');
  });
});

describe('filter summaries', () => {
  it('knows when filters are active', () => {
    expect(hasStudentFilters(parseStudentFilters({}))).toBe(false);
    expect(hasStudentFilters(parseStudentFilters({ search: 'css' }))).toBe(true);
    expect(hasStudentFilters(parseStudentFilters({ difficulty: 'EASY' }))).toBe(true);
  });

  it('describes what is applied', () => {
    const filters = parseStudentFilters({ search: 'css', difficulty: 'EASY' });
    expect(describeStudentFilters(filters, 'CSS')).toEqual(['“css”', 'CSS', 'easy']);
    expect(describeStudentFilters(parseStudentFilters({}))).toEqual([]);
  });
});

describe('start state', () => {
  it('offers to start a quiz with tries left', () => {
    expect(startState(QUIZ)).toBe('start');
    expect(startLabel('start')).toBe('Start quiz');
  });

  it('prefers resuming a live attempt', () => {
    const quiz = { ...QUIZ, inProgressAttemptId: 'attempt-1' };
    expect(startState(quiz)).toBe('resume');
    expect(startLabel('resume')).toBe('Resume attempt');
  });

  it('reports exhaustion and unavailability differently', () => {
    expect(startState({ ...QUIZ, attemptsUsed: 3, attemptsRemaining: 0 })).toBe('exhausted');
    expect(startLabel('exhausted')).toBe('No attempts left');
    expect(startState({ ...QUIZ, questionCount: 0 })).toBe('unavailable');
  });
});

describe('labels', () => {
  it('formats attempts and best score', () => {
    expect(attemptsLabel({ attemptsUsed: 1, maxAttempts: 3 })).toBe('1 of 3 attempts used');
    expect(attemptsLabel({ attemptsUsed: 1, maxAttempts: 1 })).toBe('1 of 1 attempt used');
    expect(bestScoreLabel({ bestPercentage: 72.5 })).toBe('73% best');
    expect(bestScoreLabel({ bestPercentage: null })).toBe('No score yet');
  });

  it('formats the clock and its screen-reader text', () => {
    expect(clockLabel(872)).toBe('14:32');
    expect(describeClock(872)).toBe('14 minutes 32 seconds left');
    expect(describeClock(61)).toBe('1 minute 1 second left');
    expect(describeClock(0)).toBe('Time is up');
  });

  it('letters options from A', () => {
    expect(optionLetter(0)).toBe('A');
    expect(optionLetter(3)).toBe('D');
  });
});

describe('progressPercent', () => {
  it('rounds and clamps', () => {
    expect(progressPercent(0, 4)).toBe(0);
    expect(progressPercent(1, 3)).toBe(33);
    expect(progressPercent(4, 4)).toBe(100);
    expect(progressPercent(5, 4)).toBe(100);
    expect(progressPercent(0, 0)).toBe(0);
  });
});

describe('timerClass', () => {
  it('escalates with the time left', () => {
    expect(timerClass(900, false)).toContain('border-border');
    expect(timerClass(240, false)).toContain('text-warning');
    expect(timerClass(30, false)).toContain('text-destructive');
    expect(timerClass(0, true)).toContain('text-destructive');
  });
});
