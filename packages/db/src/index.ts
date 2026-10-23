import { createClient, type Client } from '@libsql/client';
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql';

import { resolveDatabaseConfig } from './env';
import * as schema from './schema';

export type Database = LibSQLDatabase<typeof schema>;

interface DbGlobal {
  client?: Client;
  db?: Database;
  url?: string;
}

/** Keeps a single client across HMR reloads / module re-evaluations. */
const globalForDb = globalThis as unknown as { __quizDb?: DbGlobal };

function buildClient(): { client: Client; db: Database } {
  const config = resolveDatabaseConfig();

  const client = createClient({
    url: config.url,
    ...(config.authToken ? { authToken: config.authToken } : {}),
  });

  return { client, db: drizzle(client, { schema, casing: 'snake_case' }) };
}

function getDb(): Database {
  const config = resolveDatabaseConfig();

  if (!globalForDb.__quizDb || globalForDb.__quizDb.url !== config.url) {
    globalForDb.__quizDb = { ...buildClient(), url: config.url };
  }

  return globalForDb.__quizDb.db as Database;
}

/**
 * Lazily-instantiated Drizzle client.
 *
 * Exported as a proxy so importing this module never opens a connection
 * (important for builds, tests and `next build`), while call sites can keep
 * using the familiar `db.select()…` form.
 */
export const db = new Proxy({} as Database, {
  get(_target, property, receiver) {
    const instance = getDb();
    const value = Reflect.get(instance as object, property, receiver);
    return typeof value === 'function' ? value.bind(instance) : value;
  },
});

export function getDatabaseClient(): Client {
  getDb();
  return globalForDb.__quizDb?.client as Client;
}

export function getDatabaseConfig() {
  return resolveDatabaseConfig();
}

export { schema };
export * from './schema';
