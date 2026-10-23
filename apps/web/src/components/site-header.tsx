import { ArrowUpRight } from 'lucide-react';
import Link from 'next/link';

import { Logo } from '@/components/brand/logo';
import { MusicToggle } from '@/components/music-toggle';
import { SessionNav } from '@/components/session-nav';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** Landing-page anchors. Prefixed with `/` so they work from inside the app too. */
const SECTIONS = [
  { href: '/#platform', label: 'Platform' },
  { href: '/#tour', label: 'Tour' },
];

export function SiteHeader({ version }: { version?: string } = {}) {
  return (
    <header className="border-border/70 bg-background/80 sticky top-0 z-50 border-b backdrop-blur-xl">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-5 sm:px-8">
        <Link href="/" aria-label="QuizPlatform — home" className="group flex items-center gap-3">
          <Logo
            version={version}
            markClassName="size-9 transition-transform duration-500 group-hover:rotate-[-4deg] group-hover:scale-105"
          />
        </Link>

        <nav className="flex items-center gap-1.5 sm:gap-2">
          <div className="text-muted-foreground mr-1 hidden items-center gap-1 md:flex">
            {SECTIONS.map((section) => (
              <a
                key={section.href}
                href={section.href}
                className="hover:text-foreground rounded-md px-2.5 py-1.5 text-[13px] transition-colors"
              >
                {section.label}
              </a>
            ))}
            <a
              href="https://github.com/ItsPinion/QuizPlatform#readme"
              target="_blank"
              rel="noreferrer"
              className="hover:text-foreground inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-[13px] transition-colors"
            >
              Docs
              <ArrowUpRight className="size-3" />
            </a>
          </div>
          <MusicToggle />
          <a
            href="/api/health"
            target="_blank"
            rel="noreferrer"
            className={cn(
              buttonVariants({ variant: 'outline', size: 'sm' }),
              'hidden sm:inline-flex',
            )}
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
