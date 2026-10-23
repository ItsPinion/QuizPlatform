import fs from 'node:fs';
import path from 'node:path';

import { migrate } from 'drizzle-orm/libsql/migrator';

import { loadEnvFiles } from './load-env';
import { LOCAL_DB_PATH, REPO_ROOT, resolveDatabaseConfig } from './env';
import { db, getDatabaseClient } from './index';

loadEnvFiles();

const MIGRATIONS_DIR = path.join(REPO_ROOT, 'packages/db/migrations');

async function main() {
  const config = resolveDatabaseConfig();

  if (!fs.existsSync(MIGRATIONS_DIR)) {
    throw new Error(
      `No migrations found at ${MIGRATIONS_DIR}. Run \`pnpm db:generate\` first to create them from the schema.`,
    );
  }

  if (config.target === 'local-file') {
    fs.mkdirSync(path.dirname(LOCAL_DB_PATH), { recursive: true });
  }

  console.log(`▸ Applying migrations to ${config.urlHint} (${config.target})`);

  await migrate(db, { migrationsFolder: MIGRATIONS_DIR });

  const client = getDatabaseClient();
  const result = await client.execute(
    "select name from sqlite_master where type = 'table' and name not like 'sqlite_%' order by name",
  );

  console.log(`✔ Migrations applied. Tables: ${result.rows.map((row) => row.name).join(', ')}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('✖ Migration failed:', error);
    process.exit(1);
  });
