/**
 * Runs a workspace binary (tsx, drizzle-kit, …) without assuming a package
 * manager, so the tests behave the same under bun, pnpm or npm.
 */
import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

/** <repo root> — this file lives in packages/test-utils/src/ */
export const REPO_ROOT = path.resolve(__dirname, '../../..');

function findLocalBinary(bin: string, searchDirs: string[]): string | null {
  for (const dir of searchDirs) {
    const candidate = path.join(dir, 'node_modules', '.bin', bin);
    if (fs.existsSync(candidate)) return candidate;
  }

  return null;
}

/**
 * Detects the package manager.
 *
 * `packageManager` in the root package.json is authoritative — lockfiles are
 * gitignored here, so a fresh clone has none until `bun install` runs.
 */
export function detectPackageManager(): 'bun' | 'pnpm' | 'npm' {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8')) as {
      packageManager?: string;
    };
    const name = pkg.packageManager?.split('@')[0];
    if (name === 'bun' || name === 'pnpm' || name === 'npm') return name;
  } catch {
    // fall through to the lockfile heuristics
  }

  if (
    fs.existsSync(path.join(REPO_ROOT, 'bun.lock')) ||
    fs.existsSync(path.join(REPO_ROOT, 'bun.lockb'))
  ) {
    return 'bun';
  }
  if (fs.existsSync(path.join(REPO_ROOT, 'pnpm-lock.yaml'))) return 'pnpm';
  return 'npm';
}

export function runBin(
  bin: string,
  args: string[],
  options: { cwd: string; env?: NodeJS.ProcessEnv },
): SpawnSyncReturns<string> {
  const local = findLocalBinary(bin, [options.cwd, REPO_ROOT]);
  const env = { ...process.env, ...options.env };

  if (local) {
    return spawnSync(local, args, { cwd: options.cwd, env, encoding: 'utf8' });
  }

  // No hoisted binary: delegate to the package manager's exec command.
  const pm = detectPackageManager();
  const execArgs = pm === 'npm' ? ['exec', '--', bin, ...args] : ['exec', bin, ...args];

  return spawnSync(pm, execArgs, { cwd: options.cwd, env, encoding: 'utf8' });
}
