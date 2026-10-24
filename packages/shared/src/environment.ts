import { z } from 'zod';

/**
 * Which surface this process is serving.
 *
 * The build has three modes and one of them is the default, because a switch
 * that turns demo logins and build-plan badges on must fail *closed*. An
 * operator who has never heard of `ENV_NODE` gets `production`; a laptop that
 * runs `bun run dev` gets `development` because the dev scripts say so; a public
 * showcase gets `demo` on purpose.
 *
 *   - **production** — no demo credentials, no build-plan badges, no preview-host
 *     allowance, no pretty JSON. This is what an unconfigured deployment is.
 *   - **development** — a laptop or CI. Demo logins, badges, preview hosts, and
 *     `DEMO_ACCOUNTS=0` can still hide the credentials.
 *   - **demo** — a deployment that is meant to be shown: the development
 *     affordances, kept on deliberately.
 *
 * `NODE_ENV` is read as a *fallback* signal only when `ENV_NODE` is absent, and
 * only in the directions that are unambiguous (`development` / `test`). Anything
 * else — unset, `production`, a typo — lands on production. `NODE_ENV` keeps
 * doing its own job (Secure cookies, Next.js build mode); this is the separate
 * question of "may this process show demo features".
 */
export const RUNTIME_MODES = ['production', 'development', 'demo'] as const;
export const runtimeModeSchema = z.enum(RUNTIME_MODES);
export type RuntimeMode = z.infer<typeof runtimeModeSchema>;

/** Where the mode came from — reported by `/api/admin/system` and `deploy:check`. */
export const RUNTIME_MODE_SOURCES = ['ENV_NODE', 'NODE_ENV', 'default'] as const;
export type RuntimeModeSource = (typeof RUNTIME_MODE_SOURCES)[number];

/**
 * Spellings people actually type.
 *
 * `prod` and `dev` are accepted because they are what everybody writes first;
 * `test` maps to development because a test run is a development run with a
 * different database — the suite has to exercise the demo surface it ships.
 */
const MODE_ALIASES: Record<string, RuntimeMode> = {
  production: 'production',
  prod: 'production',
  live: 'production',
  development: 'development',
  dev: 'development',
  local: 'development',
  test: 'development',
  demo: 'demo',
  showcase: 'demo',
};

/** `prod` → `production`; anything unrecognised → `null`. */
export function normalizeRuntimeMode(raw: string | null | undefined): RuntimeMode | null {
  if (!raw) return null;

  return MODE_ALIASES[raw.trim().toLowerCase()] ?? null;
}

/** The variables this module reads. A plain object, so a test can describe one. */
export interface RuntimeEnvironment {
  ENV_NODE?: string | null | undefined;
  NODE_ENV?: string | null | undefined;
}

export interface RuntimeModeReading {
  mode: RuntimeMode;
  source: RuntimeModeSource;
  /**
   * Set when `ENV_NODE` was present but not a name we understand. The mode
   * falls back to production — the safe direction — and the value is reported
   * so a typo is visible instead of silently ignored.
   */
  unrecognized: string | null;
}

/**
 * Decide the runtime mode from the environment.
 *
 * Precedence: `ENV_NODE` (explicit), then `NODE_ENV` when it says development or
 * test, then production. Never guesses upward.
 */
export function readRuntimeMode(environment: RuntimeEnvironment = {}): RuntimeModeReading {
  const explicit = environment.ENV_NODE?.trim();

  if (explicit) {
    const mode = normalizeRuntimeMode(explicit);

    return mode
      ? { mode, source: 'ENV_NODE', unrecognized: null }
      : { mode: 'production', source: 'default', unrecognized: explicit };
  }

  const nodeEnv = normalizeRuntimeMode(environment.NODE_ENV);

  if (nodeEnv && nodeEnv !== 'production') {
    return { mode: nodeEnv, source: 'NODE_ENV', unrecognized: null };
  }

  return { mode: 'production', source: 'default', unrecognized: null };
}

/** Does this mode allow demo logins, build-plan badges and preview hosts? */
export function developmentFeaturesEnabled(mode: RuntimeMode): boolean {
  return mode !== 'production';
}

/**
 * Are the seeded demo logins advertised in this environment?
 *
 * Off in production, whatever `DEMO_ACCOUNTS` says — that flag can only *hide*
 * credentials in a development or demo environment, never publish them from a
 * production one. This is the rule `/api/landing` and the login page obey.
 */
export function demoAccountsEnabled(
  mode: RuntimeMode,
  flag: string | null | undefined = undefined,
): boolean {
  if (!developmentFeaturesEnabled(mode)) return false;

  return flag?.trim() !== '0';
}

/** `Development · demo logins on` — one line for an operator screen or a log. */
export function runtimeModeLabel(mode: RuntimeMode): string {
  switch (mode) {
    case 'development':
      return 'Development';
    case 'demo':
      return 'Demo';
    default:
      return 'Production';
  }
}

/** The sentence shown under the label, kept next to the label so they cannot drift. */
export function runtimeModeDescription(mode: RuntimeMode): string {
  switch (mode) {
    case 'development':
      return 'ENV_NODE=development — demo logins, build-plan badges and preview hosts are on.';
    case 'demo':
      return 'ENV_NODE=demo — a showcase deployment: development affordances, switched on deliberately.';
    default:
      return 'ENV_NODE is unset or production — demo logins, build-plan badges and preview hosts are off.';
  }
}

/** Names accepted by `ENV_NODE`, for a parser error message that tells you what to type. */
export const RUNTIME_MODE_NAMES = RUNTIME_MODES.join(' | ');
