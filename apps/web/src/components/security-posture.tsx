import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * Day 13 on the landing page: what the API checks, in the order it checks it,
 * and the nine areas the adversarial suite actually attacks.
 *
 * Everything here is a fixed illustration of the shipped policy — the numbers are
 * the suite's real counts, and the pipeline mirrors `apps/api/src/app.ts` and the
 * route guards step for step.
 */

const PIPELINE: Array<[string, string]> = [
  ['Same-origin', 'a foreign Origin cannot write'],
  ['Size cap', '64 KB, refused before parsing'],
  ['JWT', 'HS256, iss + aud, exp'],
  ['Session', 'the database row is the authority'],
  ['Role', 'ADMIN or STUDENT, per namespace'],
  ['Zod', 'every body, query and param'],
];

interface Area {
  area: string;
  attack: string;
  tests: number;
}

const AREAS: Area[] = [
  { area: 'Authentication', attack: 'decoy hashes, forged and foreign JWTs', tests: 6 },
  { area: 'Authorization', attack: 'role escalation, cross-role access', tests: 14 },
  { area: 'Quiz creation', attack: 'mass assignment, server-owned fields', tests: 3 },
  { area: 'Quiz attempts', attack: 'another student’s paper (IDOR)', tests: 5 },
  { area: 'Timer', attack: 'client-supplied deadlines, late writes', tests: 2 },
  { area: 'Score calculation', attack: 'a score in the request body', tests: 2 },
  { area: 'API validation', attack: 'malformed JSON, bad ids, huge bodies', tests: 4 },
  { area: 'Unauthorized access', attack: 'no session, foreign origins, caching', tests: 5 },
  { area: 'Input validation', attack: 'SQL and XSS payloads as data', tests: 4 },
];

const TOTAL_TESTS = AREAS.reduce((sum, area) => sum + area.tests, 0);

export function SecurityPosture() {
  return (
    <div className="space-y-3">
      {/* The request pipeline, left to right, as it actually runs. */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-[12.5px]">Every request, before any handler runs</CardTitle>
            <Badge variant="outline" className="font-mono text-[10px]">
              apps/api/src/app.ts
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <ol className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {PIPELINE.map(([label, detail], index) => (
              <li key={label} className="border-border/60 bg-background/40 rounded-lg border p-2.5">
                <div className="text-muted-foreground/70 font-mono text-[9.5px]">
                  {String(index + 1).padStart(2, '0')}
                </div>
                <div className="mt-0.5 text-[11.5px] font-medium">{label}</div>
                <div className="text-muted-foreground text-[10.5px] leading-snug">{detail}</div>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      <div className="grid gap-3 lg:grid-cols-[1.6fr_1fr]">
        {/* The nine spec areas, with the attack each one is tested against. */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-[12.5px]">Adversarial coverage</CardTitle>
              <span className="text-muted-foreground font-mono text-[10.5px]">
                {TOTAL_TESTS} hostile cases
              </span>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <ul className="divide-border/40 divide-y">
              {AREAS.map((area) => (
                <li key={area.area} className="flex items-center gap-2 py-1.5">
                  <span className="text-success">✓</span>
                  <span className="w-[8.5rem] shrink-0 text-[11.5px] font-medium">{area.area}</span>
                  <span className="text-muted-foreground min-w-0 flex-1 truncate text-[11px]">
                    {area.attack}
                  </span>
                  <span className="text-muted-foreground/70 font-mono text-[10px] tabular-nums">
                    {area.tests}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {/* What a brute-force attempt sees. */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-[12.5px]">Brute force, by the numbers</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <div className="text-muted-foreground text-[10.5px]">Attempts from one address</div>
              <div className="mt-1.5 flex gap-[3px]">
                {Array.from({ length: 11 }, (_, index) => (
                  <span
                    key={index}
                    className={
                      index < 10
                        ? 'bg-destructive/50 h-5 flex-1 rounded-[2px]'
                        : 'bg-destructive h-5 flex-1 rounded-[2px]'
                    }
                  />
                ))}
              </div>
              <div className="text-muted-foreground mt-1 font-mono text-[10px]">
                10 × 401 · 11th → 429
              </div>
            </div>

            <dl className="space-y-1.5 text-[11px]">
              <div className="flex items-center justify-between gap-2">
                <dt className="text-muted-foreground">Retry-After</dt>
                <dd className="font-mono">300 s</dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-muted-foreground">Account guard</dt>
                <dd className="font-mono">5 failures / 15 min</dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-muted-foreground">Owner sign-in</dt>
                <dd className="text-success font-mono">never blocked</dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-muted-foreground">Cookie</dt>
                <dd className="font-mono">HttpOnly · Lax</dd>
              </div>
            </dl>

            <p className="text-muted-foreground border-border/60 border-t pt-2 text-[10.5px] leading-snug">
              The address guard refuses before any password is hashed. The account guard is soft on
              purpose: it stops answering guesses but can never lock the real owner out.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
