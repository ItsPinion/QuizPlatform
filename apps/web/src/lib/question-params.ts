import type { AdminQuestion } from '@quiz/shared/question';
import { MAX_OPTIONS, MIN_OPTIONS } from '@quiz/shared/question';
import {
  isMultiSelect,
  QUESTION_TYPE_LABELS,
  TRUE_FALSE_OPTIONS,
  type QuestionType,
} from '@quiz/shared/question-type';

/**
 * The editable shape of a question; strings because inputs are strings.
 *
 * `correctIndexes` is a list for every type, not just the multiple-answer one:
 * keeping one field means the option rows do not have to change their behaviour
 * when the author switches type, and a single-answer question is simply a list
 * with one entry in it.
 */
export interface QuestionForm {
  type: QuestionType;
  questionText: string;
  explanation: string;
  marks: string;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  /** Presentation shown above the options. */
  imageUrl: string;
  codeSnippet: string;
  options: { id?: string; text: string }[];
  correctIndexes: number[];
}

export const MAX_QUESTION_OPTIONS = MAX_OPTIONS;
export const MIN_QUESTION_OPTIONS = MIN_OPTIONS;

export function emptyQuestionForm(
  difficulty: QuestionForm['difficulty'] = 'MEDIUM',
  type: QuestionType = 'MCQ',
): QuestionForm {
  return {
    type,
    questionText: '',
    explanation: '',
    marks: '1',
    difficulty,
    imageUrl: '',
    codeSnippet: '',
    options:
      type === 'FILL_BLANK'
        ? [{ text: '' }, { text: '' }]
        : [{ text: '' }, { text: '' }, { text: '' }, { text: '' }],
    correctIndexes: [0],
  };
}

/** Turn a stored question back into the form, keeping option ids for the round trip. */
export function questionToForm(question: AdminQuestion): QuestionForm {
  const correctIndexes = question.options
    .map((option, index) => (option.isCorrect ? index : -1))
    .filter((index) => index >= 0);

  return {
    type: question.type,
    questionText: question.questionText,
    explanation: question.explanation ?? '',
    marks: String(question.marks),
    difficulty: question.difficulty,
    imageUrl: question.imageUrl ?? '',
    codeSnippet: question.codeSnippet ?? '',
    options:
      question.type === 'TRUE_FALSE'
        ? TRUE_FALSE_OPTIONS.map((text) => ({ text }))
        : question.options.map((option) => ({ id: option.id, text: option.text })),
    correctIndexes: correctIndexes.length > 0 ? correctIndexes : [0],
  };
}

/**
 * Build the payload the API expects.
 *
 * Blank option rows are dropped before indexing, and the correct indices are
 * re-pointed at the options that survived — otherwise deleting an empty row
 * above the correct answer would silently move the right answer with it. A
 * fill-in-the-blank question sends no index at all: every listed answer is
 * accepted, and the server writes them all as correct.
 */
export function toQuestionPayload(form: QuestionForm) {
  const truthy = (value: string) => (value.trim() === '' ? null : value.trim());

  if (form.type === 'TRUE_FALSE') {
    return {
      type: form.type,
      questionText: form.questionText,
      explanation: truthy(form.explanation),
      marks: Number(form.marks),
      difficulty: form.difficulty,
      imageUrl: truthy(form.imageUrl),
      codeSnippet: truthy(form.codeSnippet),
      options: [],
      correctIndex: form.correctIndexes[0] ?? 0,
    };
  }

  const kept = form.options
    .map((option, index) => ({ ...option, wasCorrect: form.correctIndexes.includes(index) }))
    .filter((option) => option.text.trim() !== '');

  const options = kept.map((option) => ({
    ...(option.id ? { id: option.id } : {}),
    text: option.text,
  }));

  if (form.type === 'FILL_BLANK') {
    return {
      type: form.type,
      questionText: form.questionText,
      explanation: truthy(form.explanation),
      marks: Number(form.marks),
      difficulty: form.difficulty,
      imageUrl: truthy(form.imageUrl),
      codeSnippet: truthy(form.codeSnippet),
      options,
      correctIndex: 0,
    };
  }

  const indexes = kept
    .map((option, index) => (option.wasCorrect ? index : -1))
    .filter((index) => index >= 0);

  return {
    type: form.type,
    questionText: form.questionText,
    explanation: truthy(form.explanation),
    marks: Number(form.marks),
    difficulty: form.difficulty,
    imageUrl: truthy(form.imageUrl),
    codeSnippet: truthy(form.codeSnippet),
    options,
    correctIndex: indexes[0] ?? 0,
    ...(isMultiSelect(form.type) ? { correctIndexes: indexes } : {}),
  };
}

