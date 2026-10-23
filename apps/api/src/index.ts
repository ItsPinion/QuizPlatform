import { serve } from '@hono/node-server';
import { getDatabaseConfig } from '@quiz/db';

import { app } from './app';
import { resolveJwtSecret } from './lib/auth';
import { env } from './lib/env';

/**
 * The API always talks to Turso Cloud. If the credentials are not present yet
 * the server still boots (so `/api/health` and the web app stay reachable) but
 * every database-backed route answers 503 until they are configured.
 */
let databaseSummary = 'not configured';

try {
  const config = getDatabaseConfig();
  databaseSummary = `${config.urlHint} [${config.target}]`;
} catch (error) {
  databaseSummary = 'not configured — set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN';
  console.warn('');
  console.warn('  ⚠ Turso Cloud credentials are missing.');
  console.warn(error instanceof Error ? error.message.split('\n')[0] : error);
  console.warn('  Copy .env.example to .env and fill in your Turso URL and token.');
}

/**
 * Fail fast in production when sessions cannot be signed securely. Locally this
 * just returns the development secret (and warns), so `bun dev` stays one step.
 */
try {
  resolveJwtSecret();
} catch (error) {
  console.error('✖ Authentication is misconfigured:');
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

serve({ fetch: app.fetch, port: env.API_PORT, hostname: '0.0.0.0' }, (info) => {
  console.log('');
  console.log(`  ▸ Quiz API      http://localhost:${info.port}`);
  console.log(`  ▸ Health        http://localhost:${info.port}/api/health`);
  console.log(`  ▸ Database      ${databaseSummary}`);
  console.log('');
});

function shutdown(signal: string) {
  console.log(`\n▸ ${signal} received, shutting down.`);
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
