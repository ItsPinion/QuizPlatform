import { describe, expect, it } from 'vitest';

import {
  durationLabel,
  uptimeLabel,
  durationRangeLabel,
  hasSampleContent,
  headlineNumbers,
  landingPayloadSchema,
  passingRangeLabel,
  percentLabel,
  questionRangeLabel,
  rangeLabel,
  SEED_DEMO_ACCOUNTS,
  type LandingPayload,
} from './landing';

/**
 * The landing payload is the only place content leaves the API without a session,
 * so these tests are as much about what *cannot* be represented as about the
 * formatting helpers.
 */

const shape = {
  minDurationMinutes: 15,
  maxDurationMinutes: 30,
  averageDurationMinutes: 20.5,
  minPassingScore: 50,
  maxPassingScore: 70,
  minQuestions: 5,
  maxQuestions: 8,
  totalQuestions: 47,
};

function payload(overrides: Partial<LandingPayload> = {}): LandingPayload {
  return {
    generatedAt: '2026-01-01T00:00:00.000Z',
    service: {
      name: 'quiz-api',
      version: '0.1.0',
      runtime: 'node v22.0.0',
      nodeEnv: 'test',
      uptimeSeconds: 12,
    },
    database: { target: 'file', urlHint: 'test.db', connected: true, latencyMs: 1.5 },
    counts: {
      users: 4,
      categories: 10,
      quizzes: 10,
      publishedQuizzes: 8,
      questions: 47,
      attempts: 16,
      gradedAttempts: 14,
      passedAttempts: 7,
      passRate: 50,
      averagePercentage: 61.25,
    },
    shape,
    categories: [{ name: 'HTML', quizzes: 2, published: 2 }],
    quizzes: [
      {
        title: 'HTML Fundamentals',
        category: 'HTML',
        difficulty: 'EASY',
        durationMinutes: 15,
        passingScore: 60,
        maxAttempts: 3,
        questions: 5,
      },
    ],
    formats: [
      { type: 'MCQ', questions: 44 },
      { type: 'MULTI', questions: 1 },
      { type: 'TRUE_FALSE', questions: 1 },
      { type: 'FILL_BLANK', questions: 1 },
    ],
    sampleQuestion: {
      quizTitle: 'HTML Fundamentals',
      category: 'HTML',
      difficulty: 'EASY',
      durationMinutes: 15,
      index: 1,
      total: 5,
      text: 'What does HTML stand for?',
      marks: 1,
      options: ['Hyper Tool', 'HyperText Markup Language'],
    },
    sampleResult: {
      quizTitle: 'HTML Fundamentals',
      category: 'HTML',
      percentage: 80,
      marks: 4,
      totalMarks: 5,
      passed: true,
      passingScore: 60,
      correct: 4,
      incorrect: 1,
      unanswered: 0,
      timeTakenSeconds: 724,
    },
    demo: { enabled: true, accounts: [] },
    unavailableReason: null,
    ...overrides,
  };
}

describe('range labels', () => {
  it('collapses a single value and expands a real range', () => {
    expect(rangeLabel(15, 15)).toBe('15');
    expect(rangeLabel(15, 30)).toBe('15–30');
    expect(rangeLabel(15, 30, ' min')).toBe('15–30 min');
  });

  it('reads the three published-catalogue ranges', () => {
    expect(durationRangeLabel(shape)).toBe('15–30 min');
    expect(passingRangeLabel(shape)).toBe('50–70%');
    expect(questionRangeLabel(shape)).toBe('5–8');
  });

  it('degrades to a single value when every quiz matches', () => {
    const flat = { ...shape, minDurationMinutes: 20, maxDurationMinutes: 20 };

    expect(durationRangeLabel(flat)).toBe('20 min');
  });
});

describe('percent and duration labels', () => {
  it('keeps at most one decimal and drops a trailing zero', () => {
    expect(percentLabel(50)).toBe('50%');
    expect(percentLabel(53.333)).toBe('53.3%');
    expect(percentLabel(100)).toBe('100%');
    expect(percentLabel(0)).toBe('0%');
  });

  it('formats uptime at three scales', () => {
    expect(uptimeLabel(9)).toBe('9s');
    expect(uptimeLabel(59)).toBe('59s');
    expect(uptimeLabel(60)).toBe('1m');
    expect(uptimeLabel(3_600)).toBe('1h');
    expect(uptimeLabel(11_520)).toBe('3h 12m');
    expect(uptimeLabel(-1)).toBe('0s');
  });

  it('formats an elapsed time with padded seconds', () => {
    expect(durationLabel(724)).toBe('12m 04s');
    expect(durationLabel(9)).toBe('0m 09s');
    expect(durationLabel(-5)).toBe('0m 00s');
  });
});

