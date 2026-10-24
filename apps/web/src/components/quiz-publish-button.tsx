'use client';

import { CircleCheck, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { client } from '@/lib/api';
import { parseApiFailure, toApiFailure } from '@/lib/api-error';
import { publishBlocker } from '@/lib/quiz-params';

/**
 * One click from "draft" to "live", where the draft is.
 *
 * The console already had a Publish button, three cards down the right-hand
 * column of the edit screen. That is a long way from the row that says `DRAFT`,
 * and the failure it produces is the worst kind: the admin believes they made a
 * quiz, and the catalogue they land on afterwards does not have it. This button
 * lives in the list and in the banner at the top of the edit screen, so
 * "published" and "visible to students" are one click apart everywhere.
 *
 * The rule is the API's (`QUIZ_HAS_NO_QUESTIONS`), mirrored here only so the
 * disabled button can explain itself.
 */
export function QuizPublishButton({
  quizId,
  questionCount,
  size = 'sm',
  variant = 'default',
  label = 'Publish',
}: {
  quizId: string;
  questionCount: number;
  size?: 'sm' | 'lg';
  variant?: 'default' | 'outline' | 'secondary';
  label?: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const blocker = publishBlocker(questionCount);

  async function publish() {
    setPending(true);
    setError(null);

    try {
      const res = await client.api.admin.quizzes[':id'].publish.$post({ param: { id: quizId } });

      if (!res.ok) {
        setError(parseApiFailure(await res.json()).message);
        return;
      }

      router.refresh();
    } catch (cause) {
      setError(toApiFailure(cause).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <Button
        size={size}
        variant={variant}
        disabled={pending || blocker !== null}
        title={blocker ?? 'Make this quiz visible to students'}
        onClick={publish}
      >
        {pending ? <Loader2 className="animate-spin" /> : <CircleCheck />}
        {label}
      </Button>
      {error ? (
        <span role="alert" className="text-destructive text-[11px]">
          {error}
        </span>
      ) : null}
    </span>
  );
}
