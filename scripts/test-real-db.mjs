import 'dotenv/config';
import { spawn } from 'node:child_process';

if (!process.env.REAL_TEST_DATABASE_URL)
  throw new Error(
    'REAL_TEST_DATABASE_URL is required for real PostgreSQL verification',
  );
const child = spawn(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['vitest', 'run', 'backend/tests/database.invariants.test.js'],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      TEST_DATABASE_URL: process.env.REAL_TEST_DATABASE_URL,
    },
  },
);
child.on('exit', (code) => process.exit(code ?? 1));
