import 'dotenv/config';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const file = process.argv[2] && path.resolve(process.argv[2]);
const databaseUrl = process.env.DATABASE_URL;
if (!file) throw new Error('Usage: npm run restore:pg -- <backup.dump>');
if (!databaseUrl)
  throw new Error('DATABASE_URL is required for native PostgreSQL restore');
try {
  execFileSync(
    'pg_restore',
    ['--clean', '--if-exists', '--no-owner', '--dbname', databaseUrl, file],
    { stdio: 'inherit' },
  );
} catch (cause) {
  const detail = cause instanceof Error ? cause.message : String(cause);
  throw new Error(
    `pg_restore is unavailable or failed. The JSON fallback is npm run db:restore -- <backup.json>. ${detail}`,
  );
}
console.log(`Native PostgreSQL backup restored from ${file}`);
