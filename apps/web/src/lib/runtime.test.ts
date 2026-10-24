import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * The web app's half of the gate.
 *
 * `lib/runtime.ts` reads the environment once, at import, so each case re-imports
 * it against a stubbed environment. The point of the file is the default: a
 * process that has never heard of `ENV_NODE` must not render build-plan badges.
 */

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function load(env: { ENV_NODE?: string; NODE_ENV?: string }) {
  vi.resetModules();
  vi.stubEnv('ENV_NODE', env.ENV_NODE as string);
  vi.stubEnv('NODE_ENV', env.NODE_ENV as string);

  return import('./runtime');
}

describe('web runtime mode', () => {
  it('is production when nothing is configured', async () => {
    const runtime = await load({});

    expect(runtime.runtimeMode).toBe('production');
    expect(runtime.developmentFeatures).toBe(false);
    expect(runtime.runtimeModeTitle).toBe('Production');
  });

  it('is production when NODE_ENV says so, whatever the default is', async () => {
    const runtime = await load({ NODE_ENV: 'production' });

    expect(runtime.developmentFeatures).toBe(false);
  });

  it('follows NODE_ENV=development when ENV_NODE is absent', async () => {
    const runtime = await load({ NODE_ENV: 'development' });

    expect(runtime.runtimeMode).toBe('development');
    expect(runtime.developmentFeatures).toBe(true);
  });

  it('lets an explicit ENV_NODE=demo win', async () => {
    const runtime = await load({ ENV_NODE: 'demo', NODE_ENV: 'production' });

    expect(runtime.runtimeMode).toBe('demo');
    expect(runtime.developmentFeatures).toBe(true);
    expect(runtime.runtimeModeSummary).toMatch(/showcase/i);
  });

  it('refuses to widen on a typo', async () => {
    const runtime = await load({ ENV_NODE: 'staging', NODE_ENV: 'development' });

    expect(runtime.runtimeMode).toBe('production');
    expect(runtime.developmentFeatures).toBe(false);
  });
});
