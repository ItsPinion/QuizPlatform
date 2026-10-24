import { describe, expect, it } from 'vitest';

import { saveAnswerSchema } from './attempt';
import {
  normaliseAnswer,
  QUESTION_TYPE_LABELS,
  QUESTION_TYPES,
  answerMatches,
  isChoiceType,
  isMultiSelect,
  hidesOptionsWhileRunning,
} from './question-type';
import { questionInputSchema, resolveQuestionInput } from './question';
import { answerVerdict } from './review';
import { gradeAttempt } from './submission';

/* -------------------------------------------------------------------------- */
/*  Normalisation                                                             */
/* -------------------------------------------------------------------------- */

describe('normaliseAnswer', () => {
  it('ignores case, padding, runs of space and a trailing full stop', () => {
    expect(normaliseAnswer('  HyperText   MARKUP language. ')).toBe('hypertext markup language');
    expect(normaliseAnswer('HyperText Markup Language')).toBe(
      normaliseAnswer('hypertext markup language'),
    );
  });

  it('folds smart quotes and wide characters', () => {
    expect(normaliseAnswer('ＨＴＭＬ')).toBe('html');
    expect(normaliseAnswer('\u2018yes\u2019')).toBe("'yes'");
  });

  it('does not treat near-misses as equal', () => {
    expect(normaliseAnswer('postgres')).not.toBe(normaliseAnswer('postgre'));
  });
});

describe('answerMatches', () => {
  it('accepts any listed spelling', () => {
    expect(answerMatches('JS', ['JavaScript', 'JS'])).toBe(true);
    expect(answerMatches(' javascript ', ['JavaScript'])).toBe(true);
  });

  it('refuses blank, missing and wrong answers', () => {
    expect(answerMatches('', ['JavaScript'])).toBe(false);
    expect(answerMatches('   ', ['JavaScript'])).toBe(false);
    expect(answerMatches(null, ['JavaScript'])).toBe(false);
    expect(answerMatches(undefined, ['JavaScript'])).toBe(false);
    expect(answerMatches('Java', ['JavaScript'])).toBe(false);
  });
});

describe('type helpers', () => {
  it('knows which formats pick options and which allow several', () => {
    expect(isChoiceType('MCQ')).toBe(true);
    expect(isChoiceType('FILL_BLANK')).toBe(false);
    expect(isMultiSelect('MULTI')).toBe(true);
    expect(isMultiSelect('MCQ')).toBe(false);
    expect(hidesOptionsWhileRunning('FILL_BLANK')).toBe(true);
    expect(hidesOptionsWhileRunning('MULTI')).toBe(false);
  });

  it('labels every type', () => {
    for (const type of QUESTION_TYPES) expect(QUESTION_TYPE_LABELS[type]).toBeTruthy();
  });
});

/* -------------------------------------------------------------------------- */
/*  Authoring                                                                 */
/* -------------------------------------------------------------------------- */

describe('questionInputSchema by type', () => {
  const choice = {
    questionText: 'Which one is right?',
    options: [{ text: 'A' }, { text: 'B' }],
    correctIndex: 1,
  };

  it('defaults to a single-answer multiple choice question', () => {
    const parsed = questionInputSchema.parse(choice);
    expect(parsed.type).toBe('MCQ');
    expect(resolveQuestionInput(parsed)).toEqual({
      type: 'MCQ',
      options: ['A', 'B'],
      correctIndexes: [1],
      imageUrl: null,
      codeSnippet: null,
    });
  });

  it('needs two correct options for a multiple-answer question', () => {
    expect(() =>
      questionInputSchema.parse({ ...choice, type: 'MULTI', correctIndexes: [0] }),
    ).toThrow();

    const parsed = questionInputSchema.parse({
      ...choice,
      type: 'MULTI',
      options: [{ text: 'A' }, { text: 'B' }, { text: 'C' }],
      correctIndexes: [2, 0],
    });

    expect(resolveQuestionInput(parsed).correctIndexes).toEqual([0, 2]);
  });

  it('writes the true/false pair itself and takes a 0/1 answer', () => {
    const parsed = questionInputSchema.parse({
      type: 'TRUE_FALSE',
      questionText: 'HTTP is stateless.',
      correctIndex: 0,
    });

    expect(resolveQuestionInput(parsed).options).toEqual(['True', 'False']);
    expect(resolveQuestionInput(parsed).correctIndexes).toEqual([0]);

    expect(() =>
      questionInputSchema.parse({ type: 'TRUE_FALSE', questionText: 'x', correctIndex: 2 }),
    ).toThrow();
  });

  it('treats every listed answer as correct on a fill in the blank', () => {
    const parsed = questionInputSchema.parse({
      type: 'FILL_BLANK',
      questionText: 'Name the language that styles the web.',
      options: [{ text: 'CSS' }, { text: 'Cascading Style Sheets' }],
    });

    expect(resolveQuestionInput(parsed).correctIndexes).toEqual([0, 1]);
  });

  it('refuses a fill in the blank with no accepted answer', () => {
    expect(() =>
      questionInputSchema.parse({ type: 'FILL_BLANK', questionText: 'Name it.', options: [] }),
    ).toThrow();
  });

  it('carries the media a question is presented with', () => {
    const parsed = questionInputSchema.parse({
      ...choice,
      imageUrl: 'https://example.com/diagram.png',
      codeSnippet: 'const x = [1, 2];\nx.map(String);',
    });

    expect(resolveQuestionInput(parsed).imageUrl).toBe('https://example.com/diagram.png');
    expect(parsed.codeSnippet).toContain('map(String)');
  });

  it('rejects an image that is not a URL', () => {
    expect(() => questionInputSchema.parse({ ...choice, imageUrl: 'diagram.png' })).toThrow();
  });
});

