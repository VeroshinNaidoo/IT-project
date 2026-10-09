import 'dotenv/config';

const testUrl = process.env.TEST_DATABASE_URL;
const optOut = process.env.EDUQUEST_SKIP_DB_TESTS === 'true';
if (!testUrl) {
  if (optOut) {
    console.warn(
      'WARNING: EDUQUEST_SKIP_DB_TESTS=true; database reset skipped explicitly.',
    );
    process.exit(2);
  }
  throw new Error(
    'TEST_DATABASE_URL is required for the test database reset. Set it in EduQuest .env or explicitly set EDUQUEST_SKIP_DB_TESTS=true to opt out.',
  );
}

process.env.DATABASE_URL = testUrl;
const pg = await import('pg');
const client = new pg.default.Client({ connectionString: testUrl });
await client.connect();
try {
  await client.query('DROP SCHEMA public CASCADE');
  await client.query('CREATE SCHEMA public');
  await client.query('GRANT ALL ON SCHEMA public TO public');
  console.log('Reset test database schema public');
} finally {
  await client.end();
}
await import('./migrate.js');
