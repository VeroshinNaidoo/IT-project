import 'dotenv/config';
import crypto from 'node:crypto';
import { appendFile } from 'node:fs/promises';
import pg from 'pg';

const { Client } = pg;
if (!process.env.AI_SERVICE_TOKEN) {
  const token = crypto.randomBytes(32).toString('base64url');
  await appendFile('.env', `AI_SERVICE_TOKEN=${token}\n`, 'utf8');
  process.env.AI_SERVICE_TOKEN = token;
  console.log('Generated missing AI_SERVICE_TOKEN in .env');
}
const urls = [process.env.DATABASE_URL, process.env.TEST_DATABASE_URL];
if (urls.some((url) => !url))
  throw new Error('DATABASE_URL and TEST_DATABASE_URL are required');
for (const url of urls) {
  const client = new Client({ connectionString: url });
  await client.connect();
  const version = await client.query('select version()');
  console.log(version.rows[0].version);
  try {
    await client.query('create extension if not exists citext');
    console.log('citext available');
  } catch (error) {
    console.log(`citext unavailable: ${/** @type {Error} */ (error).message}`);
    console.log(
      'Approved fallback active: lowercased email plus unique lower(email) index.',
    );
  }
  await client.end();
}
