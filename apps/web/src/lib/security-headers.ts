/**
 * Response headers for every page the web app serves.
 *
 * Kept in a plain module (no `@/` aliases, no React) so `next.config.ts` can
 * import it *and* a unit test can assert the policy without booting Next.
 *
 * The policy is written for what this app actually loads: its own CSS, its own
 * scripts, no third-party fonts, no remote images, no iframes of its own. The
 * only inline code is Next's own bootstrap and RSC payload, which is why
 * `'unsafe-inline'` appears for scripts — the alternative is a nonce wired
 * through middleware, and that is documented as the next step in
 * `docs/security.md` rather than pretended away here.
 */

/** Hosts allowed to frame the app: itself and the sandbox preview domains. */
const FRAME_ANCESTORS = ["'self'", 'https://*.e2b.app', 'https://*.e2b.dev', 'https://*.arena.ai'];

export interface SecurityHeader {
  key: string;
  value: string;
}

/**
 * Build the `Content-Security-Policy` value.
 *
 * `dev` widens only what the development server genuinely needs (eval for
 * module hot-reloading and a websocket for the HMR channel); production never
 * gets `'unsafe-eval'`.
 */
export function contentSecurityPolicy(dev: boolean): string {
  const scriptSrc = ["'self'", "'unsafe-inline'", ...(dev ? ["'unsafe-eval'"] : [])];
  const connectSrc = ["'self'", ...(dev ? ['ws:', 'wss:'] : [])];

  return [
    "default-src 'self'",
    `script-src ${scriptSrc.join(' ')}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src ${connectSrc.join(' ')}`,
    "object-src 'none'",
    "frame-src 'none'",
    `frame-ancestors ${FRAME_ANCESTORS.join(' ')}`,
    "base-uri 'self'",
    "form-action 'self'",
    "manifest-src 'self'",
  ].join('; ');
}

/**
 * The full header set.
 *
 * `X-Frame-Options` is deliberately absent: it cannot express "my own origin plus
 * these preview hosts", and sending `DENY` would break the sandbox preview the
 * app is reviewed in. `frame-ancestors` above is the modern equivalent and is
 * what browsers actually enforce.
 */
export function securityHeaders(
  options: { dev?: boolean; production?: boolean } = {},
): SecurityHeader[] {
  const { dev = false, production = false } = options;

  const headers: SecurityHeader[] = [
    { key: 'Content-Security-Policy', value: contentSecurityPolicy(dev) },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'X-DNS-Prefetch-Control', value: 'off' },
    {
      key: 'Permissions-Policy',
      value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    },
  ];

  // Only meaningful over TLS, and the preview is plain HTTP on localhost.
  if (production) {
    headers.push({
      key: 'Strict-Transport-Security',
      value: 'max-age=31536000; includeSubDomains',
    });
  }

  return headers;
}

/** Every route, including the proxied `/api/*` and static assets. */
export const SECURITY_HEADER_SOURCE = '/:path*';
