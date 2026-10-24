import { describe, expect, it } from 'vitest';

import {
  allowedOrigins,
  demoAccounts,
  developmentFeatures,
  isAllowedOrigin,
  isPreviewHost,
  originAllowed,
  runtimeMode,
} from '../lib/env';

/**
 * The origin policy, in both directions.
 *
 * The running process decides its own mode from the environment, and the suite
 * runs as a development one (`NODE_ENV=test`). That is exactly why the policy is
 * a pure function: the production answer has to be provable here too, rather
 * than only on a deployment.
 */

const LOCAL = { allowedOrigins: ['https://quiz.example.com'], allowPreviewHosts: false };
const DEV = { allowedOrigins: LOCAL.allowedOrigins, allowPreviewHosts: true };

describe('isPreviewHost', () => {
  it('matches the sandbox hosts and their subdomains', () => {
    expect(isPreviewHost('3000-abc123.e2b.app')).toBe(true);
    expect(isPreviewHost('api-3001.something.e2b.dev')).toBe(true);
    expect(isPreviewHost('preview.arena.ai')).toBe(true);
  });

  it('does not match lookalikes', () => {
    for (const host of ['e2b.app.example.com', 'note2b.app', 'arena.aia', 'evil.example']) {
      expect(isPreviewHost(host), host).toBe(false);
    }
  });
});

describe('originAllowed', () => {
  it('always allows the configured origin', () => {
    expect(originAllowed('https://quiz.example.com', LOCAL)).toBe(true);
    expect(originAllowed('https://quiz.example.com', DEV)).toBe(true);
  });

  it('refuses a preview host in production, even though it is one of ours', () => {
    expect(originAllowed('https://3000-abc123.e2b.app', LOCAL)).toBe(false);
    expect(originAllowed('https://3000-abc123.e2b.app', DEV)).toBe(true);
  });

  it('refuses the opaque null origin and anything unparseable', () => {
    for (const origin of [undefined, '', 'null', 'not a url', 'file:///etc/passwd']) {
      expect(originAllowed(origin, DEV), String(origin)).toBe(false);
    }
  });

  it('refuses someone else’s origin', () => {
    expect(originAllowed('https://evil.example', DEV)).toBe(false);
  });
});

describe('this process', () => {
  it('runs as a development surface under test', () => {
    expect(runtimeMode).toBe('development');
    expect(developmentFeatures).toBe(true);
  });

  it('publishes demo logins here, and trusts the localhost aliases', () => {
    expect(demoAccounts).toBe(true);
    expect(allowedOrigins).toEqual(
      expect.arrayContaining(['http://localhost:3000', 'http://127.0.0.1:3000']),
    );
    expect(isAllowedOrigin('http://localhost:3000')).toBe(true);
  });
});
