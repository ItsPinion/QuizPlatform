import { describe, expect, it } from 'vitest';

import {
  BODY_LIMIT_BOUNDS,
  evaluateEnvironment,
  MIN_JWT_SECRET_LENGTH,
  summarizeChecks,
  summaryLabel,
  systemStatusSchema,
  type EnvironmentSnapshot,
} from './deployment';

const GOOD_SECRET = 'a'.repeat(48);

/** A deployment that should come out clean. */
const production: EnvironmentSnapshot = {
  nodeEnv: 'production',
  runtimeMode: 'production',
  databaseUrl: 'libsql://quiz-org.turso.io',
  databaseToken: 'token-value',
  jwtSecret: GOOD_SECRET,
  webOrigin: 'https://quiz.example.com',
  apiInternalUrl: 'http://quiz-api:3001',
  authRateLimitMax: 10,
  maxBodyBytes: 65_536,
};

const byId = (snapshot: EnvironmentSnapshot) =>
  new Map(evaluateEnvironment(snapshot).map((entry) => [entry.id, entry]));

describe('evaluateEnvironment', () => {
  it('passes every check for a sound production setup', () => {
    const checks = evaluateEnvironment(production);

    expect(checks.map((entry) => entry.status)).not.toContain('fail');
    expect(checks.map((entry) => entry.status)).not.toContain('warn');
    expect(checks.map((entry) => entry.id)).toEqual([
      'database-url',
      'database-token',
      'jwt-secret',
      'web-origin',
      'api-internal-url',
      'node-env',
      'runtime-mode',
      'rate-limit',
      'body-limit',
    ]);
  });

  it('blocks a production deploy with no database URL', () => {
    const entry = byId({ ...production, databaseUrl: '' }).get('database-url')!;

    expect(entry.status).toBe('fail');
    expect(entry.hint).toContain('.env.example');
  });

  it('refuses a file: database in production but only warns in development', () => {
    const prod = byId({ ...production, databaseUrl: 'file:./local.db' }).get('database-url')!;
    const dev = byId({
      ...production,
      nodeEnv: 'development',
      databaseUrl: 'file:./local.db',
    }).get('database-url')!;

    expect(prod.status).toBe('fail');
    expect(prod.detail).toMatch(/production/i);
    expect(dev.status).toBe('warn');
  });

  it('rejects a URL scheme it cannot use', () => {
    const entry = byId({ ...production, databaseUrl: 'postgres://db.example' }).get(
      'database-url',
    )!;

    expect(entry.status).toBe('fail');
  });

  it('demands a token only for a remote database', () => {
    expect(byId({ ...production, databaseToken: '' }).get('database-token')!.status).toBe('fail');
    expect(
      byId({ ...production, databaseUrl: 'file:./x.db', databaseToken: '' }).get('database-token')!
        .status,
    ).toBe('skip');
  });

  it('fails a missing or short session secret in production', () => {
    const missing = byId({ ...production, jwtSecret: '' }).get('jwt-secret')!;
    const short = byId({ ...production, jwtSecret: 'a'.repeat(MIN_JWT_SECRET_LENGTH - 1) }).get(
      'jwt-secret',
    )!;
    const exactlyLongEnough = byId({
      ...production,
      jwtSecret: 'a'.repeat(MIN_JWT_SECRET_LENGTH),
    }).get('jwt-secret')!;

    expect(missing.status).toBe('fail');
    expect(short.status).toBe('fail');
    expect(short.detail).toContain(String(MIN_JWT_SECRET_LENGTH));
    expect(exactlyLongEnough.status).toBe('pass');
  });

  it('only warns about the development secret outside production', () => {
    const entry = byId({ ...production, nodeEnv: 'development', jwtSecret: '' }).get('jwt-secret')!;

    expect(entry.status).toBe('warn');
    expect(entry.detail).toMatch(/development secret/i);
  });

  it('never echoes a secret or a token', () => {
    const rendered = JSON.stringify(
      evaluateEnvironment({ ...production, jwtSecret: 'super-secret-value-1234567890abcdefgh' }),
    );

    expect(rendered).not.toContain('super-secret-value');
    expect(rendered).not.toContain('token-value');
  });

  it('warns about a malformed origin and about http in production', () => {
    expect(byId({ ...production, webOrigin: 'quiz.example.com' }).get('web-origin')!.status).toBe(
      'fail',
    );
    expect(
      byId({ ...production, webOrigin: 'http://quiz.example.com' }).get('web-origin')!.status,
    ).toBe('warn');
  });

  it('warns when the web app cannot be told where the API lives', () => {
    const missing = byId({ ...production, apiInternalUrl: '' }).get('api-internal-url')!;
    const broken = byId({ ...production, apiInternalUrl: 'quiz-api:3001' }).get(
      'api-internal-url',
    )!;

    expect(missing.status).toBe('warn');
    expect(broken.status).toBe('fail');
  });

  it('flags a production process still running in development mode', () => {
    expect(byId({ ...production, nodeEnv: 'development' }).get('node-env')!.status).toBe('warn');
    expect(byId({ ...production, nodeEnv: 'production' }).get('node-env')!.status).toBe('pass');
  });

  it('warns when rate limiting is switched off', () => {
    expect(byId({ ...production, authRateLimitMax: 0 }).get('rate-limit')!.status).toBe('warn');
    expect(byId({ ...production, authRateLimitMax: 10 }).get('rate-limit')!.status).toBe('pass');
  });

  it('warns when the body cap is outside sane bounds', () => {
    expect(byId({ ...production, maxBodyBytes: 512 }).get('body-limit')!.status).toBe('warn');
    expect(
      byId({ ...production, maxBodyBytes: BODY_LIMIT_BOUNDS.max + 1 }).get('body-limit')!.status,
    ).toBe('warn');
    expect(byId({ ...production, maxBodyBytes: 65_536 }).get('body-limit')!.status).toBe('pass');
  });

  it('skips the checks a surface cannot answer for', () => {
    const checks = byId({ ...production, authRateLimitMax: undefined, maxBodyBytes: undefined });

    expect(checks.get('rate-limit')!.status).toBe('skip');
    expect(checks.get('body-limit')!.status).toBe('skip');
  });
});

