'use client';

import type { AdminQuiz } from '@quiz/shared/quiz';
import { CircleCheck, CircleSlash, Loader2, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { client } from '@/lib/api';
import { parseApiFailure, toApiFailure } from '@/lib/api-error';
import { deleteBlocker, publishBlocker } from '@/lib/quiz-params';

/**
 * Publish / unpublish / delete.
 *
 * The rules are mirrored from `@quiz/shared/quiz` so the UI can explain a
 * disabled button, but the API remains the authority — every action here is a
 * request that can still come back 409, and its message is shown verbatim.
 */
export function QuizActions({ quiz }: { quiz: AdminQuiz }) {
  const router = useRouter();
  const [pending, setPending] = useState<'publish' | 'unpublish' | 'delete' | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const publishBlock = publishBlocker(quiz.questionCount);
  const deleteBlock = deleteBlocker(quiz.attemptCount);

  async function run(action: 'publish' | 'unpublish' | 'delete') {
    setPending(action);
    setError(null);

    try {
      if (action === 'delete') {
        const res = await client.api.admin.quizzes[':id'].$delete({ param: { id: quiz.id } });

        if (!res.ok) {
          setError(parseApiFailure(await res.json()).message);
          return;
        }

        router.push('/admin/quizzes');
        router.refresh();
        return;
      }

      const res =
        action === 'publish'
          ? await client.api.admin.quizzes[':id'].publish.$post({ param: { id: quiz.id } })
          : await client.api.admin.quizzes[':id'].unpublish.$post({ param: { id: quiz.id } });

      if (!res.ok) {
        setError(parseApiFailure(await res.json()).message);
        return;
      }

      router.refresh();
    } catch (cause) {
      setError(toApiFailure(cause).message);
    } finally {
      setPending(null);
      setConfirmingDelete(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {quiz.status === 'PUBLISHED' ? (
          <Button
            variant="outline"
            size="sm"
            disabled={pending !== null}
            onClick={() => run('unpublish')}
          >
            {pending === 'unpublish' ? <Loader2 className="animate-spin" /> : <CircleSlash />}
            Unpublish
          </Button>
        ) : (
          <Button
            size="sm"
            disabled={pending !== null || publishBlock !== null}
            title={publishBlock ?? 'Make this quiz visible to students'}
            onClick={() => run('publish')}
          >
            {pending === 'publish' ? <Loader2 className="animate-spin" /> : <CircleCheck />}
            Publish
          </Button>
        )}

        {confirmingDelete ? (
          <>
            <Button
              variant="secondary"
              size="sm"
              disabled={pending !== null}
              onClick={() => run('delete')}
            >
              {pending === 'delete' ? <Loader2 className="animate-spin" /> : <Trash2 />}
              Confirm delete
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirmingDelete(false)}>
              Cancel
            </Button>
          </>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            disabled={pending !== null || deleteBlock !== null}
            title={deleteBlock ?? 'Delete this quiz and its questions'}
            onClick={() => setConfirmingDelete(true)}
          >
            <Trash2 />
            Delete
          </Button>
        )}
      </div>

      {publishBlock && quiz.status !== 'PUBLISHED' ? (
        <p className="text-muted-foreground text-[11.5px]">{publishBlock}.</p>
      ) : null}
      {deleteBlock ? <p className="text-muted-foreground text-[11.5px]">{deleteBlock}.</p> : null}

      {error ? (
        <div
          role="alert"
          className="border-destructive/30 bg-destructive/10 text-destructive rounded-lg border px-3 py-2 text-[12.5px]"
        >
          {error}
        </div>
      ) : null}
    </div>
  );
}
