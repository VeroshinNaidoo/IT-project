import 'dotenv/config';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from '../db.js';

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../db/migrations',
);
await pool.query(
  'CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())',
);
const applied = new Set(
  (await pool.query('SELECT version FROM schema_migrations')).rows.map(
    (row) => row.version,
  ),
);
const files = (await readdir(root))
  .filter((file) => file.endsWith('.sql'))
  .sort();
for (const file of files) {
  if (applied.has(file)) {
    console.log(`Skipped ${file} (already applied)`);
    continue;
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(await readFile(path.join(root, file), 'utf8'));
    await client.query('INSERT INTO schema_migrations(version) VALUES ($1)', [
      file,
    ]);
    await client.query('COMMIT');
    console.log(`Applied ${file}`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
await pool.end();
