import { cn } from '@/lib/utils';

interface SectionHeadingProps {
  eyebrow: string;
  title: string;
  description?: string;
  className?: string;
}

export function SectionHeading({ eyebrow, title, description, className }: SectionHeadingProps) {
  return (
    <div className={cn('max-w-2xl', className)}>
      <div className="flex items-center gap-2">
        <span className="from-primary to-primary/0 glow-pulse h-px w-10 bg-gradient-to-r" />
        <span className="text-primary font-mono text-[11px] tracking-[0.18em] uppercase">
          {eyebrow}
        </span>
      </div>
      <h2 className="text-glow-soft mt-3 text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
        {title}
      </h2>
      {description ? (
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed sm:text-[15px]">
          {description}
        </p>
      ) : null}
    </div>
  );
}
