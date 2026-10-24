'use client';

import { Loader2, RefreshCw, Send } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { client } from '@/lib/api';
import { parseApiFailure } from '@/lib/api-error';

/**
 * The two actions an outbox needs.
 *
 * A queue with no way to drain it is a log; a failed message with no way to
 * retry it is a mystery. Both call the same transport the original send used,
 * so what an administrator triggers here is exactly what a request would have
 * done — there is no second code path that only the console exercises.
 */
export function DrainOutboxButton({ queued }: { queued: number }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function drain() {
    setPending(true);
    setNote(null);

    try {
      const res = await client.api.admin.emails.drain.$post();

      if (!res.ok) {
        setNote(parseApiFailure(await res.json()).message);
        return;
      }

      const body = await res.json();
      setNote(`${body.sent} sent · ${body.remaining} still waiting`);
      router.refresh();
    } catch {
      setNote('Could not reach the server.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" onClick={() => void drain()} disabled={pending || queued === 0}>
        {pending ? <Loader2 aria-hidden className="animate-spin" /> : <Send aria-hidden />}
        Send {queued === 0 ? 'nothing' : `${queued} queued`}
      </Button>
      <span role="status" aria-live="polite" className="text-muted-foreground text-[11.5px]">
        {note ?? ''}
      </span>
    </div>
  );
}

export function RetryEmailButton({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function retry() {
    setPending(true);
    setNote(null);

    try {
      const res = await client.api.admin.emails[':id'].retry.$post({ param: { id } });

      if (!res.ok) {
        setNote(parseApiFailure(await res.json()).message);
        return;
      }

      const body = await res.json();
      setNote(body.status === 'SENT' ? 'Sent' : (body.error ?? 'Still failing'));
      router.refresh();
    } catch {
      setNote('Could not reach the server.');
    } finally {
      setPending(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <Button size="sm" variant="outline" onClick={() => void retry()} disabled={pending}>
        {pending ? <Loader2 aria-hidden className="animate-spin" /> : <RefreshCw aria-hidden />}
        {status === 'SENT' ? 'Resend' : 'Retry'}
      </Button>
      {note ? (
        <span role="status" className="text-muted-foreground text-[11px]">
          {note}
        </span>
      ) : null}
    </span>
  );
}
