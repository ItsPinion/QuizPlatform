import type { CheckStatus, DeploymentVerdict } from '@quiz/shared/deployment';

/**
 * Presentation helpers for the deployment screen.
 *
 * The rules live in `@quiz/shared/deployment`; this file only decides how a
 * verdict looks and reads, so the page itself stays markup.
 */

export const VERDICT_LABELS: Record<DeploymentVerdict, string> = {
  ready: 'Ready to serve',
  attention: 'Running with warnings',
  blocked: 'Not ready to deploy',
};

export const STATUS_LABELS: Record<CheckStatus, string> = {
  pass: 'Pass',
  warn: 'Warning',
  fail: 'Failure',
  skip: 'Skipped',
};

/** Tailwind classes for a check status: text, border and surface together. */
export function statusTone(status: CheckStatus): string {
  switch (status) {
    case 'pass':
      return 'text-success border-success/30 bg-success/5';
    case 'warn':
      return 'text-warning border-warning/30 bg-warning/5';
    case 'fail':
      return 'text-destructive border-destructive/40 bg-destructive/5';
    default:
      return 'text-muted-foreground border-border/60 bg-card/40';
  }
}

/** The same tone, for a single glyph rather than a panel. */
export function statusGlyphTone(status: CheckStatus): string {
  switch (status) {
    case 'pass':
      return 'text-success';
    case 'warn':
      return 'text-warning';
    case 'fail':
      return 'text-destructive';
    default:
      return 'text-muted-foreground/60';
  }
}

export const STATUS_GLYPHS: Record<CheckStatus, string> = {
  pass: '✓',
  warn: '!',
  fail: '×',
  skip: '–',
};

export function verdictTone(verdict: DeploymentVerdict): string {
  switch (verdict) {
    case 'ready':
      return 'border-success/40 bg-success/10 text-success';
    case 'attention':
      return 'border-warning/40 bg-warning/10 text-warning';
    default:
      return 'border-destructive/40 bg-destructive/10 text-destructive';
  }
}

/** `92 MB · 3m 12s` — memory and uptime, the two numbers worth glancing at. */
export function runtimeLabel(memoryMb: number, uptimeSeconds: number): string {
  const memory = `${Number(memoryMb.toFixed(1))} MB`;
  const seconds = Math.max(0, Math.round(uptimeSeconds));
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);

  const parts: string[] = [];

  if (days > 0) parts.push(`${days}d`);
  if (days > 0 || hours > 0) parts.push(`${hours}h`);
  parts.push(`${minutes}m`);

  return `${memory} · ${parts.join(' ')} up`;
}

/** `12.4 ms` or `no answer` when the database could not be reached. */
export function latencyLabel(latencyMs: number | null): string {
  if (latencyMs === null) return 'no answer';
  return `${Number(latencyMs.toFixed(2))} ms`;
}

/** `4 users · 10 quizzes · 15 attempts`, or a placeholder when unavailable. */
export function countsLabel(
  counts: { users: number; quizzes: number; attempts: number } | null,
): string {
  if (!counts) return 'No counts — the database did not answer';

  return `${counts.users} user${counts.users === 1 ? '' : 's'} · ${counts.quizzes} quiz${counts.quizzes === 1 ? '' : 'zes'} · ${counts.attempts} attempt${counts.attempts === 1 ? '' : 's'}`;
}

/** Which checks need a human: failures first, then warnings. */
export function actionableChecks<T extends { status: CheckStatus }>(checks: readonly T[]): T[] {
  return checks.filter((entry) => entry.status === 'fail' || entry.status === 'warn');
}

/** `http://localhost:3001` → `localhost:3001`, for a compact settings row. */
export function hostLabel(url: string | null): string {
  if (!url) return 'not set';

  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
