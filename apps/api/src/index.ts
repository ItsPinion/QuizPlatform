import { serve } from '@hono/node-server';
import { getDatabaseConfig } from '@quiz/db';

import { app } from './app';
import { env } from './lib/env';

let config: ReturnType<typeof getDatabaseConfig>;

try {
  config = getDatabaseConfig();
} catch (error) {
  console.error('');
  console.error('  ✖ Database is not configured.');
  console.error(error instanceof Error ? error.message : error);
  console.error('');
  process.exit(1);
}

serve({ fetch: app.fetch, port: env.API_PORT, hostname: '0.0.0.0' }, (info) => {
  console.log('');
  console.log(`  ▸ Quiz API      http://localhost:${info.port}`);
  console.log(`  ▸ Health        http://localhost:${info.port}/api/health`);
  console.log(`  ▸ Database      ${config.urlHint} [${config.target}]`);
  console.log('');
});

function shutdown(signal: string) {
  console.log(`\n▸ ${signal} received, shutting down.`);
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
