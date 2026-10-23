import type { NextConfig } from 'next';

import { SECURITY_HEADER_SOURCE, securityHeaders } from './src/lib/security-headers';

const apiInternalUrl = process.env.API_INTERNAL_URL ?? 'http://localhost:3001';
const isDev = process.env.NODE_ENV !== 'production';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Workspace packages ship TypeScript source; let Next compile them.
  transpilePackages: ['@quiz/shared', '@quiz/api', '@quiz/db'],
  // Sandbox previews are served from *.e2b.app hosts.
  allowedDevOrigins: ['*.e2b.app', '*.e2b.dev', '*.arena.ai', 'localhost:3000'],
  // CSP, nosniff, a referrer policy and a closed-down Permissions-Policy on every
  // response. The policy lives in `src/lib/security-headers.ts` so it is unit
  // tested rather than trusted.
  async headers() {
    return [
      {
        source: SECURITY_HEADER_SOURCE,
        headers: securityHeaders({
          dev: isDev,
          production: process.env.NODE_ENV === 'production',
        }),
      },
    ];
  },
  async rewrites() {
    return [
      // Same-origin proxy so browser calls to /api/* reach the Hono server and
      // httpOnly auth cookies stay on the web origin.
      { source: '/api/:path*', destination: `${apiInternalUrl}/api/:path*` },
    ];
  },
};

export default nextConfig;