describe('sample content', () => {
  it('requires both a question and a published quiz', () => {
    expect(hasSampleContent(payload())).toBe(true);

    expect(hasSampleContent(payload({ sampleQuestion: null }))).toBe(false);

    expect(
      hasSampleContent(payload({ counts: { ...payload().counts, publishedQuizzes: 0 } })),
    ).toBe(false);
  });

  it('derives the headline numbers from the counts', () => {
    expect(headlineNumbers(payload()).map((item) => item.value)).toEqual(['10', '47', '8', '14']);
  });
});

describe('the payload contract', () => {
  it('accepts a well-formed payload', () => {
    expect(landingPayloadSchema.parse(payload())).toBeTruthy();
  });

  it('lists the question formats, and refuses one it does not know', () => {
    expect(() => landingPayloadSchema.parse(payload())).not.toThrow();

    const { formats: _omitted, ...withoutFormats } = payload();
    expect(landingPayloadSchema.safeParse(withoutFormats).success).toBe(false);

    const unknownFormat = {
      ...payload(),
      formats: [{ type: 'ESSAY', questions: 0 }],
    };
    expect(landingPayloadSchema.safeParse(unknownFormat).success).toBe(false);
  });

  it('carries option text and nothing else about the answer', () => {
    const parsed = landingPayloadSchema.parse(payload());

    expect(Object.keys(parsed.sampleQuestion!).sort()).toEqual([
      'category',
      'difficulty',
      'durationMinutes',
      'index',
      'marks',
      'options',
      'quizTitle',
      'text',
      'total',
    ]);

    // Options are strings: there is no shape here that could hold a flag.
    expect(parsed.sampleQuestion!.options.every((option) => typeof option === 'string')).toBe(true);

    const serialised = JSON.stringify(parsed);

    for (const forbidden of ['isCorrect', 'explanation', 'correctOption', 'answerKey']) {
      expect(serialised).not.toContain(forbidden);
    }
  });

  it('accepts a fractional score, because negative marking produces one', () => {
    // One right and five wrong at 0.25 each is 0.75 — a real value the seed used
    // to hand this schema, which said `int` and therefore emptied the whole
    // payload on the landing page.
    const parsed = landingPayloadSchema.parse(
      payload({
        sampleResult: {
          quizTitle: 'JavaScript Fundamentals',
          category: 'JavaScript',
          percentage: 10.71,
          marks: 0.75,
          totalMarks: 7,
          passed: false,
          passingScore: 60,
          correct: 1,
          incorrect: 5,
          unanswered: 0,
          timeTakenSeconds: 300,
        },
      }),
    );

    expect(parsed.sampleResult?.marks).toBe(0.75);
    expect(parsed.sampleResult?.totalMarks).toBe(7);
  });

  it('carries marks but no student on the sample result', () => {
    const parsed = landingPayloadSchema.parse(payload());

    expect(Object.keys(parsed.sampleResult!).sort()).toEqual([
      'category',
      'correct',
      'incorrect',
      'marks',
      'passed',
      'passingScore',
      'percentage',
      'quizTitle',
      'timeTakenSeconds',
      'totalMarks',
      'unanswered',
    ]);

    // Outside the `demo` block, nothing in the payload is an address.
    const withoutDemo = JSON.stringify({ ...parsed, demo: null });

    expect(withoutDemo).not.toContain('@');
    expect(withoutDemo).not.toContain('userId');
  });

  it('rejects a question with fewer than two options', () => {
    const broken = payload();

    broken.sampleQuestion = { ...broken.sampleQuestion!, options: ['only one'] };

    expect(() => landingPayloadSchema.parse(broken)).toThrow();
  });
});

describe('seed demo accounts', () => {
  it('describes the four accounts the seed creates', () => {
    expect(SEED_DEMO_ACCOUNTS).toHaveLength(4);
    expect(SEED_DEMO_ACCOUNTS.filter((account) => account.role === 'ADMIN')).toHaveLength(1);
    expect(new Set(SEED_DEMO_ACCOUNTS.map((account) => account.email)).size).toBe(4);
  });

  it('gives every student the same password and the admin its own', () => {
    const admin = SEED_DEMO_ACCOUNTS.find((account) => account.role === 'ADMIN');
    const students = SEED_DEMO_ACCOUNTS.filter((account) => account.role === 'STUDENT');

    expect(admin?.password).toBe('Admin12345');
    expect(new Set(students.map((account) => account.password))).toEqual(new Set(['Password123']));
  });
});
