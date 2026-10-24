import type { LandingPayload } from '@quiz/shared/landing';
import {
  QUESTION_TYPE_HINTS,
  QUESTION_TYPE_LABELS,
  type QuestionType,
} from '@quiz/shared/question-type';

import { SectionHeading } from '@/components/landing/section-heading';
import { cn } from '@/lib/utils';

/**
 * "Four ways to ask" — the formats section of the landing page.
 *
 * §10's question types are the part of this product that is easiest to *say* and
 * hardest to *show* in a count, so this block shows the controls instead: a row
 * of radios, a row of checkboxes, two true/false buttons, a blank line. Each
 * card carries the number of questions of that format in the bank, which is a
 * `SELECT type, count(*)` from the same request as every other figure on the
 * page (`payload.formats`). A format with nothing authored yet still appears,
 * with a zero — that is the honest state of this database, and hiding it would
 * make the page look like it supports three formats on a quiet day.
 *
 * The labels and the one-line hints come from `@quiz/shared/question-type`, the
 * same constants the authoring form and the review screen read, so the marketing
 * page cannot describe a format differently from the product.
 */

/** The tiny control sketch above each label. Purely decorative — hidden from AT. */
function Sketch({ type }: { type: QuestionType }) {
  if (type === 'MULTI') {
    return (
      <div className="flex items-center gap-1.5">
        {[0, 1, 2].map((index) => (
          <span
            key={index}
            className={cn(
              'size-2.5 rounded-[3px] border',
              index === 2 ? 'border-white/70 bg-white/70' : 'border-white/25',
            )}
          />
        ))}
      </div>
    );
  }

  if (type === 'TRUE_FALSE') {
    return (
      <div className="flex items-center gap-1">
        <span className="rounded-full border border-white/60 px-2 py-px font-mono text-[8px] text-white">
          T
        </span>
        <span className="rounded-full border border-white/20 px-2 py-px font-mono text-[8px] text-white/40">
          F
        </span>
      </div>
    );
  }

  if (type === 'FILL_BLANK') {
    return (
      <div className="flex items-center gap-1.5">
        <span className="h-px w-10 bg-white/50" />
        <span className="size-3 animate-pulse rounded-[1px] bg-white/70 motion-reduce:animate-none" />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      {[0, 1, 2].map((index) => (
        <span
          key={index}
          className={cn(
            'size-2.5 rounded-full border',
            index === 0 ? 'border-white/70 bg-white/70' : 'border-white/25',
          )}
        />
      ))}
    </div>
  );
}

/** `41 in the bank`, `1 in the bank`, or an em dash when the API did not answer. */
function bankLabel(count: number | undefined): string {
  if (count === undefined) return '—';
  return `${count} in the bank`;
}

export function Formats({ payload }: { payload: LandingPayload | null }) {
  const counts = new Map((payload?.formats ?? []).map((format) => [format.type, format.questions]));

  // The same four, in the enum's order, drawn from the shared vocabulary rather
  // than from the payload — the section describes the product even when the
  // database is unreachable, and only the counts go blank.
  const formats = (Object.keys(QUESTION_TYPE_LABELS) as QuestionType[]).map((type) => ({
    type,
    label: QUESTION_TYPE_LABELS[type],
    hint: QUESTION_TYPE_HINTS[type],
    count: counts.get(type),
  }));

  return (
    <section id="formats" className="scroll-mt-32 border-b border-white/8">
      <div className="mx-auto w-full max-w-6xl px-6 py-20 sm:px-8 lg:py-28">
        <div className="flex flex-wrap items-end justify-between gap-8">
          <SectionHeading
            eyebrow="The questions"
            title="Four ways to ask. One honest score."
            description="Multiple choice is the easy half. The platform also grades a set of answers, a true-or-false statement and a typed one — through the same clock, the same negative marking and the same review screen, so a mixed paper reads as one paper."
          />
          <p className="max-w-[15rem] text-[11px] leading-relaxed font-light text-gray-500">
            Any of the four can carry an image or a code block above the prompt. The counts are live
            rows from the question bank.
          </p>
        </div>

        <ul className="mt-12 grid gap-px overflow-hidden border-y border-white/10 bg-white/10 sm:grid-cols-2 lg:grid-cols-4">
          {formats.map((format, index) => (
            <li
              key={format.type}
              style={{ '--reveal-delay': `${index * 70}ms` } as React.CSSProperties}
              className="reveal group relative flex flex-col justify-between gap-8 bg-black px-5 py-6 transition-colors duration-300 hover:bg-white/[0.035] lg:px-6 lg:py-7"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="cine-label text-[9px] text-gray-500 tabular-nums">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span aria-hidden className="opacity-80 transition-opacity group-hover:opacity-100">
                  <Sketch type={format.type} />
                </span>
              </div>

              <div>
                <h3 className="font-display text-lg leading-tight font-light tracking-tight text-white">
                  {format.label}
                </h3>
                <p className="mt-2 text-[11.5px] leading-relaxed font-light text-gray-400">
                  {format.hint}
                </p>
              </div>

              <p className="text-[10.5px] tracking-[0.08em] text-gray-500 uppercase tabular-nums">
                {bankLabel(format.count)}
              </p>
            </li>
          ))}
        </ul>

        <p className="mt-6 max-w-2xl text-[11.5px] leading-relaxed font-light text-gray-500">
          The grader treats them differently on purpose: a multiple-answer question is right only
          when the whole set matches, a typed answer is compared after normalising case and spacing,
          and a blank typed answer is skipped rather than penalised.
        </p>
      </div>
    </section>
  );
}