/* -------------------------------------------------------------------------- */
/*  Grading                                                                   */
/* -------------------------------------------------------------------------- */

describe('gradeAttempt across the formats', () => {
  const questions = [
    {
      id: 'single',
      marks: 1,
      type: 'MCQ' as const,
      options: [
        { id: 's1', isCorrect: true, text: 'Right' },
        { id: 's2', isCorrect: false, text: 'Wrong' },
      ],
    },
    {
      id: 'multi',
      marks: 2,
      type: 'MULTI' as const,
      options: [
        { id: 'm1', isCorrect: true, text: 'A' },
        { id: 'm2', isCorrect: true, text: 'B' },
        { id: 'm3', isCorrect: false, text: 'C' },
      ],
    },
    {
      id: 'blank',
      marks: 2,
      type: 'FILL_BLANK' as const,
      options: [
        { id: 'b1', isCorrect: true, text: 'HyperText Markup Language' },
        { id: 'b2', isCorrect: true, text: 'HTML' },
      ],
    },
  ];

  it('pays for a whole multi-select set and nothing for a partial one', () => {
    const perfect = gradeAttempt({
      questions,
      answers: [
        { questionId: 'single', selectedOptionId: 's1' },
        { questionId: 'multi', selectedOptionId: null, selectedOptionIds: ['m2', 'm1'] },
        { questionId: 'blank', selectedOptionId: null, answerText: 'html' },
      ],
      passingScore: 50,
    });

    expect(perfect.correctAnswers).toBe(3);
    expect(perfect.score).toBe(5);
    expect(perfect.percentage).toBe(100);

    const partial = gradeAttempt({
      questions,
      answers: [
        { questionId: 'single', selectedOptionId: 's1' },
        { questionId: 'multi', selectedOptionId: null, selectedOptionIds: ['m1'] },
        { questionId: 'blank', selectedOptionId: null, answerText: 'HTML' },
      ],
      passingScore: 50,
    });

    expect(partial.correctAnswers).toBe(2);
    expect(partial.incorrectAnswers).toBe(1);
    expect(partial.score).toBe(3);
  });

  it('marks an over-ticked multi-select wrong, not partly right', () => {
    const result = gradeAttempt({
      questions,
      answers: [
        { questionId: 'multi', selectedOptionId: null, selectedOptionIds: ['m1', 'm2', 'm3'] },
      ],
      passingScore: 50,
    });

    expect(result.incorrectAnswers).toBe(1);
    expect(result.correctAnswers).toBe(0);
  });

  it('grades a typed answer through normalisation', () => {
    const result = gradeAttempt({
      questions,
      answers: [
        {
          questionId: 'blank',
          selectedOptionId: null,
          answerText: '  hypertext markup language. ',
        },
      ],
      passingScore: 50,
    });

    expect(result.correctAnswers).toBe(1);
    expect(result.score).toBe(2);
  });

  it('counts a blank typed answer as unanswered, not wrong', () => {
    const result = gradeAttempt({
      questions,
      answers: [{ questionId: 'blank', selectedOptionId: null, answerText: '   ' }],
      passingScore: 50,
      negativeMarks: 1,
    });

    expect(result.unanswered).toBe(3);
    expect(result.incorrectAnswers).toBe(0);
    expect(result.penalty).toBe(0);
  });

  it('still charges the penalty for a wrong typed answer', () => {
    const result = gradeAttempt({
      questions,
      answers: [{ questionId: 'blank', selectedOptionId: null, answerText: 'XML' }],
      passingScore: 50,
      negativeMarks: 0.5,
    });

    expect(result.incorrectAnswers).toBe(1);
    expect(result.penalty).toBe(0.5);
  });

  it('reports the paper as a tally per format', () => {
    const result = gradeAttempt({
      questions,
      answers: [
        { questionId: 'single', selectedOptionId: 's1' },
        { questionId: 'blank', selectedOptionId: null, answerText: 'xml' },
      ],
      passingScore: 50,
    });

    expect(result.formats).toEqual([
      { type: 'MCQ', total: 1, correct: 1, incorrect: 0, unanswered: 0 },
      { type: 'MULTI', total: 1, correct: 0, incorrect: 0, unanswered: 1 },
      { type: 'FILL_BLANK', total: 1, correct: 0, incorrect: 1, unanswered: 0 },
    ]);
  });

  it('grades an old payload with no type exactly as before', () => {
    const result = gradeAttempt({
      questions: [{ id: 'q', marks: 1, options: [{ id: 'a', isCorrect: true }] }],
      answers: [{ questionId: 'q', selectedOptionId: 'a' }],
      passingScore: 50,
    });

    expect(result.correctAnswers).toBe(1);
    expect(result.formats[0]?.type).toBe('MCQ');
  });
});

