// @ts-nocheck - backup JSON is runtime-shaped.
import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pool } from '../backend/db.js';

export async function restoreBackup(filePath) {
  const dump = JSON.parse(await readFile(filePath, 'utf8'));
  if (dump.version !== 1 || !dump.tables)
    throw new Error('Unsupported EduQuest backup format');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const table of Object.keys(dump.tables))
      await client.query(`TRUNCATE TABLE "${table}" CASCADE`);
    for (const [table, data] of Object.entries(dump.tables)) {
      if (!data.rows.length) continue;
      const columns = data.columns.map((column) => `"${column}"`).join(',');
      const values = data.rows.map((row) => Object.values(row));
      for (const row of values) {
        const placeholders = row.map((_, index) => `$${index + 1}`).join(',');
        await client.query(
          `INSERT INTO "${table}" (${columns}) VALUES (${placeholders})`,
          row,
        );
      }
    }
    await client.query('COMMIT');
    return { filePath, tables: Object.keys(dump.tables).length };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

if (process.argv[1]?.endsWith('db-restore.mjs')) {
  if (!process.argv[2])
    throw new Error('Usage: node scripts/db-restore.mjs <backup.json>');
  const result = await restoreBackup(path.resolve(process.argv[2]));
  console.log(`Restored ${result.tables} tables from ${result.filePath}`);
  await pool.end();
}
