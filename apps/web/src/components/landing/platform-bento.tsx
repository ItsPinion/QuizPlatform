import {
  ArrowUpRight,
  Database,
  Gauge,
  LayoutDashboard,
  Rocket,
  ShieldCheck,
  Timer,
} from 'lucide-react';

import { BentoCard, BentoGrid } from '@/components/ui/bento';

/**
 * The landing page's showcase grid (UI pass).
 *
 * Six cards, one per surface the platform actually has. Every number here is a
 * fact about this repository — the seed's four accounts and ten quizzes, the 51
 * adversarial tests, the eight deployment checks — not a marketing placeholder,
 * and each card links to the section or screen that proves it.
 *
 * Layout is a 4-column bento in two rows: a wide console card, the clock, the
 * security count, then grading, a wide deployment card and the stack. Two wide
 * cells against four narrow ones is enough asymmetry to read as a bento without
 * turning the page into a puzzle.
 */

const CONSOLE_STATS = [
  { value: '4', label: 'users' },
  { value: '10', label: 'quizzes' },
  { value: '47', label: 'questions' },
];

const MARKS = [
  { label: 'Right', value: '+3' },
  { label: 'Wrong', value: '0' },
  { label: 'Blank', value: '0' },
];

const STACK = ['Next.js 16 · React 19', 'Hono 4 · typed RPC', 'Drizzle · Turso', 'Zod contracts'];

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

export function PlatformBento() {
  return (
    <BentoGrid className="lg:auto-rows-[12.5rem] lg:grid-cols-4">
      {/* --------------------------- admin console -------------------------- */}
      <BentoCard
        href="/admin"
        tone="primary"
        className="group flex flex-col justify-between gap-4 p-5 lg:col-span-2"
        particles={12}
        magnet
        ripple
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <LayoutDashboard className="text-primary size-4" />
            <Label>Admin console</Label>
          </div>
          <Go />
        </div>

        <div>
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
            {CONSOLE_STATS.map((stat) => (
              <div key={stat.label} className="flex items-baseline gap-2">
                <span className="text-3xl font-semibold tracking-tight tabular-nums">
                  {stat.value}
                </span>
                <span className="text-muted-foreground text-[11.5px]">{stat.label}</span>
              </div>
            ))}
          </div>
          <p className="text-muted-foreground mt-2.5 max-w-sm text-[12px] leading-relaxed">
            Six aggregates in one round trip. Every figure is a SQL count — the console renders what
            the database says.
          </p>
        </div>
      </BentoCard>

      {/* ------------------------------- clock ------------------------------ */}
      <BentoCard
        href="#student"
        tone="sky"
        className="group flex flex-col justify-between gap-3 p-5"
        particles={7}
        magnet
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <Timer className="size-4 text-[oklch(0.74_0.13_215)]" />
            <Label>Attempts</Label>
          </div>
          <Go />
        </div>

        <div>
          <div className="font-mono text-3xl font-semibold tracking-tight tabular-nums">
            15–30<span className="text-muted-foreground/70 ml-1 text-base">min</span>
          </div>
          <p className="text-muted-foreground mt-2 text-[12px] leading-relaxed">
            Each quiz owns its clock. A refresh resumes the attempt without spending a try.
          </p>
        </div>
      </BentoCard>

      {/* ----------------------------- hardening ---------------------------- */}
      <BentoCard
        href="#security"
        tone="warning"
        className="group flex flex-col justify-between gap-3 p-5"
        particles={7}
        magnet
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="text-warning size-4" />
            <Label>Hardening</Label>
          </div>
          <Go />
        </div>

        <div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-semibold tracking-tight tabular-nums">51</span>
            <span className="text-muted-foreground text-[11.5px]">attack tests</span>
          </div>
          <p className="text-muted-foreground mt-2 text-[11.5px] leading-relaxed">
            Forged tokens, role escalation, a client-set deadline, a score in the body.
          </p>
        </div>
      </BentoCard>

      {/* ------------------------------ grading ----------------------------- */}
      <BentoCard
        href="#submission"
        tone="success"
        className="group flex flex-col justify-between gap-3 p-5"
        particles={7}
        magnet
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <Gauge className="text-success size-4" />
            <Label>Grading</Label>
          </div>
          <Go />
        </div>

        <div className="grid grid-cols-3 gap-1.5">
          {MARKS.map((mark) => (
            <div
              key={mark.label}
              className="border-border/50 bg-background/40 rounded-lg border px-1 py-1.5 text-center"
            >
              <div className="font-mono text-[13px] tabular-nums">{mark.value}</div>
              <div className="text-muted-foreground/80 text-[9px] tracking-wide uppercase">
                {mark.label}
              </div>
            </div>
          ))}
        </div>

        <p className="text-muted-foreground text-[11.5px] leading-relaxed">
          One pure grader: submit twice, grade once.
        </p>
      </BentoCard>

      {/* ----------------------------- deployment --------------------------- */}
      <BentoCard
        href="#deployment"
        tone="primary"
        className="group flex flex-col justify-between gap-3 p-5 lg:col-span-2"
        particles={12}
        magnet
        ripple
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <Rocket className="text-primary size-4" />
            <Label>Deployment</Label>
          </div>
          <Go />
        </div>

        <div>
          <div className="border-border/60 bg-background/60 rounded-lg border px-3 py-1.5 font-mono text-[11px] leading-[1.7]">
            <div>
              <span className="text-muted-foreground">$</span> bun run deploy:check
            </div>
            <div className="text-success">✓ 8 checks · ready · exit 0</div>
          </div>
          <p className="text-muted-foreground mt-2 text-[12px] leading-relaxed">
            One rule set, three surfaces: before the build, over the wire, and on{' '}
            <span className="font-mono text-[11px]">/admin/system</span>.
          </p>
        </div>
      </BentoCard>

      {/* -------------------------------- stack ----------------------------- */}
      <BentoCard
        href="#stack"
        tone="sky"
        className="group flex flex-col justify-between gap-3 p-5"
        particles={7}
        magnet
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <Database className="size-4 text-[oklch(0.74_0.13_215)]" />
            <Label>Stack</Label>
          </div>
          <Go />
        </div>

        <ul className="space-y-1">
          {STACK.map((item) => (
            <li key={item} className="text-muted-foreground flex items-center gap-2 text-[11.5px]">
              <span className="bg-border size-1 shrink-0 rounded-full" />
              {item}
            </li>
          ))}
        </ul>
      </BentoCard>
    </BentoGrid>
  );
}
