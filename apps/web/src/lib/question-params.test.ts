import type { AdminQuestion } from '@quiz/shared/question';
import { describe, expect, it } from 'vitest';

import {
  DIFFICULTY_TONE,
  emptyQuestionForm,
  moveItem,
  questionToForm,
  summarizeQuestions,
  toQuestionPayload,
  typeSummary,
  validateQuestionForm,
} from './question-params';

const QUESTION: AdminQuestion = {
  id: 'q1',
  quizId: 'quiz1',
  type: 'MCQ',
  questionText: 'Which one is correct?',
  explanation: 'Because it is.',
  imageUrl: null,
  codeSnippet: null,
  marks: 3,
  difficulty: 'HARD',
  position: 0,
  options: [
    { id: 'o1', text: 'Alpha', isCorrect: false, position: 0 },
    { id: 'o2', text: 'Beta', isCorrect: true, position: 1 },
    { id: 'o3', text: 'Gamma', isCorrect: false, position: 2 },
  ],
  answerCount: 2,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('emptyQuestionForm', () => {
  it('starts with four blank options and the first one selected', () => {
    const form = emptyQuestionForm();

    expect(form.options).toHaveLength(4);
    expect(form.options.every((option) => option.text === '')).toBe(true);
    expect(form.correctIndexes).toEqual([0]);
    expect(form.marks).toBe('1');
    expect(form.difficulty).toBe('MEDIUM');
    expect(form.type).toBe('MCQ');
  });

  it('starts a fill in the blank with room for two accepted answers', () => {
    expect(emptyQuestionForm('MEDIUM', 'FILL_BLANK').options).toHaveLength(2);
    expect(emptyQuestionForm('MEDIUM', 'FILL_BLANK').type).toBe('FILL_BLANK');
  });
});

describe('questionToForm', () => {
  it('round-trips a stored question, keeping option ids', () => {
    const form = questionToForm(QUESTION);

    expect(form.questionText).toBe(QUESTION.questionText);
    expect(form.explanation).toBe('Because it is.');
    expect(form.marks).toBe('3');
    expect(form.difficulty).toBe('HARD');
    expect(form.correctIndexes).toEqual([1]);
    expect(form.options.map((option) => option.id)).toEqual(['o1', 'o2', 'o3']);
    expect(form.type).toBe('MCQ');
  });

  it('falls back to the first option when no correct one is set', () => {
    const form = questionToForm({
      ...QUESTION,
      options: QUESTION.options.map((option) => ({ ...option, isCorrect: false })),
    });

    expect(form.correctIndexes).toEqual([0]);
  });

  it('reads every correct option of a multiple-answer question', () => {
    const form = questionToForm({
      ...QUESTION,
      type: 'MULTI',
      options: QUESTION.options.map((option) => ({ ...option, isCorrect: true })),
    });

    expect(form.correctIndexes).toEqual([0, 1, 2]);
  });

  it('rebuilds the true/false pair from the stored options', () => {
    const form = questionToForm({
      ...QUESTION,
      type: 'TRUE_FALSE',
      options: [
        { id: 't', text: 'True', isCorrect: false, position: 0 },
        { id: 'f', text: 'False', isCorrect: true, position: 1 },
      ],
    });

    expect(form.options.map((option) => option.text)).toEqual(['True', 'False']);
    expect(form.correctIndexes).toEqual([1]);
  });
});

describe('toQuestionPayload', () => {
  it('drops blank options and keeps the correct one correct', () => {
    const payload = toQuestionPayload({
      ...emptyQuestionForm(),
      questionText: 'Pick Beta',
      explanation: '  ',
      marks: '2',
      difficulty: 'EASY',
      // The selected option sits below a blank row that will be removed.
      options: [{ id: 'o1', text: 'Alpha' }, { text: '   ' }, { id: 'o2', text: 'Beta' }],
      correctIndexes: [2],
    });

    expect(payload.options).toEqual([
      { id: 'o1', text: 'Alpha' },
      { id: 'o2', text: 'Beta' },
    ]);
    expect(payload.correctIndex).toBe(1);
    expect(payload.explanation).toBeNull();
    expect(payload.marks).toBe(2);
  });

  it('omits ids for options that do not exist yet', () => {
    const payload = toQuestionPayload({
      ...emptyQuestionForm(),
      questionText: 'New question?',
      options: [{ text: 'A' }, { text: 'B' }],
      correctIndexes: [1],
    });

    expect(payload.options).toEqual([{ text: 'A' }, { text: 'B' }]);
    expect(payload.correctIndex).toBe(1);
  });

  it('sends every correct index for a multiple-answer question', () => {
    const payload = toQuestionPayload({
      ...emptyQuestionForm(),
      type: 'MULTI',
      questionText: 'Pick two',
      options: [{ text: 'A' }, { text: 'B' }, { text: 'C' }],
      correctIndexes: [0, 2],
    });

    expect('correctIndexes' in payload ? payload.correctIndexes : null).toEqual([0, 2]);
  });

  it('sends no indices for a fill in the blank — every answer is accepted', () => {
    const payload = toQuestionPayload({
      ...emptyQuestionForm('MEDIUM', 'FILL_BLANK'),
      questionText: 'Name the stylesheet language.',
      options: [{ text: 'CSS' }, { text: 'Cascading Style Sheets' }],
      correctIndexes: [],
    });

    expect(payload.type).toBe('FILL_BLANK');
    expect(payload.options).toEqual([{ text: 'CSS' }, { text: 'Cascading Style Sheets' }]);
    expect('correctIndexes' in payload).toBe(false);
  });

  it('sends only the true/false answer, letting the server write the pair', () => {
    const payload = toQuestionPayload({
      ...emptyQuestionForm('MEDIUM', 'TRUE_FALSE'),
      questionText: 'HTTP is stateless.',
      options: [{ text: 'True' }, { text: 'False' }],
      correctIndexes: [1],
    });

    expect(payload).toMatchObject({ type: 'TRUE_FALSE', options: [], correctIndex: 1 });
  });

  it('carries the image and the code block', () => {
    const payload = toQuestionPayload({
      ...emptyQuestionForm(),
      questionText: 'What does this log?',
      options: [{ text: '1' }, { text: '2' }],
      codeSnippet: 'console.log([1].length);',
      imageUrl: 'https://example.com/i.png',
    });

    expect(payload.codeSnippet).toBe('console.log([1].length);');
    expect(payload.imageUrl).toBe('https://example.com/i.png');
  });
});

describe('validateQuestionForm', () => {
  const base = {
    ...emptyQuestionForm(),
    questionText: 'Is this a question?',
    options: [{ text: 'A' }, { text: 'B' }],
    correctIndexes: [0],
  };

  it('accepts a complete form', () => {
    expect(validateQuestionForm(base)).toBeNull();
  });

  it('reports the first problem it finds', () => {
    expect(validateQuestionForm({ ...base, questionText: 'Hi' })).toMatch(/at least 5/);
    expect(validateQuestionForm({ ...base, options: [{ text: 'A' }] })).toMatch(/at least 2/);
    expect(validateQuestionForm({ ...base, options: [{ text: 'A' }, { text: '  ' }] })).toMatch(
      /at least 2/,
    );
    expect(validateQuestionForm({ ...base, options: [{ text: 'A' }, { text: 'a' }] })).toMatch(
      /different/,
    );
  });

  it('refuses to point the correct answer at a blank row', () => {
    expect(
      validateQuestionForm({
        ...base,
        options: [{ text: 'A' }, { text: 'B' }, { text: '' }],
        correctIndexes: [2],
      }),
    ).toMatch(/which option is correct/i);
  });

  it('bounds the marks', () => {
    expect(validateQuestionForm({ ...base, marks: '0' })).toMatch(/between 1 and 10/);
    expect(validateQuestionForm({ ...base, marks: '11' })).toMatch(/between 1 and 10/);
    expect(validateQuestionForm({ ...base, marks: '2.5' })).toMatch(/between 1 and 10/);
    expect(validateQuestionForm({ ...base, marks: '10' })).toBeNull();
  });

  it('needs exactly one answer on a single-answer question', () => {
    expect(validateQuestionForm({ ...base, correctIndexes: [] })).toMatch(
      /which option is correct/i,
    );
    expect(validateQuestionForm({ ...base, correctIndexes: [0, 1] })).toMatch(/exactly one/);
  });

  it('needs two answers on a multiple-answer question', () => {
    const multi = { ...base, type: 'MULTI' as const };

    expect(validateQuestionForm({ ...multi, correctIndexes: [0] })).toMatch(/at least two/);
    expect(validateQuestionForm({ ...multi, correctIndexes: [0, 1] })).toBeNull();
  });

  it('accepts a fill in the blank with one accepted answer and no index', () => {
    expect(
      validateQuestionForm({
        ...base,
        type: 'FILL_BLANK',
        options: [{ text: 'CSS' }],
        correctIndexes: [],
      }),
    ).toBeNull();

    expect(
      validateQuestionForm({ ...base, type: 'FILL_BLANK', options: [], correctIndexes: [] }),
    ).toMatch(/at least one accepted answer/);
  });

  it('needs a true or false on the pair', () => {
    expect(
      validateQuestionForm({
        ...base,
        type: 'TRUE_FALSE',
        options: [{ text: 'True' }, { text: 'False' }],
        correctIndexes: [],
      }),
    ).toMatch(/true or false/i);
  });

  it('refuses an image URL that is not a URL', () => {
    expect(validateQuestionForm({ ...base, imageUrl: 'diagram.png' })).toMatch(/http/);
    expect(validateQuestionForm({ ...base, imageUrl: 'https://ok.example/i.png' })).toBeNull();
  });
});

describe('moveItem', () => {
  it('moves an item up or down', () => {
    expect(moveItem(['a', 'b', 'c'], 0, 1)).toEqual(['b', 'a', 'c']);
    expect(moveItem(['a', 'b', 'c'], 2, -1)).toEqual(['a', 'c', 'b']);
  });

  it('is a no-op at the edges and for bad indexes', () => {
    expect(moveItem(['a', 'b'], 0, -1)).toEqual(['a', 'b']);
    expect(moveItem(['a', 'b'], 1, 1)).toEqual(['a', 'b']);
    expect(moveItem(['a', 'b'], 9, 1)).toEqual(['a', 'b']);
  });

  it('does not mutate the input', () => {
    const items = ['a', 'b', 'c'];
    moveItem(items, 0, 2);
    expect(items).toEqual(['a', 'b', 'c']);
  });
});

describe('summarizeQuestions', () => {
  it('counts questions, marks, answered and difficulty splits', () => {
    const summary = summarizeQuestions([
      QUESTION,
      { ...QUESTION, id: 'q2', marks: 1, difficulty: 'EASY', answerCount: 0 },
      { ...QUESTION, id: 'q3', marks: 2, difficulty: 'EASY', answerCount: 0 },
    ]);

    expect(summary.total).toBe(3);
    expect(summary.marks).toBe(6);
    expect(summary.answered).toBe(1);
    expect(summary.byDifficulty).toEqual({ EASY: 2, MEDIUM: 0, HARD: 1 });
  });

  it('counts the formats a paper mixes', () => {
    const summary = summarizeQuestions([
      QUESTION,
      { ...QUESTION, id: 'q2', type: 'MULTI' },
      { ...QUESTION, id: 'q3', type: 'FILL_BLANK' },
    ]);

    expect(summary.byType).toEqual({ MCQ: 1, MULTI: 1, TRUE_FALSE: 0, FILL_BLANK: 1 });
    expect(typeSummary(summary)).toBe('3 formats');
  });

  it('handles an empty quiz', () => {
    expect(summarizeQuestions([])).toEqual({
      total: 0,
      marks: 0,
      answered: 0,
      byDifficulty: { EASY: 0, MEDIUM: 0, HARD: 0 },
      byType: { MCQ: 0, MULTI: 0, TRUE_FALSE: 0, FILL_BLANK: 0 },
    });
    expect(typeSummary(summarizeQuestions([]))).toBe('no questions yet');
  });
});

describe('DIFFICULTY_TONE', () => {
  it('maps every difficulty to a badge tone', () => {
    expect(DIFFICULTY_TONE.EASY).toBe('success');
    expect(DIFFICULTY_TONE.MEDIUM).toBe('warning');
    expect(DIFFICULTY_TONE.HARD).toBe('destructive');
  });
});
