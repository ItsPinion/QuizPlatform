import type { LandingPayload } from '@quiz/shared/landing';
import { ArrowUpRight } from 'lucide-react';
import Link from 'next/link';

const REPO = 'https://github.com/ItsPinion/QuizPlatform';

const COLUMNS: { title: string; links: { label: string; href: string; external?: boolean }[] }[] = [
  {
    title: 'Product',
    links: [
      { label: 'Take a quiz', href: '/login' },
      { label: 'Create an account', href: '/register' },
      { label: 'Admin console', href: '/login?next=/admin' },
    ],
  },
  {
    title: 'Under the hood',
    links: [
      { label: 'README', href: `${REPO}#readme`, external: true },
      { label: 'Security model', href: `${REPO}/blob/main/docs/security.md`, external: true },
      { label: 'Deployment', href: `${REPO}/blob/main/docs/deployment.md`, external: true },
      { label: 'Testing', href: `${REPO}/blob/main/docs/testing.md`, external: true },
    ],
  },
  {
    title: 'Live',
    links: [
      { label: 'API health', href: '/api/health' },
      { label: 'Database readiness', href: '/api/health/db' },
      { label: 'API index', href: '/api/meta' },
      { label: 'Source on GitHub', href: REPO, external: true },
    ],
  },
];

/**
 * Footer.
 *
 * Where the documentation lives — the landing page links to it instead of
 * reproducing it. Everything external opens in a new tab so a visitor never loses
 * the demo.
 */
export function SiteFooter({ payload }: { payload?: LandingPayload | null } = {}) {
  const runtime = payload
    ? [
        `v${payload.service.version}`,
        payload.service.runtime,
        `${payload.database.target} database`,
      ].join(' · ')
    : null;

  const database = payload
    ? `${payload.database.urlHint} · ${payload.database.latencyMs === null ? 'no answer' : `${Math.round(payload.database.latencyMs)} ms`}`
    : null;

  return (
    <footer className="border-border/60 border-t">
      <div className="mx-auto w-full max-w-6xl px-5 py-12 sm:px-8">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_repeat(3,0.9fr)]">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="bg-primary text-primary-foreground grid size-7 place-items-center rounded-md text-[11px] font-bold">
                Q
              </span>
              <span className="text-[13.5px] font-semibold tracking-tight">QuizPlatform</span>
            </div>
            <p className="text-muted-foreground mt-3 max-w-xs text-[11.5px] leading-relaxed">
              Quiz management and online assessment: a Next.js front end, a Hono API and Drizzle
              over libSQL — built in the open, tested end to end.
            </p>
            {runtime ? (
              <p className="text-muted-foreground/70 mt-4 font-mono text-[10px]">{runtime}</p>
            ) : null}
          </div>

          {COLUMNS.map((column) => (
            <div key={column.title}>
              <h3 className="text-muted-foreground text-[10px] font-medium tracking-[0.16em] uppercase">
                {column.title}
              </h3>
              <ul className="mt-3 space-y-2">
                {column.links.map((link) => (
                  <li key={link.label}>
                    {link.external ? (
                      <a
                        href={link.href}
                        target="_blank"
                        rel="noreferrer"
                        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-[12px] transition-colors"
                      >
                        {link.label}
                        <ArrowUpRight className="size-2.5" />
                      </a>
                    ) : (
                      <Link
                        href={link.href}
                        className="text-muted-foreground hover:text-foreground text-[12px] transition-colors"
                      >
                        {link.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="border-border/50 text-muted-foreground/70 mt-10 flex flex-col gap-2 border-t pt-5 text-[10.5px] sm:flex-row sm:items-center sm:justify-between">
          <span>
            Quiz Management &amp; Online Assessment Platform · demo data, not a production tenant
          </span>
          {database ? <span className="truncate font-mono">{database}</span> : null}
        </div>
      </div>
    </footer>
  );
}