/* -------------------------------------------------------------------------- */
/*  Review                                                                    */
/* -------------------------------------------------------------------------- */

describe('answerVerdict', () => {
  const options = [
    { id: 'm1', isCorrect: true, text: 'A' },
    { id: 'm2', isCorrect: true, text: 'B' },
    { id: 'm3', isCorrect: false, text: 'C' },
  ];

  it('reads a multi-select as a set', () => {
    expect(
      answerVerdict({ type: 'MULTI', options, selectedOptionIds: ['m2', 'm1'], answerText: null }),
    ).toBe('CORRECT');
    expect(
      answerVerdict({ type: 'MULTI', options, selectedOptionIds: ['m1'], answerText: null }),
    ).toBe('INCORRECT');
    expect(answerVerdict({ type: 'MULTI', options, selectedOptionIds: [], answerText: null })).toBe(
      'UNANSWERED',
    );
  });

  it('compares typed answers with the same rules as the grader', () => {
    expect(
      answerVerdict({ type: 'FILL_BLANK', options, selectedOptionIds: [], answerText: ' a ' }),
    ).toBe('CORRECT');
    expect(
      answerVerdict({ type: 'FILL_BLANK', options, selectedOptionIds: [], answerText: 'z' }),
    ).toBe('INCORRECT');
    expect(
      answerVerdict({ type: 'FILL_BLANK', options, selectedOptionIds: [], answerText: ' ' }),
    ).toBe('UNANSWERED');
  });

  it('keeps the single-answer rule', () => {
    expect(
      answerVerdict({ type: 'MCQ', options, selectedOptionIds: ['m1'], answerText: null }),
    ).toBe('CORRECT');
    expect(
      answerVerdict({ type: 'MCQ', options, selectedOptionIds: ['m3'], answerText: null }),
    ).toBe('INCORRECT');
  });
});

/* -------------------------------------------------------------------------- */
/*  Saving                                                                    */
/* -------------------------------------------------------------------------- */

describe('saveAnswerSchema', () => {
  const optionId = '0f8fad5b-d9cb-469f-a165-70867728950e';
  const otherId = '1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed';

  it('accepts each shape on its own', () => {
    expect(saveAnswerSchema.parse({ optionId })).toEqual({ optionId });
    expect(saveAnswerSchema.parse({ optionIds: [optionId, otherId] })).toEqual({
      optionIds: [optionId, otherId],
    });
    expect(saveAnswerSchema.parse({ answerText: 'HTMl' })).toEqual({ answerText: 'HTMl' });
  });

  it('clears an answer with an empty value of the right shape', () => {
    expect(saveAnswerSchema.parse({ optionId: null })).toEqual({ optionId: null });
    expect(saveAnswerSchema.parse({ optionIds: [] })).toEqual({ optionIds: [] });
    expect(saveAnswerSchema.parse({ answerText: null })).toEqual({ answerText: null });
  });

  it('refuses a payload that mixes shapes or sends none', () => {
    expect(() => saveAnswerSchema.parse({})).toThrow();
    expect(() => saveAnswerSchema.parse({ optionId, answerText: 'x' })).toThrow();
    expect(() => saveAnswerSchema.parse({ optionIds: [optionId], optionId })).toThrow();
  });

  it('refuses a bad id and oversized text', () => {
    expect(() => saveAnswerSchema.parse({ optionIds: ['nope'] })).toThrow();
    expect(() => saveAnswerSchema.parse({ answerText: 'x'.repeat(1001) })).toThrow();
  });
});
