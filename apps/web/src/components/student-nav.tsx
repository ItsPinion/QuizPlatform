'use client';

import { Gauge, LayoutDashboard, ListChecks, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Set for modules that are still on the roadmap — rendered, not clickable. */
  day?: number;
  prefix?: boolean;
}

const ITEMS: NavItem[] = [
  { href: '/student', label: 'Overview', icon: LayoutDashboard },
  { href: '/student/quizzes', label: 'Quizzes', icon: ListChecks, prefix: true },
  { href: '/student/results', label: 'Results', icon: Gauge, day: 9 },
];

/**
 * Student navigation.
 *
 * Same shape as the admin nav: active state from `usePathname`, and modules that
 * do not exist yet are shown disabled with their target day rather than as dead
 * links. `/student/attempt/*` is highlighted under Quizzes so a student always
 * knows where they are.
 */
export function StudentNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Student sections" className="lg:sticky lg:top-24">
      <ul className="flex gap-1.5 overflow-x-auto pb-1 lg:flex-col lg:gap-1 lg:overflow-visible lg:pb-0">
        {ITEMS.map((item) => {
          const active =
            pathname === item.href ||
            (item.prefix === true &&
              (pathname.startsWith(`${item.href}/`) || pathname.startsWith('/student/attempt')));

          if (item.day !== undefined) {
            return (
              <li key={item.href} className="shrink-0">
                <span
                  aria-disabled="true"
                  className="text-muted-foreground/60 flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-[13px]"
                >
                  <span className="flex items-center gap-2.5">
                    <item.icon className="size-4" />
                    {item.label}
                  </span>
                  <Badge variant="outline" className="text-[10px]">
                    Day {item.day}
                  </Badge>
                </span>
              </li>
            );
          }

          return (
            <li key={item.href} className="shrink-0">
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium whitespace-nowrap transition-colors',
                  active
                    ? 'bg-primary/15 text-primary ring-primary/25 ring-1'
                    : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
                )}
              >
                <item.icon className="size-4" />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
