import type { NextConfig } from 'next';

const apiInternalUrl = process.env.API_INTERNAL_URL ?? 'http://localhost:3001';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Workspace packages ship TypeScript source; let Next compile them.
  transpilePackages: ['@quiz/shared', '@quiz/api', '@quiz/db'],
  // Sandbox previews are served from *.e2b.app hosts.
  allowedDevOrigins: ['*.e2b.app', '*.e2b.dev', '*.arena.ai', 'localhost:3000'],
  async rewrites() {
    return [
      // Same-origin proxy so browser calls to /api/* reach the Hono server and
      // httpOnly auth cookies stay on the web origin.
      { source: '/api/:path*', destination: `${apiInternalUrl}/api/:path*` },
    ];
  },
};

export default nextConfig;
