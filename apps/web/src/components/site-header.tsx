import { ArrowUpRight, Sparkles } from 'lucide-react';
import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

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

        <nav className="flex items-center gap-2">
          <Badge variant="outline" className="hidden gap-1.5 sm:inline-flex">
            <Sparkles className="text-primary" />
            Day 1 · scaffold complete
          </Badge>
          <a
            href="/api/health"
            target="_blank"
            rel="noreferrer"
            className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
          >
            API health
            <ArrowUpRight />
          </a>
        </nav>
      </div>
    </header>
  );
}