/** Client-side guard so an obviously bad payload never leaves the browser. */
export function validateQuestionForm(form: QuestionForm): string | null {
  if (form.questionText.trim().length < 5) return 'Question text must be at least 5 characters.';

  const marks = Number(form.marks);
  if (!Number.isInteger(marks) || marks < 1 || marks > 10) {
    return 'Marks must be a whole number between 1 and 10.';
  }

  if (form.type === 'TRUE_FALSE') {
    if (form.correctIndexes.length !== 1) return 'Say whether the statement is true or false.';
    return null;
  }

  const filled = form.options.filter((option) => option.text.trim() !== '');
  const correct = filled.filter((_, index) => form.correctIndexes.includes(index));

  if (form.type === 'FILL_BLANK') {
    if (filled.length < 1) return 'List at least one accepted answer.';

    const normalized = filled.map((option) => option.text.trim().toLowerCase());
    if (new Set(normalized).size !== normalized.length) {
      return 'Accepted answers must be different.';
    }

    return null;
  }

  if (filled.length < MIN_OPTIONS) return `Add at least ${MIN_OPTIONS} options.`;
  if (filled.length > MAX_OPTIONS) return `Use at most ${MAX_OPTIONS} options.`;

  const selected = form.correctIndexes.filter(
    (index) => (form.options[index]?.text ?? '').trim() !== '',
  );
  if (selected.length === 0) return 'Choose which option is correct.';

  if (isMultiSelect(form.type)) {
    if (correct.length < 2) return 'Pick at least two correct options.';
  } else if (correct.length !== 1) {
    return 'Pick exactly one correct option.';
  }

  const normalized = filled.map((option) => option.text.trim().toLowerCase());
  if (new Set(normalized).size !== normalized.length) return 'Options must be different.';

  if (form.imageUrl.trim() !== '' && !/^https?:\/\/\S+$/i.test(form.imageUrl.trim())) {
    return 'The image URL must start with http:// or https://.';
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
  /** How many of each format the paper uses (§10). */
  byType: Record<QuestionType, number>;
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
    byType: {
      MCQ: questions.filter((question) => question.type === 'MCQ').length,
      MULTI: questions.filter((question) => question.type === 'MULTI').length,
      TRUE_FALSE: questions.filter((question) => question.type === 'TRUE_FALSE').length,
      FILL_BLANK: questions.filter((question) => question.type === 'FILL_BLANK').length,
    },
  };
}

/** The sentence a summary row prints: "6 questions · 2 formats · 12 marks". */
export function typeSummary(summary: QuestionSummary): string {
  const used = Object.entries(summary.byType).filter(([, count]) => count > 0);

  if (used.length === 0) return 'no questions yet';
  if (used.length === 1) return QUESTION_TYPE_LABELS[used[0]![0] as QuestionType];

  return `${used.length} formats`;
}

export const DIFFICULTY_TONE: Record<
  'EASY' | 'MEDIUM' | 'HARD',
  'success' | 'warning' | 'destructive'
> = {
  EASY: 'success',
  MEDIUM: 'warning',
  HARD: 'destructive',
};
