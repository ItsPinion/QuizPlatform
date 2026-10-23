import path from 'node:path';

import { z } from 'zod';

import { loadEnvFiles } from '@quiz/db/load-env';
import { REPO_ROOT } from '@quiz/db/env';

loadEnvFiles();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  WEB_ORIGIN: z.string().default('http://localhost:3000'),
  TURSO_DATABASE_URL: z.string().optional(),
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