describe('summarizeChecks', () => {
  it('is ready when nothing is wrong', () => {
    const summary = summarizeChecks(evaluateEnvironment(production));

    expect(summary.verdict).toBe('ready');
    expect(summary.fail).toBe(0);
    expect(summary.warn).toBe(0);
  });

  it('asks for attention on warnings alone', () => {
    const summary = summarizeChecks(evaluateEnvironment({ ...production, nodeEnv: 'development' }));

    expect(summary.verdict).toBe('attention');
    expect(summary.warn).toBeGreaterThan(0);
  });

  it('is blocked by a single failure, whatever else passes', () => {
    const summary = summarizeChecks(evaluateEnvironment({ ...production, databaseToken: '' }));

    expect(summary.verdict).toBe('blocked');
    expect(summary.fail).toBe(1);
    expect(summary.pass).toBeGreaterThan(0);
  });

  it('says which demo surface the environment is running', () => {
    expect(byId(production).get('runtime-mode')!.status).toBe('pass');

    const dev = byId({ ...production, runtimeMode: 'development' }).get('runtime-mode')!;

    expect(dev.status).toBe('warn');
    expect(dev.detail).toMatch(/ENV_NODE=development/);
    expect(dev.hint).toMatch(/production/i);

    expect(byId({ ...production, runtimeMode: 'demo' }).get('runtime-mode')!.status).toBe('warn');
  });

  it('skips the demo rule when the surface did not report a mode', () => {
    const entry = byId({ ...production, runtimeMode: undefined }).get('runtime-mode')!;

    expect(entry.status).toBe('skip');
  });

  it('counts every status once', () => {
    const summary = summarizeChecks(evaluateEnvironment(production));

    expect(summary.pass + summary.warn + summary.fail + summary.skip).toBe(summary.checks.length);
  });

  it('renders a caption with only the parts that apply', () => {
    expect(summaryLabel({ pass: 6, warn: 0, fail: 0, skip: 0 })).toBe('6 of 6 checks pass');
    expect(summaryLabel({ pass: 5, warn: 1, fail: 0, skip: 0 })).toBe(
      '5 of 6 checks pass · 1 warning',
    );
    expect(summaryLabel({ pass: 3, warn: 2, fail: 1, skip: 0 })).toBe(
      '3 of 6 checks pass · 2 warnings · 1 failure',
    );
  });
});

describe('systemStatusSchema', () => {
  const valid = {
    generatedAt: '2026-03-15T12:00:00.000Z',
    service: {
      name: 'quiz-api',
      version: '0.1.0',
      runtime: 'node v22.0.0',
      nodeEnv: 'production',
      runtimeMode: 'production' as const,
      demoFeatures: false,
      uptimeSeconds: 120,
      startedAt: '2026-03-15T12:00:00.000Z',
      memoryMb: 92,
    },
    database: {
      target: 'turso' as const,
      urlHint: 'quiz-org.turso.io',
      connected: true,
      latencyMs: 12.4,
      counts: { users: 4, categories: 10, quizzes: 10, questions: 47, attempts: 15 },
    },
    settings: {
      authRateLimitMax: 10,
      authRateLimitWindowSeconds: 300,
      registerRateLimitMax: 10,
      maxBodyBytes: 65_536,
      sessionTtlSeconds: 604_800,
      trustedOrigins: ['https://quiz.example.com'],
      apiInternalUrl: 'http://quiz-api:3001',
      demoAccounts: false,
    },
    summary: summarizeChecks(evaluateEnvironment(production)),
  };

  it('accepts a complete status document', () => {
    expect(systemStatusSchema.safeParse(valid).success).toBe(true);
  });

  it('accepts a database that is down and unknown', () => {
    expect(
      systemStatusSchema.safeParse({
        ...valid,
        database: { ...valid.database, connected: false, latencyMs: null, counts: null },
      }).success,
    ).toBe(true);
  });

  it('rejects an unknown target or verdict', () => {
    expect(
      systemStatusSchema.safeParse({ ...valid, database: { ...valid.database, target: 'mysql' } })
        .success,
    ).toBe(false);
    expect(
      systemStatusSchema.safeParse({
        ...valid,
        summary: { ...valid.summary, verdict: 'great' },
      }).success,
    ).toBe(false);
  });
});
