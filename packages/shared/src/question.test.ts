import { describe, expect, it } from 'vitest';

import {
  canDeleteLastQuestion,
  canDeleteQuestion,
  MAX_OPTIONS,
  questionInputSchema,
  questionOrderSchema,
  totalMarks,
} from './question';

const options = [{ text: 'Alpha' }, { text: 'Beta' }, { text: 'Gamma' }];

const valid = {
  questionText: 'Which letter comes second?',
  options,
  correctIndex: 1,
};

describe('questionInputSchema', () => {
  it('accepts a well-formed multiple choice question', () => {
    const parsed = questionInputSchema.parse(valid);

    expect(parsed.questionText).toBe('Which letter comes second?');
    expect(parsed.options).toHaveLength(3);
    expect(parsed.correctIndex).toBe(1);
  });

  it('applies the authoring defaults', () => {
    const parsed = questionInputSchema.parse(valid);

    expect(parsed.marks).toBe(1);
    expect(parsed.difficulty).toBe('MEDIUM');
    expect(parsed.explanation).toBeNull();
  });

  it('treats a blank explanation as absent', () => {
    expect(questionInputSchema.parse({ ...valid, explanation: '   ' }).explanation).toBeNull();
    expect(questionInputSchema.parse({ ...valid, explanation: 'Because.' }).explanation).toBe(
      'Because.',
    );
  });

  it('trims the text it stores', () => {
    const parsed = questionInputSchema.parse({
      ...valid,
      questionText: '   Spaced out question?   ',
      options: [{ text: '  Alpha ' }, { text: 'Beta  ' }],
    });

    expect(parsed.questionText).toBe('Spaced out question?');
    expect(parsed.options.map((option) => option.text)).toEqual(['Alpha', 'Beta']);
  });

  it('needs at least two options and at most six', () => {
    expect(questionInputSchema.safeParse({ ...valid, options: [{ text: 'Only' }] }).success).toBe(
      false,
    );

    const many = Array.from({ length: MAX_OPTIONS + 1 }, (_, index) => ({
      text: `Option ${index}`,
    }));
    expect(questionInputSchema.safeParse({ ...valid, options: many }).success).toBe(false);

    const six = Array.from({ length: MAX_OPTIONS }, (_, index) => ({ text: `Option ${index}` }));
    expect(questionInputSchema.safeParse({ ...valid, options: six, correctIndex: 5 }).success).toBe(
      true,
    );
  });

  it('refuses a correct index outside the option set', () => {
    const result = questionInputSchema.safeParse({ ...valid, correctIndex: 3 });
    expect(result.success).toBe(false);
  });

  it('refuses duplicate options, ignoring casing and padding', () => {
    for (const texts of [
      ['Same', 'Same'],
      ['Same', ' same '],
    ]) {
      const result = questionInputSchema.safeParse({
        ...valid,
        options: texts.map((text) => ({ text })),
        correctIndex: 0,
      });

      expect(result.success).toBe(false);
    }
  });

  it('refuses blank options and a short question', () => {
    expect(
      questionInputSchema.safeParse({ ...valid, options: [{ text: 'A' }, { text: '  ' }] }).success,
    ).toBe(false);
    expect(questionInputSchema.safeParse({ ...valid, questionText: 'Hi' }).success).toBe(false);
  });

  it('bounds the marks', () => {
    expect(questionInputSchema.parse({ ...valid, marks: '4' }).marks).toBe(4);
    expect(questionInputSchema.safeParse({ ...valid, marks: 0 }).success).toBe(false);
    expect(questionInputSchema.safeParse({ ...valid, marks: 11 }).success).toBe(false);
    expect(questionInputSchema.safeParse({ ...valid, marks: 1.5 }).success).toBe(false);
  });

  it('accepts existing option ids so edits can keep their identity', () => {
    const parsed = questionInputSchema.parse({
      ...valid,
      options: [{ id: '11111111-1111-4111-8111-111111111111', text: 'Alpha' }, { text: 'Beta' }],
    });

    expect(parsed.options[0]?.id).toBe('11111111-1111-4111-8111-111111111111');
    expect(parsed.options[1]?.id).toBeUndefined();
  });
});

describe('questionOrderSchema', () => {
  it('accepts a list of ids', () => {
    const id = '11111111-1111-4111-8111-111111111111';
    expect(questionOrderSchema.parse({ ids: [id] }).ids).toEqual([id]);
  });

  it('refuses an empty list or a non-uuid', () => {
    expect(questionOrderSchema.safeParse({ ids: [] }).success).toBe(false);
    expect(questionOrderSchema.safeParse({ ids: ['nope'] }).success).toBe(false);
  });
});

describe('authoring rules', () => {
  it('protects a question that already has answers', () => {
    expect(canDeleteQuestion({ answerCount: 0 })).toBe(true);
    expect(canDeleteQuestion({ answerCount: 1 })).toBe(false);
  });

  it('keeps a published quiz from losing its last question', () => {
    expect(canDeleteLastQuestion({ status: 'PUBLISHED' }, 1)).toBe(false);
    expect(canDeleteLastQuestion({ status: 'PUBLISHED' }, 2)).toBe(true);
    expect(canDeleteLastQuestion({ status: 'DRAFT' }, 1)).toBe(true);
    expect(canDeleteLastQuestion({ status: 'UNPUBLISHED' }, 1)).toBe(true);
  });

  it('sums the marks on offer', () => {
    expect(totalMarks([{ marks: 1 }, { marks: 3 }])).toBe(4);
    expect(totalMarks([])).toBe(0);
  });
});
