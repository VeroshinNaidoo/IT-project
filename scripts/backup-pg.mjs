import 'dotenv/config';
import { execFileSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const file = path.resolve(
  process.argv[2] || `backups/eduquest-${Date.now()}.dump`,
);
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl)
  throw new Error('DATABASE_URL is required for native PostgreSQL backup');
await mkdir(path.dirname(file), { recursive: true });
try {
  execFileSync(
    'pg_dump',
    ['--format=custom', '--no-owner', '--file', file, databaseUrl],
    {
      stdio: 'inherit',
    },
  );
} catch (cause) {
  const detail = cause instanceof Error ? cause.message : String(cause);
  throw new Error(
    `pg_dump is unavailable or failed. Use npm run db:backup for the JSON fallback. ${detail}`,
  );
}
console.log(`Native PostgreSQL backup written to ${file}`);
