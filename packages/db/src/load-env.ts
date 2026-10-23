import path from 'node:path';

import { config as loadDotenv } from 'dotenv';

import { REPO_ROOT } from './env';

/**
 * Load env files for the API and for CLI scripts (seed / migrate / status).
 *
 * Precedence (highest first):
 *   1. variables already present in `process.env` (CI, hosting platform)
 *   2. `.env.local` — machine-specific overrides, gitignored
 *   3. `.env`       — shared configuration (e.g. Turso credentials)
 *
 * dotenv never overrides an existing value, so loading `.env.local` first is
 * enough to give it precedence over `.env`.
 */
const ENV_FILES = [path.join(REPO_ROOT, '.env.local'), path.join(REPO_ROOT, '.env')];

export function loadEnvFiles(): void {
  for (const file of ENV_FILES) {
    loadDotenv({ path: file, override: false, quiet: true });
  }
}
