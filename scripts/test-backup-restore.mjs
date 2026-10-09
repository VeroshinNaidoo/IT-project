import 'dotenv/config';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
const { createBackup } = await import('./db-backup.mjs');
const { restoreBackup } = await import('./db-restore.mjs');
const { pool } = await import('../backend/db.js');
const directory = await mkdtemp(path.join(os.tmpdir(), 'eduquest-backup-'));
const filePath = path.join(directory, 'round-trip.json');
try {
  const before = (
    await pool.query(`SELECT count(*)::int AS count FROM schema_migrations`)
  ).rows[0].count;
  await createBackup(filePath);
  await restoreBackup(filePath);
  const after = (
    await pool.query(`SELECT count(*)::int AS count FROM schema_migrations`)
  ).rows[0].count;
  if (before !== after)
    throw new Error(
      `Backup round-trip changed migration count from ${before} to ${after}`,
    );
  console.log(`Backup/restore round-trip passed (${after} migrations)`);
} finally {
  await rm(directory, { recursive: true, force: true });
  await pool.end();
}
