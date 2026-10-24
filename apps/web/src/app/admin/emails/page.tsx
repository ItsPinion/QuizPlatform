import type { OutboxResponse } from '@quiz/shared/email';
import { Clock, Mail, MailCheck, MailWarning, Send } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { PageHeader } from '@/components/cinema/page-header';
import { StatCard } from '@/components/stat-card';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { serverApi } from '@/lib/api-server';
import { decideAccess } from '@/lib/guards';
import { getSession } from '@/lib/session';
import { cn } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'Email — Admin console',
  description: 'Every message the platform has queued, who it went to and whether it was sent.',
};

const KINDS = ['WELCOME', 'PASSWORD_RESET', 'RESULT', 'CERTIFICATE'] as const;
const STATUSES = ['QUEUED', 'SENT', 'FAILED'] as const;

const STATUS_TONE = {
  QUEUED: 'warning',
  SENT: 'success',
  FAILED: 'destructive',
} as const;

function one(value: string | string[] | undefined, fallback = ''): string {
  const raw = (Array.isArray(value) ? value[0] : value)?.trim() ?? '';
  return raw === '' ? fallback : raw;
}

/**
 * The outbox.
 *
 * The platform never blocks a request on a mail server: it writes the message it
 * would have sent and moves on. That decision is only honest if the messages are
 * visible somewhere, so this screen is the other half of it — what was queued, to
 * whom, when, and whether the transport accepted it.
 *
 * The bodies are plain text, shown in a `<details>` rather than a modal: an
 * administrator reading a failing welcome mail wants to select and copy it, and a
 * native disclosure is the cheapest control that keeps the keyboard contract
 * intact.
 */
