import { describe, expect, it } from 'vitest';

import {
  canDelete,
  canPublish,
  createQuizSchema,
  quizListQuerySchema,
  slugify,
  uniqueSlug,
  updateQuizSchema,
} from './quiz';

const CATEGORY_ID = '11111111-1111-4111-8111-111111111111';

describe('slugify', () => {
  it('lowercases and dashes words', () => {
    expect(slugify('HTML Fundamentals')).toBe('html-fundamentals');
    expect(slugify('  Spaced   Out  ')).toBe('spaced-out');
  });

  it('strips punctuation instead of turning it into extra dashes', () => {
    expect(slugify('React: Hooks & State!')).toBe('react-hooks-state');
    expect(slugify('C++ / C# basics')).toBe('c-c-basics');
  });

  it('removes accents', () => {
    expect(slugify('Introducción a la Programación')).toBe('introduccion-a-la-programacion');
  });

  it('never leaves leading or trailing dashes', () => {
    expect(slugify('---hello---')).toBe('hello');
    expect(slugify('!!!')).toBe('');
  });

  it('caps the length at 180 characters without a trailing dash', () => {
    const slug = slugify('a'.repeat(200));
    expect(slug).toHaveLength(180);
    expect(slug.endsWith('-')).toBe(false);

    const wordBoundary = slugify(`${'word '.repeat(40)}end`);
    expect(wordBoundary.length).toBeLessThanOrEqual(180);
    expect(wordBoundary.endsWith('-')).toBe(false);
  });
});

describe('uniqueSlug', () => {
  it('returns the base slug when it is free', () => {
    expect(uniqueSlug('JavaScript Basics', [])).toBe('javascript-basics');
  });

  it('suffixes on collision', () => {
    expect(uniqueSlug('JavaScript Basics', ['javascript-basics'])).toBe('javascript-basics-2');
    expect(uniqueSlug('JavaScript Basics', ['javascript-basics', 'javascript-basics-2'])).toBe(
      'javascript-basics-3',
    );
  });

  it('falls back to "quiz" for titles with no usable characters', () => {
    expect(uniqueSlug('!!!', [])).toBe('quiz');
    expect(uniqueSlug('!!!', ['quiz'])).toBe('quiz-2');
  });

  it('accepts a Set as well as an array', () => {
    expect(uniqueSlug('Taken', new Set(['taken']))).toBe('taken-2');
  });
});

describe('createQuizSchema', () => {
  it('requires a title and a category', () => {
    const result = createQuizSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('applies the documented defaults', () => {
    const parsed = createQuizSchema.parse({ title: 'Node.js Basics', categoryId: CATEGORY_ID });

    expect(parsed).toMatchObject({
      title: 'Node.js Basics',
      categoryId: CATEGORY_ID,
      difficulty: 'MEDIUM',
      durationMinutes: 20,
      passingScore: 60,
      maxAttempts: 2,
      description: null,
      thumbnailUrl: null,
    });
  });

  it('coerces numeric strings from form posts', () => {
    const parsed = createQuizSchema.parse({
      title: 'Coerced',
      categoryId: CATEGORY_ID,
      durationMinutes: '45',
      passingScore: '70',
      maxAttempts: '3',
    });

    expect(parsed).toMatchObject({ durationMinutes: 45, passingScore: 70, maxAttempts: 3 });
  });

  it('treats blank optional text as absent', () => {
    const parsed = createQuizSchema.parse({
      title: 'Blank fields',
      categoryId: CATEGORY_ID,
      description: '   ',
      thumbnailUrl: '',
    });

    expect(parsed.description).toBeNull();
    expect(parsed.thumbnailUrl).toBeNull();
  });

  it('keeps a valid thumbnail URL', () => {
    const parsed = createQuizSchema.parse({
      title: 'With image',
      categoryId: CATEGORY_ID,
      thumbnailUrl: 'https://example.com/quiz.png',
    });

    expect(parsed.thumbnailUrl).toBe('https://example.com/quiz.png');
  });

  it('rejects a title that is too short or too long', () => {
    expect(createQuizSchema.safeParse({ title: 'ab', categoryId: CATEGORY_ID }).success).toBe(
      false,
    );
    expect(
      createQuizSchema.safeParse({ title: 'x'.repeat(161), categoryId: CATEGORY_ID }).success,
    ).toBe(false);
  });

  it('rejects out-of-range numbers', () => {
    const base = { title: 'Ranges', categoryId: CATEGORY_ID };

    for (const patch of [
      { durationMinutes: 0 },
      { durationMinutes: 181 },
      { passingScore: -1 },
      { passingScore: 101 },
      { maxAttempts: 0 },
      { maxAttempts: 11 },
    ]) {
      expect(createQuizSchema.safeParse({ ...base, ...patch }).success).toBe(false);
    }
  });

  it('rejects a malformed category id or thumbnail', () => {
    expect(createQuizSchema.safeParse({ title: 'No cat', categoryId: 'nope' }).success).toBe(false);
    expect(
      createQuizSchema.safeParse({
        title: 'Bad image',
        categoryId: CATEGORY_ID,
        thumbnailUrl: 'not-a-url',
      }).success,
    ).toBe(false);
  });
});

describe('updateQuizSchema', () => {
  it('accepts a single field', () => {
    expect(updateQuizSchema.parse({ durationMinutes: 30 })).toEqual({ durationMinutes: 30 });
  });

  it('does not apply create-time defaults to absent fields', () => {
    // The trap this guards: a partial parse must not reset unrelated columns.
    expect(updateQuizSchema.parse({ title: 'Renamed quiz' })).toEqual({ title: 'Renamed quiz' });
  });

  it('rejects an empty body', () => {
    const result = updateQuizSchema.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('Provide at least one field to update');
    }
  });
});

describe('quizListQuerySchema', () => {
  it('defaults to newest first, page 1, 10 per page', () => {
    expect(quizListQuerySchema.parse({})).toEqual({ sort: 'newest', page: 1, pageSize: 10 });
  });

  it('coerces paging and rejects out-of-range values', () => {
    expect(quizListQuerySchema.parse({ page: '2', pageSize: '5' })).toMatchObject({
      page: 2,
      pageSize: 5,
    });
    expect(quizListQuerySchema.safeParse({ pageSize: '51' }).success).toBe(false);
    expect(quizListQuerySchema.safeParse({ page: '0' }).success).toBe(false);
  });

  it('only accepts known enums', () => {
    expect(quizListQuerySchema.parse({ status: 'DRAFT' }).status).toBe('DRAFT');
    expect(quizListQuerySchema.parse({ difficulty: 'HARD' }).difficulty).toBe('HARD');
    expect(quizListQuerySchema.safeParse({ status: 'LIVE' }).success).toBe(false);
    expect(quizListQuerySchema.safeParse({ sort: 'random' }).success).toBe(false);
  });
});

describe('lifecycle rules', () => {
  it('needs at least one question to publish', () => {
    expect(canPublish({ questionCount: 0 })).toBe(false);
    expect(canPublish({ questionCount: 1 })).toBe(true);
  });

  it('refuses deletion once a student has attempted the quiz', () => {
    expect(canDelete({ attemptCount: 0 })).toBe(true);
    expect(canDelete({ attemptCount: 2 })).toBe(false);
  });
});
