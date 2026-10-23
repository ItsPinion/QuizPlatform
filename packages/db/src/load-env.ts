import { config as loadDotenv } from 'dotenv';
import path from 'node:path';

import { REPO_ROOT } from './env';

/**
 * Load env files for CLI scripts (seed / migrate / drizzle-kit).
 *
 * Precedence: already-set process.env wins; then repo root `.env`; then
 * `apps/api/.env`; then `packages/db/.env`. Both the shared root file and the
 * app-local file are supported so credentials can live in whichever place the
 * deploy story prefers.
 */
export function loadEnvFiles(): void {
  const candidates = [
    path.join(REPO_ROOT, '.env'),
    path.join(REPO_ROOT, 'apps/api/.env'),
    path.join(REPO_ROOT, 'packages/db/.env'),
  ];

  for (const file of candidates) {
    loadDotenv({ path: file, override: false, quiet: true });
  }
}
