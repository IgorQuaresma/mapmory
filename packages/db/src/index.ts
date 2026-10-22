import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema';

export * from './schema';
export { schema };

export type Database = NodePgDatabase<typeof schema>;

export function createDb(connectionString: string, options: { max?: number; applicationName?: string } = {}) {
  const pool = new pg.Pool({
    connectionString,
    max: options.max ?? 10,
    application_name: options.applicationName ?? 'mapmory',
    statement_timeout: 15_000,
  });
  return { db: drizzle(pool, { schema }), pool };
}
