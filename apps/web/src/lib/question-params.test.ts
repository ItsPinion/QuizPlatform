import type { AdminQuestion } from '@quiz/shared/question';
import { describe, expect, it } from 'vitest';

import {
  DIFFICULTY_TONE,
  emptyQuestionForm,
  moveItem,
  questionToForm,
  summarizeQuestions,
  toQuestionPayload,
  validateQuestionForm,
} from './question-params';

const QUESTION: AdminQuestion = {
  id: 'q1',
  quizId: 'quiz1',
  questionText: 'Which one is correct?',
  explanation: 'Because it is.',
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
    expect(form.correctIndex).toBe(0);
    expect(form.marks).toBe('1');
    expect(form.difficulty).toBe('MEDIUM');
  });
});

describe('questionToForm', () => {
  it('round-trips a stored question, keeping option ids', () => {
    const form = questionToForm(QUESTION);

    expect(form.questionText).toBe(QUESTION.questionText);
    expect(form.explanation).toBe('Because it is.');
    expect(form.marks).toBe('3');
    expect(form.difficulty).toBe('HARD');
    expect(form.correctIndex).toBe(1);
    expect(form.options.map((option) => option.id)).toEqual(['o1', 'o2', 'o3']);
  });

  it('falls back to the first option when no correct one is set', () => {
    const form = questionToForm({
      ...QUESTION,
      options: QUESTION.options.map((option) => ({ ...option, isCorrect: false })),
    });

    expect(form.correctIndex).toBe(0);
  });
});

describe('toQuestionPayload', () => {
  it('drops blank options and keeps the correct one correct', () => {
    const payload = toQuestionPayload({
      questionText: 'Pick Beta',
      explanation: '  ',
      marks: '2',
      difficulty: 'EASY',
      // The selected option sits below a blank row that will be removed.
      options: [{ id: 'o1', text: 'Alpha' }, { text: '   ' }, { id: 'o2', text: 'Beta' }],
      correctIndex: 2,
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
      correctIndex: 1,
    });

    expect(payload.options).toEqual([{ text: 'A' }, { text: 'B' }]);
    expect(payload.correctIndex).toBe(1);
  });
});

describe('validateQuestionForm', () => {
  const base = {
    questionText: 'Is this a question?',
    explanation: '',
    marks: '1',
    difficulty: 'MEDIUM' as const,
    options: [{ text: 'A' }, { text: 'B' }],
    correctIndex: 0,
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
        correctIndex: 2,
      }),
    ).toMatch(/which option is correct/i);
  });

  it('bounds the marks', () => {
    expect(validateQuestionForm({ ...base, marks: '0' })).toMatch(/between 1 and 10/);
    expect(validateQuestionForm({ ...base, marks: '11' })).toMatch(/between 1 and 10/);
    expect(validateQuestionForm({ ...base, marks: '2.5' })).toMatch(/between 1 and 10/);
    expect(validateQuestionForm({ ...base, marks: '10' })).toBeNull();
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

  it('handles an empty quiz', () => {
    expect(summarizeQuestions([])).toEqual({
      total: 0,
      marks: 0,
      answered: 0,
      byDifficulty: { EASY: 0, MEDIUM: 0, HARD: 0 },
    });
  });
});

describe('DIFFICULTY_TONE', () => {
  it('maps every difficulty to a badge tone', () => {
    expect(DIFFICULTY_TONE.EASY).toBe('success');
    expect(DIFFICULTY_TONE.MEDIUM).toBe('warning');
    expect(DIFFICULTY_TONE.HARD).toBe('destructive');
  });
});
