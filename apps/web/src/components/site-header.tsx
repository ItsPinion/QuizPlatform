import { ArrowUpRight } from 'lucide-react';
import Link from 'next/link';

import { SessionNav } from '@/components/session-nav';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** Landing-page anchors. Prefixed with `/` so they work from inside the app too. */
const SECTIONS = [
  { href: '/#platform', label: 'Platform' },
  { href: '/#tour', label: 'Tour' },
];

export function SiteHeader() {
  return (
    <header className="border-border/70 bg-background/80 sticky top-0 z-50 border-b backdrop-blur-xl">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-5 sm:px-8">
        <Link href="/" className="group flex items-center gap-3">
          <span className="bg-primary text-primary-foreground shadow-primary/80 relative grid size-9 place-items-center rounded-lg text-sm font-bold shadow-[0_10px_30px_-12px]">
            Q
            <span className="absolute inset-0 rounded-lg ring-1 ring-white/15" />
          </span>
          <span className="flex items-baseline gap-2">
            <span className="text-[15px] font-semibold tracking-tight">QuizPlatform</span>
            <span className="text-muted-foreground hidden font-mono text-[11px] sm:inline">
              v0.1.0
            </span>
          </span>
        </Link>

        <nav className="flex items-center gap-1.5 sm:gap-2">
          <div className="text-muted-foreground mr-1 hidden items-center gap-1 md:flex">
            {SECTIONS.map((section) => (
              <a
                key={section.href}
                href={section.href}
                className="hover:text-foreground rounded-md px-2 py-1 text-[12px] transition-colors"
              >
                {section.label}
              </a>
            ))}
            <a
              href="https://github.com/ItsPinion/QuizPlatform#readme"
              target="_blank"
              rel="noreferrer"
              className="hover:text-foreground inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12px] transition-colors"
            >
              Docs
              <ArrowUpRight className="size-3" />
            </a>
          </div>
          <a
            href="/api/health"
            target="_blank"
            rel="noreferrer"
            className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
          >
            API health
            <ArrowUpRight />
          </a>
          <span className="bg-border hidden h-6 w-px sm:block" aria-hidden="true" />
          <SessionNav />
        </nav>
      </div>
    </header>
  );
}
