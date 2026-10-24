import { describe, expect, it } from 'vitest';

import {
  demoAccountsEnabled,
  developmentFeaturesEnabled,
  normalizeRuntimeMode,
  readRuntimeMode,
  runtimeModeDescription,
  runtimeModeLabel,
} from './environment';

describe('normalizeRuntimeMode', () => {
  it('accepts the three canonical names', () => {
    expect(normalizeRuntimeMode('production')).toBe('production');
    expect(normalizeRuntimeMode('development')).toBe('development');
    expect(normalizeRuntimeMode('demo')).toBe('demo');
  });

  it('accepts the spellings people type, in any case', () => {
    expect(normalizeRuntimeMode(' PROD ')).toBe('production');
    expect(normalizeRuntimeMode('Dev')).toBe('development');
    expect(normalizeRuntimeMode('test')).toBe('development');
    expect(normalizeRuntimeMode('showcase')).toBe('demo');
  });

  it('refuses anything else instead of guessing', () => {
    expect(normalizeRuntimeMode('staging')).toBeNull();
    expect(normalizeRuntimeMode('')).toBeNull();
    expect(normalizeRuntimeMode(undefined)).toBeNull();
  });
});

describe('readRuntimeMode', () => {
  it('defaults to production when nothing is set', () => {
    expect(readRuntimeMode({})).toEqual({
      mode: 'production',
      source: 'default',
      unrecognized: null,
    });
  });

  it('takes an explicit ENV_NODE over NODE_ENV', () => {
    expect(readRuntimeMode({ ENV_NODE: 'demo', NODE_ENV: 'production' })).toEqual({
      mode: 'demo',
      source: 'ENV_NODE',
      unrecognized: null,
    });

    expect(readRuntimeMode({ ENV_NODE: 'production', NODE_ENV: 'development' }).mode).toBe(
      'production',
    );
  });

  it('reads NODE_ENV=development as development when ENV_NODE is absent', () => {
    expect(readRuntimeMode({ NODE_ENV: 'development' })).toEqual({
      mode: 'development',
      source: 'NODE_ENV',
      unrecognized: null,
    });
  });

  it('treats a test run as a development run', () => {
    expect(readRuntimeMode({ NODE_ENV: 'test' }).mode).toBe('development');
  });

  it('does not read NODE_ENV=production as anything but production', () => {
    expect(readRuntimeMode({ NODE_ENV: 'production' }).mode).toBe('production');
  });

  it('falls back to production — never upward — on an unknown ENV_NODE', () => {
    expect(readRuntimeMode({ ENV_NODE: 'staging', NODE_ENV: 'development' })).toEqual({
      mode: 'production',
      source: 'default',
      unrecognized: 'staging',
    });
  });

  it('ignores a blank ENV_NODE and keeps looking', () => {
    expect(readRuntimeMode({ ENV_NODE: '   ', NODE_ENV: 'development' }).mode).toBe('development');
  });
});

describe('feature gates', () => {
  it('allows development affordances in development and demo only', () => {
    expect(developmentFeaturesEnabled('development')).toBe(true);
    expect(developmentFeaturesEnabled('demo')).toBe(true);
    expect(developmentFeaturesEnabled('production')).toBe(false);
  });

  it('never publishes demo credentials in production, whatever the flag says', () => {
    expect(demoAccountsEnabled('production')).toBe(false);
    expect(demoAccountsEnabled('production', '1')).toBe(false);
    expect(demoAccountsEnabled('production', 'true')).toBe(false);
  });

  it('publishes them in development unless DEMO_ACCOUNTS=0', () => {
    expect(demoAccountsEnabled('development')).toBe(true);
    expect(demoAccountsEnabled('demo')).toBe(true);
    expect(demoAccountsEnabled('development', '0')).toBe(false);
    expect(demoAccountsEnabled('demo', '0')).toBe(false);
    expect(demoAccountsEnabled('development', '1')).toBe(true);
  });
});

describe('labels', () => {
  it('names every mode', () => {
    expect(runtimeModeLabel('production')).toBe('Production');
    expect(runtimeModeLabel('development')).toBe('Development');
    expect(runtimeModeLabel('demo')).toBe('Demo');
  });

  it('says what the mode turns on or off', () => {
    expect(runtimeModeDescription('production')).toMatch(/demo logins.*off/i);
    expect(runtimeModeDescription('development')).toMatch(/ENV_NODE=development/);
    expect(runtimeModeDescription('demo')).toMatch(/showcase/i);
  });
});
