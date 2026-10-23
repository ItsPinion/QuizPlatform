import type { AdminQuestion } from '@quiz/shared/question';
import { MAX_OPTIONS, MIN_OPTIONS } from '@quiz/shared/question';

/** The editable shape of a question; strings because inputs are strings. */
export interface QuestionForm {
  questionText: string;
  explanation: string;
  marks: string;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  options: { id?: string; text: string }[];
  correctIndex: number;
}

export const MAX_QUESTION_OPTIONS = MAX_OPTIONS;
export const MIN_QUESTION_OPTIONS = MIN_OPTIONS;

export function emptyQuestionForm(difficulty: QuestionForm['difficulty'] = 'MEDIUM'): QuestionForm {
  return {
    questionText: '',
    explanation: '',
    marks: '1',
    difficulty,
    options: [{ text: '' }, { text: '' }, { text: '' }, { text: '' }],
    correctIndex: 0,
  };
}

/** Turn a stored question back into the form, keeping option ids for the round trip. */
export function questionToForm(question: AdminQuestion): QuestionForm {
  return {
    questionText: question.questionText,
    explanation: question.explanation ?? '',
    marks: String(question.marks),
    difficulty: question.difficulty,
    options: question.options.map((option) => ({ id: option.id, text: option.text })),
    correctIndex: Math.max(
      0,
      question.options.findIndex((option) => option.isCorrect),
    ),
  };
}

/**
 * Build the payload the API expects.
 *
 * Blank option rows are dropped before indexing, and the correct index is
 * re-pointed at the option that was selected — otherwise deleting an empty row
 * above the correct answer would silently move the right answer with it.
 */
export function toQuestionPayload(form: QuestionForm) {
  const kept = form.options
    .map((option, index) => ({ ...option, wasCorrect: index === form.correctIndex }))
    .filter((option) => option.text.trim() !== '');

  const correctIndex = Math.max(
    0,
    kept.findIndex((option) => option.wasCorrect),
  );

  return {
    questionText: form.questionText,
    explanation: form.explanation.trim() === '' ? null : form.explanation,
    marks: Number(form.marks),
    difficulty: form.difficulty,
    options: kept.map((option) => ({
      ...(option.id ? { id: option.id } : {}),
      text: option.text,
    })),
    correctIndex,
  };
}

/** Client-side guard so an obviously bad payload never leaves the browser. */
export function validateQuestionForm(form: QuestionForm): string | null {
  if (form.questionText.trim().length < 5) return 'Question text must be at least 5 characters.';

  const filled = form.options.filter((option) => option.text.trim() !== '');

  if (filled.length < MIN_OPTIONS) return `Add at least ${MIN_OPTIONS} options.`;
  if (filled.length > MAX_OPTIONS) return `Use at most ${MAX_OPTIONS} options.`;

  const selected = form.options[form.correctIndex];
  if (!selected || selected.text.trim() === '') return 'Choose which option is correct.';

  const normalized = filled.map((option) => option.text.trim().toLowerCase());
  if (new Set(normalized).size !== normalized.length) return 'Options must be different.';

  const marks = Number(form.marks);
  if (!Number.isInteger(marks) || marks < 1 || marks > 10) {
    return 'Marks must be a whole number between 1 and 10.';
  }

  return null;
}

/** Move an item within a list; out-of-range moves are no-ops. */
export function moveItem<T>(items: readonly T[], index: number, delta: number): T[] {
  const target = index + delta;
  if (index < 0 || index >= items.length || target < 0 || target >= items.length) return [...items];

  const next = [...items];
  const [moved] = next.splice(index, 1);
  if (moved === undefined) return [...items];
  next.splice(target, 0, moved);

  return next;
}

export interface QuestionSummary {
  total: number;
  marks: number;
  answered: number;
  byDifficulty: { EASY: number; MEDIUM: number; HARD: number };
}

/** What the quiz header shows: how much is authored and how much is frozen. */
export function summarizeQuestions(questions: readonly AdminQuestion[]): QuestionSummary {
  return {
    total: questions.length,
    marks: questions.reduce((sum, question) => sum + question.marks, 0),
    answered: questions.filter((question) => question.answerCount > 0).length,
    byDifficulty: {
      EASY: questions.filter((question) => question.difficulty === 'EASY').length,
      MEDIUM: questions.filter((question) => question.difficulty === 'MEDIUM').length,
      HARD: questions.filter((question) => question.difficulty === 'HARD').length,
    },
  };
}

export const DIFFICULTY_TONE: Record<
  'EASY' | 'MEDIUM' | 'HARD',
  'success' | 'warning' | 'destructive'
> = {
  EASY: 'success',
  MEDIUM: 'warning',
  HARD: 'destructive',
};
