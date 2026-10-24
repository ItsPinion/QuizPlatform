'use client';

import {
  BarChart3,
  FolderTree,
  Gauge,
  LayoutDashboard,
  ListChecks,
  Server,
  Trophy,
  Users,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@/lib/utils';

/**
 * The icons a rail item may use, by name.
 *
 * They are named rather than passed as components because this file is a client
 * boundary and a layout is a server one: a component is a function, and a
 * function cannot cross that line. A string can.
 */
const ICONS = {
  overview: LayoutDashboard,
  users: Users,
  quizzes: ListChecks,
  categories: FolderTree,
  analytics: BarChart3,
  system: Server,
  results: Gauge,
  leaderboard: Trophy,
} satisfies Record<string, LucideIcon>;

export type SectionIcon = keyof typeof ICONS;

export interface SectionNavItem {
  href: string;
  label: string;
  icon: SectionIcon;
  /** Highlight on nested routes too (`/admin/quizzes/:id`). */
  prefix?: boolean;
  /** An extra path that should light this item up (`/student/attempt`). */
  also?: string;
}

/**
 * The side navigation, for both consoles.
 *
 * There used to be two of these — `admin-nav` and `student-nav` — identical
 * except for their lists, which is the kind of duplication that drifts: one
 * gains a hover state, the other gains a fix. It is one component now, and the
 * list is the only thing a role supplies.
 *
 * On a wide screen it is a rail: a hairline down the left, each item a row, the
 * current one marked by the line turning white and the label following it. On a
 * phone the rail becomes a horizontal scroller of pills, because a vertical
 * menu above the content pushes the actual page below the fold.
 */
export function SectionNav({
  label,
  items,
}: {
  /** The nav's accessible name — "Admin sections", "Student sections". */
  label: string;
  items: readonly SectionNavItem[];
}) {
  const pathname = usePathname();

  return (
    // `min-w-0` matters on a phone: this is a grid item wrapping a horizontal
    // scroller, and a grid track's default `min-width: auto` would let the rail
    // widen the whole page instead of scrolling inside it.
    <nav aria-label={label} className="min-w-0 lg:sticky lg:top-28 lg:self-start">
      <ul className="flex w-full scrollbar-none gap-2 overflow-x-auto pb-1 lg:flex-col lg:gap-0.5 lg:overflow-visible lg:border-l lg:border-white/10 lg:pb-0">
        {items.map((item) => {
          const Icon = ICONS[item.icon];
          const active =
            pathname === item.href ||
            (item.prefix === true && pathname.startsWith(`${item.href}/`)) ||
            (item.also !== undefined && pathname.startsWith(item.also));

          return (
            <li key={item.href} className="shrink-0">
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'group flex items-center gap-2.5 rounded-full border px-3.5 py-2 whitespace-nowrap transition-colors duration-200',
                  'cine-label text-[9.5px]',
                  'lg:-ml-px lg:rounded-none lg:rounded-r-lg lg:border-y-0 lg:border-r-0 lg:border-l lg:px-4 lg:py-2.5',
                  'focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:outline-none',
                  active
                    ? 'border-white/25 bg-white/8 text-white lg:border-l-white lg:bg-white/6'
                    : 'border-transparent text-gray-400 hover:bg-white/4 hover:text-white',
                )}
              >
                <Icon
                  aria-hidden
                  className={cn(
                    'size-3.5 transition-colors',
                    active ? 'text-white' : 'text-gray-500 group-hover:text-gray-300',
                  )}
                />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
