import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** <repo> — apps/api/src/__tests__ -> repo root */
export const REPO_ROOT = path.resolve(HERE, '../../../..');

/** Dedicated database file for API tests; never the dev database. */
export const TEST_DB_PATH = path.join(REPO_ROOT, '.data', 'test-api.db');
export const TEST_DB_URL = `file:${TEST_DB_PATH}`;
