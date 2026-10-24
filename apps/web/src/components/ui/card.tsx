import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * The surface everything in the console sits on.
 *
 * One change here restyles every card in the product, which is why the material
 * lives in `Card` rather than in each page: a 3% white film, a 1px hairline, a
 * 12px backdrop blur and a bright edge along the top. The blur does real work —
 * the pages sit over the ambient bloom, and glass lets that light through
 * instead of painting over it.
 */
function Card({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card"
      className={cn(
        'text-card-foreground relative flex flex-col gap-6 rounded-2xl border border-white/10 bg-white/[0.03] py-6',
        'shadow-[inset_0_1px_0_0_rgba(255,255,255,0.07),0_24px_60px_-40px_rgba(0,0,0,0.9)]',
        'backdrop-blur-xl transition-colors duration-300',
        className,
      )}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-header"
      className={cn('flex flex-col gap-1.5 px-6', className)}
      {...props}
    />
  );
}

function CardTitle({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-title"
      className={cn(
        'font-display text-[1.15rem] leading-tight font-light tracking-tight',
        className,
      )}
      {...props}
    />
  );
}

function CardDescription({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-description"
      className={cn('text-[13px] leading-relaxed font-light text-gray-400', className)}
      {...props}
    />
  );
}

function CardContent({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="card-content" className={cn('px-6', className)} {...props} />;
}

function CardFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div data-slot="card-footer" className={cn('flex items-center px-6', className)} {...props} />
  );
}

export { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle };
