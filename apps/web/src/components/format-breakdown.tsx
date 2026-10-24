import type { FormatBreakdown } from '@quiz/shared/submission';
import { QUESTION_TYPE_LABELS } from '@quiz/shared/question-type';

/**
 * "By format" — how a mixed paper went, question format by question format.
 *
 * Shared by the result card and the answer review so the two screens can never
 * disagree about the same attempt. It renders nothing when a paper used a single
 * format: a row saying "Multiple choice · 10 of 10 correct" beside a score of
 * 10/10 is noise, not information.
 *
 * The list arrives in `QUESTION_TYPES` order from the API — the same order the
 * authoring form lists them in — so two attempts of comparable papers read the
 * same way down the page.
 */
export function FormatBreakdownList({
  formats,
  className,
}: {
  formats: readonly FormatBreakdown[];
  className?: string;
}) {
  if (formats.length < 2) return null;

  return (
    <div className={className}>
      <p className="text-muted-foreground text-[10.5px] tracking-wider uppercase">By format</p>
      <ul className="mt-1 space-y-0.5 text-[12px]">
        {formats.map((format) => (
          <li key={format.type} className="flex items-center justify-between gap-3">
            <span>{QUESTION_TYPE_LABELS[format.type]}</span>
            <span className="text-muted-foreground tabular-nums">
              {format.correct} of {format.total} correct
              {format.unanswered > 0 ? ` · ${format.unanswered} skipped` : ''}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
