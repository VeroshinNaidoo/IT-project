// @ts-nocheck
import 'dotenv/config';
import { spawn } from 'node:child_process';
import { readFile, rm, unlink } from 'node:fs/promises';
import pg from 'pg';

const env = {
  ...process.env,
  DATABASE_URL:
    'postgres://postgres:postgres@127.0.0.1:55434/eduquest_e2e?sslmode=disable',
  TEST_DATABASE_URL:
    'postgres://postgres:postgres@127.0.0.1:55434/eduquest_e2e?sslmode=disable',
  PORT: '4191',
  BACKEND_PORT: '4191',
  AI_PORT: '8191',
  AI_SERVICE_URL: 'http://127.0.0.1:8191',
  VITE_PORT: '5191',
  AI_PROVIDER: 'mock',
};

const dbUrl = env.DATABASE_URL;
const dbPidPath = '.pglite-e2e.pid';
const oldPid = Number(await readFile(dbPidPath, 'utf8').catch(() => '0'));
if (oldPid) {
  try {
    process.kill(oldPid, 'SIGTERM');
  } catch {}
  await new Promise((resolve) => setTimeout(resolve, 500));
}
await unlink(dbPidPath).catch(() => {});
await rm('.pgdata/e2e-suite', { recursive: true, force: true });
const db = spawn(
  process.execPath,
  ['scripts/pglite-server.mjs', 'daemon', 'e2e'],
  {
    cwd: process.cwd(),
    env: { ...env, PGLITE_E2E_PORT: '55434' },
    stdio: 'inherit',
    windowsHide: true,
  },
);
const waitForDatabase = async () => {
  let lastError;
  for (let i = 0; i < 100; i += 1) {
    const client = new pg.Client({
      connectionString: dbUrl,
      connectionTimeoutMillis: 500,
    });
    try {
      await client.connect();
      await client.query('select 1');
      await client.end();
      return;
    } catch (error) {
      lastError = error;
      await client.end().catch(() => {});
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error(
    `E2E database did not start: ${lastError?.message ?? 'unknown error'}`,
  );
};
const runSetup = (script) =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script], {
      cwd: process.cwd(),
      env: { ...env, DATABASE_URL: dbUrl, TEST_DATABASE_URL: dbUrl },
      stdio: 'inherit',
      windowsHide: true,
    });
    child.once('error', reject);
    child.once('exit', (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`${script} exited with ${code}`)),
    );
  });

await waitForDatabase();
await runSetup('backend/scripts/reset-test-db.js');
await runSetup('backend/scripts/seed.js');

const commands = [
  [process.execPath, ['backend/src/index.js']],
  ['python', ['ai-service/run.py']],
  [process.execPath, ['backend/scripts/ai-worker.js']],
  [
    process.execPath,
    ['node_modules/vite/bin/vite.js', '--config', 'frontend/vite.config.js'],
  ],
];
const children = commands.map(([command, args]) =>
  spawn(command, args, {
    cwd: process.cwd(),
    env,
    stdio: 'inherit',
    windowsHide: true,
  }),
);
let stopping = false;
const stop = (code = 0) => {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill('SIGTERM');
  db.kill('SIGTERM');
  void unlink(dbPidPath);
  setTimeout(() => process.exit(code), 500).unref();
};
for (const [index, child] of children.entries())
  child.once('exit', (code, signal) => {
    console.error(
      `[e2e-stack] child ${commands[index][0]} ${commands[index][1][0]} exited code=${code} signal=${signal ?? 'none'}`,
    );
    if (!stopping && code !== 0) stop(code || 1);
  });
process.once('SIGINT', () => stop());
process.once('SIGTERM', () => stop());
setInterval(() => {}, 2 ** 31 - 1);
