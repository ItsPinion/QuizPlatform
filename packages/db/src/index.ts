import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql';

import { resolveDatabaseConfig } from './env';
import * as schema from './schema';

export type Database = LibSQLDatabase<typeof schema>;

interface DbGlobal {
  db?: Database;
  url?: string;
}

/** Keeps a single connection across HMR reloads / module re-evaluations. */
const globalForDb = globalThis as unknown as { __quizDb?: DbGlobal };

function buildDatabase(): Database {
  const { url, authToken } = resolveDatabaseConfig();

  // Mirrors the official Drizzle + Turso setup: drizzle creates and owns the
  // libSQL client for us, so there is no hand-written driver glue.
  const instance = drizzle({
    connection: {
      url,
      ...(authToken ? { authToken } : {}),
    },
    schema,
    casing: 'snake_case',
  });

  // Turso enables foreign keys by default; local SQLite files need the pragma
  // so cascade/restrict behaviour matches between environments.
  void instance.$client.execute('PRAGMA foreign_keys = ON').catch((error: unknown) => {
    console.warn('[db] could not enable foreign_keys pragma:', error);
  });

  return instance;
}

function getDb(): Database {
  const { url } = resolveDatabaseConfig();

  if (!globalForDb.__quizDb || globalForDb.__quizDb.url !== url) {
    globalForDb.__quizDb = { db: buildDatabase(), url };
  }

  return globalForDb.__quizDb.db as Database;
}

/**
 * Lazily-instantiated Drizzle client.
 *
 * Exported as a proxy so importing this module never opens a connection
 * (important for builds, tests and `next build`), while call sites keep the
 * familiar `db.select()…` form.
 */
export const db = new Proxy({} as Database, {
  get(_target, property, receiver) {
    const instance = getDb();
    const value = Reflect.get(instance as object, property, receiver);
    return typeof value === 'function' ? value.bind(instance) : value;
  },
});

export function getDatabaseConfig() {
  return resolveDatabaseConfig();
}

export { schema };
export * from './schema';
