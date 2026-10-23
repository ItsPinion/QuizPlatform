import { describe, expect, it } from 'vitest';

import { contentSecurityPolicy, SECURITY_HEADER_SOURCE, securityHeaders } from './security-headers';

/** Split a policy into `directive → sources` for readable assertions. */
function parse(policy: string): Map<string, string[]> {
  return new Map(
    policy.split(';').map((part) => {
      const [name, ...sources] = part.trim().split(/\s+/);
      return [name!, sources];
    }),
  );
}

describe('contentSecurityPolicy', () => {
  it('locks the page down to its own origin by default', () => {
    const policy = parse(contentSecurityPolicy(false));

    expect(policy.get('default-src')).toEqual(["'self'"]);
    expect(policy.get('object-src')).toEqual(["'none'"]);
    expect(policy.get('base-uri')).toEqual(["'self'"]);
    expect(policy.get('form-action')).toEqual(["'self'"]);
  });

  it('never allows eval or a remote script host in production', () => {
    const policy = parse(contentSecurityPolicy(false));

    for (const directive of ['script-src', 'style-src', 'connect-src', 'img-src', 'font-src']) {
      const sources = policy.get(directive) ?? [];
      expect(sources.filter((source) => source.includes('://'))).toEqual([]);
    }

    expect(policy.get('script-src')).not.toContain("'unsafe-eval'");
    // The only remote hosts anywhere in the policy are the frame ancestors.
    expect(contentSecurityPolicy(false).match(/https:\/\//g)).toHaveLength(3);
  });

  it('adds exactly what the dev server needs and nothing else', () => {
    const dev = parse(contentSecurityPolicy(true));

    expect(dev.get('script-src')).toContain("'unsafe-eval'");
    expect(dev.get('connect-src')).toEqual(expect.arrayContaining(['ws:', 'wss:']));
  });

  it('allows only its own origin and the preview hosts to frame the app', () => {
    const ancestors = parse(contentSecurityPolicy(false)).get('frame-ancestors');

    expect(ancestors).toEqual([
      "'self'",
      'https://*.e2b.app',
      'https://*.e2b.dev',
      'https://*.arena.ai',
    ]);
    expect(ancestors).not.toContain('*');
  });
});

describe('securityHeaders', () => {
  it('sends the hardening headers on every route', () => {
    const headers = new Map(securityHeaders().map((header) => [header.key, header.value]));

    expect(headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    expect(headers.get('X-DNS-Prefetch-Control')).toBe('off');
    expect(headers.get('Permissions-Policy')).toContain('camera=()');
    expect(headers.get('Content-Security-Policy')).toContain("default-src 'self'");
  });

  it('does not send X-Frame-Options, which would break the preview iframe', () => {
    const keys = securityHeaders().map((header) => header.key);

    expect(keys).not.toContain('X-Frame-Options');
    expect(keys).toContain('Content-Security-Policy');
  });

  it('only advertises HSTS in production, where the connection is TLS', () => {
    expect(securityHeaders().map((header) => header.key)).not.toContain(
      'Strict-Transport-Security',
    );
    expect(
      securityHeaders({ production: true }).find(
        (header) => header.key === 'Strict-Transport-Security',
      )?.value,
    ).toContain('max-age=31536000');
  });

  it('applies to proxied API routes too', () => {
    expect(SECURITY_HEADER_SOURCE).toBe('/:path*');
  });
});
