'use client';

import type { AdminQuiz, CategoryOption } from '@quiz/shared/quiz';
import { Loader2, Save } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { CategoryCombobox } from '@/components/category-combobox';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { client } from '@/lib/api';
import { parseApiFailure, toApiFailure } from '@/lib/api-error';
import { cn } from '@/lib/utils';

/**
 * `datetime-local` and the API do not speak the same dialect.
 *
 * The control types a wall-clock time with no zone; the API stores an instant.
 * Converting through `Date` means the browser's timezone is the one that counts,
 * which is the only interpretation that matches "the quiz opens at 9 in the
 * morning" for the person who typed 09:00.
 */
function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';

  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fromLocalInput(value: string): string | null {
  if (value.trim() === '') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

interface Props {
  categories: CategoryOption[];
  /** Present when editing; absent when creating. */
  quiz?: AdminQuiz;
}

/**
 * Create / edit form.
 *
 * The same component in two modes, because the fields, defaults and validation
 * messages are identical — only the HTTP method and the success destination
 * differ. Errors come from the API verbatim, so the UI never invents a rule the
 * server does not enforce.
 */
export function QuizForm({ categories, quiz }: Props) {
  const router = useRouter();
  const editing = Boolean(quiz);

  const [form, setForm] = useState({
    title: quiz?.title ?? '',
    description: quiz?.description ?? '',
    categoryName: quiz?.categoryName ?? '',
    difficulty: (quiz?.difficulty ?? 'MEDIUM') as AdminQuiz['difficulty'],
    durationMinutes: String(quiz?.durationMinutes ?? 20),
    passingScore: String(quiz?.passingScore ?? 60),
    maxAttempts: String(quiz?.maxAttempts ?? 2),
    thumbnailUrl: quiz?.thumbnailUrl ?? '',
    // `datetime-local` wants `YYYY-MM-DDTHH:mm`, which is the first 16 chars of
    // the stored ISO string read against the browser's own clock.
    availableFrom: toLocalInput(quiz?.availableFrom ?? null),
    availableUntil: toLocalInput(quiz?.availableUntil ?? null),
    shuffleQuestions: quiz?.shuffleQuestions ?? false,
    shuffleOptions: quiz?.shuffleOptions ?? false,
    negativeMarks: String(quiz?.negativeMarks ?? 0),
    certificateEnabled: quiz?.certificateEnabled ?? true,
  });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const payload = {
      title: form.title,
      description: form.description.trim() === '' ? null : form.description,
      // Send the name, not an id: the API resolves it case-insensitively and
      // creates the category only if it really is new.
      categoryName: form.categoryName,
      difficulty: form.difficulty,
      durationMinutes: Number(form.durationMinutes),
      passingScore: Number(form.passingScore),
      maxAttempts: Number(form.maxAttempts),
      thumbnailUrl: form.thumbnailUrl.trim() === '' ? null : form.thumbnailUrl,
      // A blank schedule bound is `null`, which is how a bound is removed.
      availableFrom: fromLocalInput(form.availableFrom),
      availableUntil: fromLocalInput(form.availableUntil),
      shuffleQuestions: form.shuffleQuestions,
      shuffleOptions: form.shuffleOptions,
      negativeMarks: Number(form.negativeMarks),
      certificateEnabled: form.certificateEnabled,
    };

    try {
      if (editing && quiz) {
        const res = await client.api.admin.quizzes[':id'].$patch({
          param: { id: quiz.id },
          json: payload,
        });

        if (!res.ok) {
          setError(parseApiFailure(await res.json()).message);
          return;
        }

        router.refresh();
        setError(null);
        setPending(false);
        return;
      }

      const res = await client.api.admin.quizzes.$post({ json: payload });

      if (!res.ok) {
        setError(parseApiFailure(await res.json()).message);
        return;
      }

      const created = await res.json();
      // Land on the edit screen so lifecycle actions (publish) are right there.
      router.push(`/admin/quizzes/${created.quiz.id}`);
      router.refresh();
    } catch (cause) {
      setError(toApiFailure(cause).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="title">Title</Label>
          <Input
            id="title"
            value={form.title}
            onChange={(event) => update('title', event.target.value)}
            placeholder="JavaScript Fundamentals"
            autoComplete="off"
            required
          />
          {editing ? (
            <p className="text-muted-foreground text-[11.5px]">
              Changing the title keeps the slug{' '}
              <code className="bg-muted rounded px-1 font-mono">{quiz?.slug}</code> stable.
            </p>
          ) : null}
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="description">Description</Label>
          <textarea
            id="description"
            value={form.description}
            onChange={(event) => update('description', event.target.value)}
            rows={3}
            maxLength={2000}
            placeholder="What this quiz covers, and who it is for."
            className="border-input bg-background focus-visible:ring-ring/50 w-full rounded-md border px-3 py-2 text-[13px] focus-visible:ring-[3px] focus-visible:outline-none"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="categoryName">Category</Label>
          <CategoryCombobox
            id="categoryName"
            categories={categories}
            value={form.categoryName}
            onChange={(value) => update('categoryName', value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="difficulty">Difficulty</Label>
          <Select
            id="difficulty"
            value={form.difficulty}
            onChange={(event) =>
              update('difficulty', event.target.value as AdminQuiz['difficulty'])
            }
          >
            <option value="EASY">Easy</option>
            <option value="MEDIUM">Medium</option>
            <option value="HARD">Hard</option>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="durationMinutes">Duration (minutes)</Label>
          <Input
            id="durationMinutes"
            type="number"
            min={1}
            max={180}
            value={form.durationMinutes}
            onChange={(event) => update('durationMinutes', event.target.value)}
            required
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="passingScore">Passing score (%)</Label>
          <Input
            id="passingScore"
            type="number"
            min={0}
            max={100}
            value={form.passingScore}
            onChange={(event) => update('passingScore', event.target.value)}
            required
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="maxAttempts">Maximum attempts</Label>
          <Input
            id="maxAttempts"
            type="number"
            min={1}
            max={10}
            value={form.maxAttempts}
            onChange={(event) => update('maxAttempts', event.target.value)}
            required
          />
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="thumbnailUrl">Thumbnail URL (optional)</Label>
          <Input
            id="thumbnailUrl"
            value={form.thumbnailUrl}
            onChange={(event) => update('thumbnailUrl', event.target.value)}
            placeholder="https://…"
            autoComplete="off"
          />
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/*  How the paper is sat                                              */}
      {/* ------------------------------------------------------------------ */}
      <fieldset className="border-border/60 space-y-4 rounded-xl border p-4">
        <legend className="cine-label px-1.5 text-[9px] text-gray-400">Paper rules</legend>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="negativeMarks">Penalty per wrong answer</Label>
            <Input
              id="negativeMarks"
              type="number"
              min={0}
              max={10}
              step="0.25"
              value={form.negativeMarks}
              onChange={(event) => update('negativeMarks', event.target.value)}
            />
            <p className="text-muted-foreground text-[11px] leading-relaxed">
              Marks deducted for each incorrect answer. Unanswered questions are never penalised. 0
              turns the penalty off.
            </p>
          </div>

          <div className="space-y-3 pt-1">
            <label className="flex items-start gap-2.5 text-[12.5px]">
              <input
                type="checkbox"
                checked={form.shuffleQuestions}
                onChange={(event) => update('shuffleQuestions', event.target.checked)}
                className="accent-foreground mt-0.5 size-4"
              />
              <span>
                Shuffle questions
                <span className="text-muted-foreground block text-[11px]">
                  Each attempt gets its own order, frozen when the paper starts.
                </span>
              </span>
            </label>

            <label className="flex items-start gap-2.5 text-[12.5px]">
              <input
                type="checkbox"
                checked={form.shuffleOptions}
                onChange={(event) => update('shuffleOptions', event.target.checked)}
                className="accent-foreground mt-0.5 size-4"
              />
              <span>
                Shuffle options
                <span className="text-muted-foreground block text-[11px]">
                  Answers stop being in the same position on everyone&apos;s screen.
                </span>
              </span>
            </label>

            <label className="flex items-start gap-2.5 text-[12.5px]">
              <input
                type="checkbox"
                checked={form.certificateEnabled}
                onChange={(event) => update('certificateEnabled', event.target.checked)}
                className="accent-foreground mt-0.5 size-4"
              />
              <span>
                Issue certificates
                <span className="text-muted-foreground block text-[11px]">
                  A pass earns a verifiable certificate and an email.
                </span>
              </span>
            </label>
          </div>
        </div>
      </fieldset>

      {/* ------------------------------------------------------------------ */}
      {/*  When it can be sat                                                */}
      {/* ------------------------------------------------------------------ */}
      <fieldset className="border-border/60 space-y-4 rounded-xl border p-4">
        <legend className="cine-label px-1.5 text-[9px] text-gray-400">Availability</legend>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="availableFrom">Opens</Label>
            <Input
              id="availableFrom"
              type="datetime-local"
              value={form.availableFrom}
              onChange={(event) => update('availableFrom', event.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="availableUntil">Closes</Label>
            <Input
              id="availableUntil"
              type="datetime-local"
              value={form.availableUntil}
              onChange={(event) => update('availableUntil', event.target.value)}
            />
          </div>
        </div>

        <p className="text-muted-foreground text-[11.5px] leading-relaxed">
          Both are optional and mean the quiz&apos;s own timezone — leave them empty for a quiz that
          is always open. Students see the window on the quiz card, and the API refuses a start
          outside it. An attempt that began while the quiz was open can still be finished.
        </p>
      </fieldset>

      {error ? (
        <div
          role="alert"
          className="border-destructive/30 bg-destructive/10 text-destructive rounded-lg border px-3 py-2 text-[12.5px]"
        >
          {error}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : <Save />}
          {editing ? 'Save changes' : 'Create quiz'}
        </Button>
        <Link
          href="/admin/quizzes"
          className={cn(buttonVariants({ variant: 'ghost', size: 'default' }))}
        >
          Cancel
        </Link>
        {!editing ? (
          <span className="text-muted-foreground text-[11.5px]">
            New quizzes start as a draft — publish them once they have questions.
          </span>
        ) : null}
      </div>
    </form>
  );
}
