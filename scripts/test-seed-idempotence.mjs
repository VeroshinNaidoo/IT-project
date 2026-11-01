// @ts-nocheck - subprocess and database shapes are runtime-only.
import 'dotenv/config';
import { spawn } from 'node:child_process';
import pg from 'pg';

const testUrl = process.env.TEST_DATABASE_URL;
const devUrl = process.env.DATABASE_URL;
if (!testUrl) throw new Error('TEST_DATABASE_URL is required for seed tests.');
if (testUrl === devUrl)
  throw new Error('Seed tests refuse the development database.');

function run(command, args, input = '', extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: {
        ...process.env,
        DATABASE_URL: testUrl,
        TEST_DATABASE_URL: testUrl,
        ...extraEnv,
      },
      stdio: ['pipe', 'ignore', 'pipe'],
      shell: false,
    });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.stdin.end(input);
    child.once('error', reject);
    child.once('exit', (code) =>
      code === 0
        ? resolve()
        : reject(new Error(stderr || `${command} failed with ${code}`)),
    );
  });
}

await run(process.execPath, ['backend/scripts/reset-test-db.js']);
await run(process.execPath, ['backend/scripts/seed.js']);
const pool = new pg.Pool({ connectionString: testUrl, max: 2 });
const counts = async () =>
  (
    await pool.query(`SELECT
  (SELECT count(*)::int FROM quizzes) quizzes,
  (SELECT count(*)::int FROM questions) questions,
  (SELECT count(*)::int FROM quiz_attempts) attempts,
  (SELECT count(*)::int FROM game_plays) plays`)
  ).rows[0];
const first = await counts();
await pool.query(`INSERT INTO game_plays(game_type_id,student_id,quiz_id,status,state,score,completed_at)
  SELECT gt.game_type_id,u.user_id,q.quiz_id,'finished','{"version":1}'::jsonb,7,now()
  FROM game_types gt, users u, quizzes q
  WHERE gt.key='infected' AND u.email='demo-student-1@example.com' AND q.title='Demo practice quiz'
  LIMIT 1`);
const withPlay = await counts();
await run(process.execPath, ['backend/scripts/seed.js']);
const second = await counts();
if (
  first.quizzes !== second.quizzes ||
  first.questions !== second.questions ||
  first.attempts !== second.attempts ||
  second.plays !== withPlay.plays
)
  throw new Error('Seed is not idempotent or removed an existing game play.');
await run(process.execPath, ['backend/scripts/seed-reset.js'], 'NO\n');
const afterCancel = await counts();
if (
  afterCancel.quizzes !== second.quizzes ||
  afterCancel.plays !== second.plays
)
  throw new Error('Cancelled seed reset changed data.');
let productionRefused = false;
try {
  await run(
    process.execPath,
    ['backend/scripts/seed-reset.js'],
    'RESET DEMO DATA\n',
    { NODE_ENV: 'production' },
  );
} catch {
  productionRefused = true;
}
if (!productionRefused)
  throw new Error('Seed reset did not refuse an unconfirmed reset.');
console.log(
  `Seed safety passed: counts unchanged (${second.quizzes} quizzes, ${second.questions} questions, ${second.attempts} attempts, ${second.plays} plays).`,
);
await pool.end();
