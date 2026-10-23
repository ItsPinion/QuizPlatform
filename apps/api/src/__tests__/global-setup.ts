import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { REPO_ROOT, TEST_DB_PATH, TEST_DB_URL } from './test-db';

/**
 * Builds a throwaway database for the API tests with the project's own
 * toolchain: `drizzle-kit migrate` applies the migrations, then the seed
 * script loads demo data.
 */
export default function setup() {
  fs.mkdirSync(path.dirname(TEST_DB_PATH), { recursive: true });
  for (const suffix of ['', '-journal', '-wal', '-shm']) {
    fs.rmSync(`${TEST_DB_PATH}${suffix}`, { force: true });
  }

  const dbDir = path.join(REPO_ROOT, 'packages/db');
  const env = {
    ...process.env,
    TURSO_DATABASE_URL: TEST_DB_URL,
    DATABASE_URL: '',
    TURSO_AUTH_TOKEN: '',
    NODE_ENV: 'test',
  };

  const steps: [string, string[]][] = [
    ['drizzle-kit', ['migrate']],
    ['tsx', ['src/seed.ts']],
  ];

  for (const [bin, args] of steps) {
    const result = spawnSync('pnpm', ['exec', bin, ...args], {
      cwd: dbDir,
      env,
      encoding: 'utf8',
    });

    if (result.status !== 0) {
      throw new Error(
        `Failed to prepare test database (${bin} ${args.join(' ')}):\n${result.stdout}\n${result.stderr}`,
      );
    }
  }
}
