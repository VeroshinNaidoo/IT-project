// @ts-nocheck - database metadata is runtime-shaped.
import 'dotenv/config';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pool } from '../backend/db.js';

export async function createBackup(filePath) {
  const tables = (
    await pool.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name`,
    )
  ).rows.map((row) => row.table_name);
  const dump = { version: 1, createdAt: new Date().toISOString(), tables: {} };
  for (const table of tables) {
    const columns = (
      await pool.query(
        `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position`,
        [table],
      )
    ).rows.map((row) => row.column_name);
    dump.tables[table] = {
      columns,
      rows: (await pool.query(`SELECT * FROM "${table}"`)).rows,
    };
  }
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(dump, null, 2));
  return { filePath, tables: tables.length };
}

if (process.argv[1]?.endsWith('db-backup.mjs')) {
  const filePath = path.resolve(
    process.argv[2] || `backups/eduquest-${Date.now()}.json`,
  );
  const result = await createBackup(filePath);
  console.log(`Backup written to ${result.filePath} (${result.tables} tables)`);
  await pool.end();
}
