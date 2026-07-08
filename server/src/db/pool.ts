import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { DATABASE_URL } from '../env';

const { Pool } = pg;

/** Shared connection pool for the whole process. */
export const pool = new Pool({ connectionString: DATABASE_URL });

const here = dirname(fileURLToPath(import.meta.url));

/** Apply the idempotent schema so the tables exist. Safe to run on every boot. */
export async function applySchema(): Promise<void> {
  const sql = readFileSync(join(here, 'schema.sql'), 'utf8');
  await pool.query(sql);
}
