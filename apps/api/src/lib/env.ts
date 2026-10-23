import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

const HERE = path.dirname(fileURLToPath(import.meta.url));
/** <root>/apps/api/src/lib -> <root> */
const REPO_ROOT = path.resolve(HERE, '../../../..');

// Shared root file first, then the app-local file (already-set vars win).
loadDotenv({ path: path.join(REPO_ROOT, '.env'), override: false, quiet: true });
loadDotenv({ path: path.join(REPO_ROOT, 'apps/api/.env'), override: false, quiet: true });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  WEB_ORIGIN: z.string().default('http://localhost:3000'),
  DATABASE_URL: z.string().optional(),
  TURSO_AUTH_TOKEN: z.string().optional(),
  JWT_SECRET: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('✖ Invalid environment configuration:');
  console.error(z.prettifyError(parsed.error));
  process.exit(1);
}

export const env = parsed.data;

export const APP_VERSION = '0.1.0';
export const REPO_ROOT_DIR = REPO_ROOT;

/** Origins allowed to call the API directly from a browser. */
export const allowedOrigins = [
  env.WEB_ORIGIN,
  'http://localhost:3000',
  'http://127.0.0.1:3000',
].filter((origin, index, list) => list.indexOf(origin) === index);
