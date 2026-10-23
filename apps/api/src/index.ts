import { serve } from '@hono/node-server';
import { getDatabaseConfig } from '@quiz/db';

import { app } from './app';
import { env } from './lib/env';

const config = getDatabaseConfig();

serve({ fetch: app.fetch, port: env.API_PORT, hostname: '0.0.0.0' }, (info) => {
  console.log('');
  console.log(`  ▸ Quiz API      http://localhost:${info.port}`);
  console.log(`  ▸ Health        http://localhost:${info.port}/api/health`);
  console.log(`  ▸ Database      ${config.urlHint} [${config.target}]`);
  if (config.isFallback) {
    console.log(
      '    ⚠ Using the local fallback DB — set DATABASE_URL + TURSO_AUTH_TOKEN for Turso.',
    );
  }
  console.log('');
});

function shutdown(signal: string) {
  console.log(`\n▸ ${signal} received, shutting down.`);
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
