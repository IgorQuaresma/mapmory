import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDb } from '@mapmory/db';

/** Runs migrations with the owner role (MIGRATION_DATABASE_URL); the app role cannot run DDL (plan §8.1). */
const url = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;
if (!url) throw new Error('MIGRATION_DATABASE_URL or DATABASE_URL is required');
const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = process.env.MIGRATIONS_DIR ?? path.resolve(here, '../../drizzle');
const { db, pool } = createDb(url, { max: 1, applicationName: 'mapmory-migrate' });
await migrate(db, { migrationsFolder });
await pool.end();
console.log('Migrations applied');
