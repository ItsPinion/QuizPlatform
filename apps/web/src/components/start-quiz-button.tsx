'use client';

import { CirclePlay, Loader2, RotateCcw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { client } from '@/lib/api';
import { parseApiFailure, toApiFailure } from '@/lib/api-error';

interface Props {
  quizId: string;
  /** True when the API reported a live attempt for this quiz. */
  resuming: boolean;
  disabled: boolean;
}

/**
 * Start / resume.
 *
 * The button never decides anything: it posts and follows whatever comes back.
 * Starting twice is safe — the API returns the attempt already in flight — so a
 * double click or a slow network cannot cost a try.
 */
export function StartQuizButton({ quizId, resuming, disabled }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setPending(true);
    setError(null);

    try {
      const res = await client.api.student.quizzes[':id'].start.$post({ param: { id: quizId } });

      if (!res.ok) {
        setError(parseApiFailure(await res.json()).message);
        return;
      }

      const body = await res.json();
      router.push(`/student/attempt/${body.attemptId}`);
    } catch (cause) {
      setError(toApiFailure(cause).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button onClick={start} disabled={disabled || pending} size="lg" className="w-full sm:w-auto">
        {pending ? <Loader2 className="animate-spin" /> : resuming ? <RotateCcw /> : <CirclePlay />}
        {resuming ? 'Resume attempt' : 'Start quiz'}
      </Button>

      {error ? (
        <p
          role="alert"
          className="border-destructive/30 bg-destructive/10 text-destructive rounded-lg border px-3 py-2 text-[12.5px]"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
