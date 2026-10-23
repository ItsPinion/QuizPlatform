import type { LandingPayload } from '@quiz/shared/landing';
import {
  durationRangeLabel,
  passingRangeLabel,
  percentLabel,
  questionRangeLabel,
  uptimeLabel,
} from '@quiz/shared/landing';
import { ArrowUpRight, Database, Gauge, LayoutDashboard, Server, Timer, Users } from 'lucide-react';

import { BentoCard, BentoGrid } from '@/components/ui/bento';

/**
 * The showcase grid.
 *
 * Six cells, every figure computed from `/api/landing` on this request: no
 * "10 quizzes", no "51 tests", no invented ranges. `shape` is the API's own
 * summary of the published catalogue, so the clock card cannot claim a duration
 * that no quiz has.
 */

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-muted-foreground/80 font-mono text-[10px] tracking-[0.18em] uppercase">
      {children}
    </span>
  );
}

/** The arrow that leans toward the card on hover — the affordance, not decoration. */
function Go() {
  return (
    <ArrowUpRight className="text-muted-foreground/50 group-hover:text-foreground size-3.5 shrink-0 transition-all duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
  );
}

function Figure({ value, unit }: { value: string; unit?: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-3xl font-semibold tracking-tight tabular-nums">{value}</span>
      {unit ? <span className="text-muted-foreground text-[11.5px]">{unit}</span> : null}
    </div>
  );
}

export function PlatformBento({ payload }: { payload: LandingPayload | null }) {
  const counts = payload?.counts;
  const shape = payload?.shape;
  const service = payload?.service;
  const database = payload?.database;

  return (
    <BentoGrid className="lg:auto-rows-[12.5rem] lg:grid-cols-4">
      {/* ----------------------------- catalogue ---------------------------- */}
      <BentoCard
        href="/student/quizzes"
        tone="primary"
        className="group flex flex-col justify-between gap-4 p-5 lg:col-span-2"
        particles={12}
        magnet
        ripple
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <LayoutDashboard className="text-primary size-4" />
            <Label>Catalogue</Label>
          </div>
          <Go />
        </div>

        <div>
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-semibold tracking-tight tabular-nums">
                {counts?.publishedQuizzes ?? '—'}
              </span>
              <span className="text-muted-foreground text-[11.5px]">
                of {counts?.quizzes ?? '—'} published
              </span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-semibold tracking-tight tabular-nums">
                {counts?.categories ?? '—'}
              </span>
              <span className="text-muted-foreground text-[11.5px]">categories</span>
            </div>
          </div>
          <p className="text-muted-foreground mt-2.5 max-w-sm text-[12px] leading-relaxed">
            Categories are rows, not an enum — the filter reads the same table the console writes
            to.
          </p>
        </div>
      </BentoCard>

      {/* ------------------------------- clock ------------------------------ */}
      <BentoCard
        href="#tour"
        tone="sky"
        className="group flex flex-col justify-between gap-3 p-5"
        particles={7}
        magnet
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <Timer className="size-4 text-[oklch(0.74_0.13_215)]" />
            <Label>Attempt clock</Label>
          </div>
          <Go />
        </div>
        <div>
          <Figure value={shape ? durationRangeLabel(shape) : '—'} />
          <p className="text-muted-foreground mt-2 text-[12px] leading-relaxed">
            {shape
              ? `${questionRangeLabel(shape)} questions per paper.`
              : 'No paper published yet.'}{' '}
            A refresh resumes the attempt without spending a try.
          </p>
        </div>
      </BentoCard>

      {/* ------------------------------ results ----------------------------- */}
      <BentoCard
        href="/student/results"
        tone="success"
        className="group flex flex-col justify-between gap-3 p-5"
        particles={7}
        magnet
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <Gauge className="text-success size-4" />
            <Label>Results</Label>
          </div>
          <Go />
        </div>
        <div>
          <Figure value={counts ? percentLabel(counts.passRate) : '—'} unit="pass rate" />
          <p className="text-muted-foreground mt-2 text-[12px] leading-relaxed">
            {counts
              ? `${counts.gradedAttempts} papers graded · average ${percentLabel(counts.averagePercentage)}.`
              : 'Nothing graded yet.'}
          </p>
        </div>
      </BentoCard>

      {/* ------------------------------ grading ----------------------------- */}
      <BentoCard
        href="#tour"
        tone="warning"
        className="group flex flex-col justify-between gap-3 p-5"
        particles={7}
        magnet
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <Gauge className="text-warning size-4" />
            <Label>Grading</Label>
          </div>
          <Go />
        </div>
        <div>
          <Figure value={shape ? passingRangeLabel(shape) : '—'} unit="to pass" />
          <p className="text-muted-foreground mt-2 text-[11.5px] leading-relaxed">
            One pure grader: submitted by hand or settled at the deadline, graded once.
          </p>
        </div>
      </BentoCard>

      {/* ---------------------------- console ------------------------------- */}
      <BentoCard
        href="/admin"
        tone="primary"
        className="group flex flex-col justify-between gap-3 p-5 lg:col-span-2"
        particles={12}
        magnet
        ripple
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <Users className="text-primary size-4" />
            <Label>Admin console</Label>
          </div>
          <Go />
        </div>

        <div>
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
            {[
              [String(counts?.users ?? '—'), 'users'],
              [String(counts?.attempts ?? '—'), 'attempts'],
              [String(counts?.questions ?? '—'), 'questions'],
            ].map(([value, label]) => (
              <div key={label} className="flex items-baseline gap-2">
                <span className="text-3xl font-semibold tracking-tight tabular-nums">{value}</span>
                <span className="text-muted-foreground text-[11.5px]">{label}</span>
              </div>
            ))}
          </div>
          <p className="text-muted-foreground mt-2.5 max-w-sm text-[12px] leading-relaxed">
            Six aggregates in one round trip. Every figure is a SQL count — the console renders what
            the database says.
          </p>
        </div>
      </BentoCard>

      {/* ------------------------------ runtime ----------------------------- */}
      <BentoCard
        href="/admin/system"
        tone="sky"
        className="group flex flex-col justify-between gap-3 p-5 lg:col-span-2"
        particles={7}
        magnet
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <Server className="size-4 text-[oklch(0.74_0.13_215)]" />
            <Label>This process</Label>
          </div>
          <Go />
        </div>

        <div>
          <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
            <Figure value={service ? `v${service.version}` : 'this process'} />
            <span className="text-muted-foreground font-mono text-[11px]">
              {database?.target ?? '—'} ·{' '}
              {database?.latencyMs ? `${Math.round(database.latencyMs)} ms` : '—'}
            </span>
            <span className="text-muted-foreground font-mono text-[11px]">
              up {service ? uptimeLabel(service.uptimeSeconds) : '—'}
            </span>
          </div>
          <p className="text-muted-foreground mt-2.5 flex max-w-sm items-center gap-1.5 text-[12px] leading-relaxed">
            <Database className="size-3" />
            {service?.runtime ?? 'runtime unknown'} · {service?.nodeEnv ?? 'unknown'} — live from
            <span className="font-mono text-[11px]">/api/landing</span>
          </p>
        </div>
      </BentoCard>
    </BentoGrid>
  );
}
