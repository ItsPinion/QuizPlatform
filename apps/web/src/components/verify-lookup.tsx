'use client';

import { normalizeCertificateCode } from '@quiz/shared/certificate';
import { ArrowRight, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * "Check another code".
 *
 * A plain form that navigates to `/verify/<code>`, not a fetch: the result is a
 * page, so the URL should change and the answer should be linkable and
 * reloadable. One shared field renders both the spaces and the dashes people
 * copy out of a certificate.
 */
export function VerifyLookup() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalized = normalizeCertificateCode(code);

    if (normalized.length < 4) {
      setError('A certificate code looks like QP-AB12-CD34.');
      return;
    }

    setError(null);
    setPending(true);
    router.push(`/verify/${encodeURIComponent(normalized)}`);
  }

  return (
    <form onSubmit={submit} className="mt-7 space-y-3">
      <div className="space-y-2">
        <Label htmlFor="verify-code">Certificate code</Label>
        <Input
          id="verify-code"
          name="code"
          value={code}
          onChange={(event) => {
            setCode(event.target.value);
            if (error) setError(null);
          }}
          placeholder="QP-AB12-CD34"
          autoComplete="off"
          spellCheck={false}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'verify-code-error' : 'verify-code-hint'}
          className="h-12 font-mono text-[15px] tracking-[0.12em] uppercase"
          autoFocus
        />
        <p id="verify-code-hint" className="text-muted-foreground text-[12.5px]">
          Printed at the top of the certificate, and in the email that delivered it.
        </p>
        {error ? (
          <p id="verify-code-error" role="alert" className="text-destructive text-[12.5px]">
            {error}
          </p>
        ) : null}
      </div>

      <Button type="submit" size="lg" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : null}
        Verify
        <ArrowRight aria-hidden />
      </Button>
    </form>
  );
}