export default async function AdminEmailsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const decision = decideAccess(await getSession(), 'ADMIN', '/admin/emails');
  if (!decision.allowed) redirect(decision.redirectTo);

  const params = await searchParams;
  const kind = one(params.kind);
  const status = one(params.status);
  const page = Math.max(1, Number(one(params.page, '1')) || 1);

  let data: OutboxResponse | null = null;

  try {
    const res = await (
      await serverApi()
    ).api.admin.emails.$get({
      query: {
        ...(kind ? { kind: kind as (typeof KINDS)[number] } : {}),
        ...(status ? { status: status as (typeof STATUSES)[number] } : {}),
        page: String(page),
      },
    });
    if (res.ok) data = await res.json();
  } catch {
    data = null;
  }

  const filtered = Boolean(kind || status);

  function href(overrides: Record<string, string>): string {
    const queries = new URLSearchParams();
    if (kind) queries.set('kind', kind);
    if (status) queries.set('status', status);

    for (const [key, value] of Object.entries(overrides)) {
      if (value) queries.set(key, value);
      else queries.delete(key);
    }

    const qs = queries.toString();

    return qs ? `/admin/emails?${qs}` : '/admin/emails';
  }

  return (
    <div className="space-y-8">
      <PageHeader
        label="Admin console · delivery"
        title="Email"
        description="Everything the platform has queued — welcome notes, reset links, results and certificates. A request never waits for a mail server, so this is the record of what would have left the building."
        aside={
          <>
            <Badge variant="outline" className="gap-1.5">
              <Mail />
              outbox
            </Badge>
            {data ? <Badge variant="outline">{data.counts.total} messages</Badge> : null}
          </>
        }
      />

      {data ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Sent"
            value={data.counts.sent}
            hint="Accepted by the transport"
            icon={MailCheck}
            tone="success"
          />
          <StatCard
            label="Queued"
            value={data.counts.queued}
            hint="Waiting for the sender"
            icon={Send}
            tone="warning"
          />
          <StatCard
            label="Failed"
            value={data.counts.failed}
            hint="The transport refused them"
            icon={MailWarning}
            tone={data.counts.failed > 0 ? 'destructive' : 'default'}
          />
          <StatCard
            label="Total"
            value={data.counts.total}
            hint="Every message ever written"
            icon={Mail}
          />
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <FilterChips
          label="Kind"
          options={KINDS}
          active={kind}
          clearHref={href({ kind: '' })}
          hrefFor={(value) => href({ kind: value, page: '' })}
        />
        <FilterChips
          label="Status"
          options={STATUSES}
          active={status}
          clearHref={href({ status: '' })}
          hrefFor={(value) => href({ status: value, page: '' })}
        />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">
            {filtered ? 'Messages matching the filters' : 'The whole outbox'}
          </CardTitle>
          <CardDescription className="text-[11.5px]">
            Newest first. Open a message to read exactly what was written.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          {data && data.emails.length > 0 ? (
            <ul className="divide-border/60 divide-y">
              {data.emails.map((email) => (
                <li key={email.id} className="px-4 py-3">
                  <details className="group">
                    <summary className="flex cursor-pointer flex-wrap items-start justify-between gap-3 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-white/40">
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-2 text-[13px]">
                          <span className="font-medium">{email.subject}</span>
                          <Badge variant="outline" className="text-[10px]">
                            {email.kind}
                          </Badge>
                          <Badge variant={STATUS_TONE[email.status]} className="text-[10px]">
                            {email.status}
                          </Badge>
                        </p>
                        <p className="text-muted-foreground mt-1 truncate text-[11.5px]">
                          {email.to} ·{' '}
                          {new Date(email.createdAt).toLocaleString(undefined, {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          })}
                          {email.error ? ` · ${email.error}` : ''}
                        </p>
                      </div>
                      <span className="text-muted-foreground inline-flex items-center gap-1.5 text-[11.5px] group-open:hidden">
                        <Clock aria-hidden className="size-3" />
                        Read
                      </span>
                    </summary>

                    <pre className="border-border/60 bg-muted/30 mt-3 max-h-72 overflow-auto rounded-lg border p-3 text-[12px] leading-relaxed whitespace-pre-wrap">
                      {email.body}
                    </pre>

                    {email.relatedId ? (
                      <p className="text-muted-foreground mt-2 font-mono text-[10.5px]">
                        related: {email.relatedId}
                      </p>
                    ) : null}
                  </details>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground px-6 py-12 text-center text-[13px]">
              {filtered
                ? 'No message matches these filters.'
                : 'The outbox is empty. Register a student or submit an attempt and the first message will appear here.'}
            </p>
          )}

          {data && data.emails.length > 0 ? (
            <nav
              aria-label="Outbox pages"
              className="border-border/60 flex items-center justify-between gap-3 border-t px-4 py-3 text-[12.5px]"
            >
              <span className="text-muted-foreground">Page {page}</span>
              <div className="flex gap-2">
                {page > 1 ? (
                  <Link
                    href={href({ page: String(page - 1) })}
                    className="rounded-full border border-white/20 px-3 py-1.5 transition-colors hover:border-white/40"
                  >
                    Previous
                  </Link>
                ) : null}
                {data.emails.length >= 25 ? (
                  <Link
                    href={href({ page: String(page + 1) })}
                    className="rounded-full border border-white/20 px-3 py-1.5 transition-colors hover:border-white/40"
                  >
                    Next
                  </Link>
                ) : null}
              </div>
            </nav>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

/** One row of links: every kind (or status), plus "all". */
function FilterChips({
  label,
  options,
  active,
  hrefFor,
  clearHref,
}: {
  label: string;
  options: readonly string[];
  active: string;
  hrefFor: (value: string) => string;
  clearHref: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="cine-label mr-1 text-[9px] text-gray-500">{label}</span>
      <Link
        href={clearHref}
        aria-current={active === '' ? 'true' : undefined}
        className={cn(
          'rounded-full border px-2.5 py-1 text-[11px] transition-colors',
          active === ''
            ? 'border-white/30 bg-white/10 text-white'
            : 'border-white/12 text-gray-400 hover:border-white/25 hover:text-white',
        )}
      >
        All
      </Link>
      {options.map((option) => (
        <Link
          key={option}
          href={hrefFor(option)}
          aria-current={active === option ? 'true' : undefined}
          className={cn(
            'rounded-full border px-2.5 py-1 text-[11px] transition-colors',
            active === option
              ? 'border-white/30 bg-white/10 text-white'
              : 'border-white/12 text-gray-400 hover:border-white/25 hover:text-white',
          )}
        >
          {option}
        </Link>
      ))}
    </div>
  );
}
