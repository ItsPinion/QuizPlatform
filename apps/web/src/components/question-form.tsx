'use client';

import type { AdminQuestion } from '@quiz/shared/question';
import { CircleCheck, Loader2, Plus, Trash2, X } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { client } from '@/lib/api';
import { parseApiFailure, toApiFailure } from '@/lib/api-error';
import {
  emptyQuestionForm,
  MAX_QUESTION_OPTIONS,
  MIN_QUESTION_OPTIONS,
  questionToForm,
  toQuestionPayload,
  validateQuestionForm,
  type QuestionForm as FormState,
} from '@/lib/question-params';
import { cn } from '@/lib/utils';

interface Props {
  quizId: string;
  /** Present when editing an existing question; absent when authoring a new one. */
  question?: AdminQuestion;
  onSaved: (question: AdminQuestion) => void;
  onCancel: () => void;
}

/**
 * Author one multiple choice question.
 *
 * Every question has exactly one correct option, chosen with the radio in front
 * of the option — the shape enforces the rule, and the server rejects anything
 * that slips past it. Option ids are carried through edits so a question can be
 * fixed without orphaning answers students already gave.
 */
export function QuestionForm({ quizId, question, onSaved, onCancel }: Props) {
  const editing = Boolean(question);

  const [form, setForm] = useState<FormState>(() =>
    question ? questionToForm(question) : emptyQuestionForm(),
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  function updateOption(index: number, text: string) {
    setForm((current) => ({
      ...current,
      options: current.options.map((option, position) =>
        position === index ? { ...option, text } : option,
      ),
    }));
  }

  function addOption() {
    setForm((current) =>
      current.options.length >= MAX_QUESTION_OPTIONS
        ? current
        : { ...current, options: [...current.options, { text: '' }] },
    );
  }

  function removeOption(index: number) {
    setForm((current) => {
      if (current.options.length <= MIN_QUESTION_OPTIONS) return current;

      const options = current.options.filter((_, position) => position !== index);
      // Keep the radio on a real row: removing the selected row moves it to the
      // same slot (or the last one if the removed row was at the end).
      const correctIndex =
        current.correctIndex === index
          ? Math.min(index, options.length - 1)
          : current.correctIndex > index
            ? current.correctIndex - 1
            : current.correctIndex;

      return { ...current, options, correctIndex };
    });
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const invalid = validateQuestionForm(form);
    if (invalid) {
      setError(invalid);
      return;
    }

    setPending(true);
    setError(null);

    const payload = toQuestionPayload(form);

    try {
      if (editing && question) {
        const res = await client.api.admin.questions[':id'].$put({
          param: { id: question.id },
          json: payload,
        });

        if (!res.ok) {
          setError(parseApiFailure(await res.json()).message);
          return;
        }

        onSaved((await res.json()).question);
        return;
      }

      const res = await client.api.admin.quizzes[':quizId'].questions.$post({
        param: { quizId },
        json: payload,
      });

      if (!res.ok) {
        setError(parseApiFailure(await res.json()).message);
        return;
      }

      onSaved((await res.json()).question);
    } catch (cause) {
      setError(toApiFailure(cause).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="border-border/70 bg-background/40 space-y-4 rounded-xl border p-4"
      noValidate
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[13.5px] font-medium">{editing ? 'Edit question' : 'New question'}</h3>
        <Button type="button" variant="ghost" size="icon" onClick={onCancel} aria-label="Cancel">
          <X />
        </Button>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="questionText">Question</Label>
        <textarea
          id="questionText"
          value={form.questionText}
          onChange={(event) => update('questionText', event.target.value)}
          rows={2}
          maxLength={2000}
          placeholder="Which method converts a JSON string into an object?"
          className="border-input bg-background focus-visible:ring-ring/50 w-full rounded-md border px-3 py-2 text-[13px] focus-visible:ring-[3px] focus-visible:outline-none"
        />
      </div>

      <fieldset className="space-y-2">
        <legend className="text-[12.5px] font-medium">
          Options <span className="text-muted-foreground font-normal">— pick the correct one</span>
        </legend>

        {form.options.map((option, index) => (
          <div key={option.id ?? `new-${index}`} className="flex items-center gap-2">
            <input
              type="radio"
              name="correctIndex"
              checked={form.correctIndex === index}
              onChange={() => update('correctIndex', index)}
              aria-label={`Option ${index + 1} is correct`}
              className="accent-primary size-3.5"
            />
            <Input
              value={option.text}
              onChange={(event) => updateOption(index, event.target.value)}
              placeholder={`Option ${index + 1}`}
              aria-label={`Option ${index + 1}`}
              autoComplete="off"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => removeOption(index)}
              disabled={form.options.length <= MIN_QUESTION_OPTIONS}
              aria-label={`Remove option ${index + 1}`}
            >
              <Trash2 />
            </Button>
          </div>
        ))}

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addOption}
          disabled={form.options.length >= MAX_QUESTION_OPTIONS}
        >
          <Plus />
          Add option
        </Button>
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="marks">Marks</Label>
          <Input
            id="marks"
            type="number"
            min={1}
            max={10}
            value={form.marks}
            onChange={(event) => update('marks', event.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="questionDifficulty">Difficulty</Label>
          <Select
            id="questionDifficulty"
            value={form.difficulty}
            onChange={(event) =>
              update('difficulty', event.target.value as FormState['difficulty'])
            }
          >
            <option value="EASY">Easy</option>
            <option value="MEDIUM">Medium</option>
            <option value="HARD">Hard</option>
          </Select>
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="explanation">Explanation (optional)</Label>
          <textarea
            id="explanation"
            value={form.explanation}
            onChange={(event) => update('explanation', event.target.value)}
            rows={2}
            maxLength={2000}
            placeholder="Shown with the answer review after the attempt."
            className="border-input bg-background focus-visible:ring-ring/50 w-full rounded-md border px-3 py-2 text-[13px] focus-visible:ring-[3px] focus-visible:outline-none"
          />
        </div>
      </div>

      {error ? (
        <div
          role="alert"
          className="border-destructive/30 bg-destructive/10 text-destructive rounded-lg border px-3 py-2 text-[12.5px]"
        >
          {error}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" disabled={pending} className={cn(pending && 'opacity-90')}>
          {pending ? <Loader2 className="animate-spin" /> : <CircleCheck />}
          {editing ? 'Save question' : 'Add question'}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
