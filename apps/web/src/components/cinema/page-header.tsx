import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

/**
 * The top of a dashboard page.
 *
 * Same two voices as the landing page — an uppercase label at 20em tracking,
 * then the headline in Clash — so the console reads as the same product as the
 * page that got you here. The only difference is scale: 2.4rem, not 9rem.
 *
 * `aside` is for the one or two controls that belong to the page itself (a
 * "New quiz" button, a filter toggle). It sits on the same baseline as the
 * headline on a wide screen and wraps under it on a narrow one.
 */
export function PageHeader({
  label,
  title,
  description,
  aside,
  className,
}: {
  /** The micro label above the title: where you are. */
  label: string;
  title: ReactNode;
  description?: ReactNode;
  aside?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn('flex flex-wrap items-end justify-between gap-x-8 gap-y-6', className)}>
      <div className="max-w-2xl">
        <div className="flex items-center gap-4">
          <span aria-hidden className="h-px w-8 bg-white/25" />
          <span className="cine-label text-[10px] text-gray-400">{label}</span>
        </div>

        <h1 className="font-display mt-5 text-[2.35rem] leading-[1.02] font-extralight tracking-tight text-balance text-white sm:text-[3.1rem]">
          {title}
        </h1>

        {description ? (
          <p className="mt-4 text-sm leading-relaxed font-light text-gray-400 sm:text-[15px]">
            {description}
          </p>
        ) : null}
      </div>

      {aside ? <div className="flex flex-wrap items-center gap-2">{aside}</div> : null}
    </header>
  );
}

/**
 * A section inside a page: label, optional count, optional action.
 *
 * The count is passed as a string so a page can say "12" or "12 of 40" without
 * this component deciding anything about the data.
 */
export function SectionBar({
  label,
  count,
  action,
  className,
}: {
  label: string;
  count?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('mb-4 flex flex-wrap items-center justify-between gap-3', className)}>
      <div className="flex items-baseline gap-3">
        <h2 className="cine-label text-[10px] text-gray-400">{label}</h2>
        {count ? <span className="font-mono text-[10px] text-gray-400">{count}</span> : null}
      </div>
      {action}
    </div>
  );
}
