import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Pool } = pg;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is required');
const pool = new Pool({ connectionString, ssl: process.env.DATABASE_SSL === 'false' ? false : undefined });

try {
  await pool.query('CREATE TABLE IF NOT EXISTS schema_migrations (filename TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL)');
  const files = (await readdir(path.join(root, 'migrations'))).filter((file) => file.endsWith('.sql')).sort();
  for (const filename of files) {
    const existing = await pool.query('SELECT 1 FROM schema_migrations WHERE filename = $1', [filename]);
    if (existing.rowCount) continue;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(await readFile(path.join(root, 'migrations', filename), 'utf8'));
      await client.query('INSERT INTO schema_migrations (filename, applied_at) VALUES ($1, now())', [filename]);
      await client.query('COMMIT');
      console.log(`applied ${filename}`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }
} finally { await pool.end(); }
