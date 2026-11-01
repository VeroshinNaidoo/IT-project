import 'dotenv/config';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { pool } from '../db.js';

if (process.env.NODE_ENV === 'production')
  throw new Error('seed:reset is disabled when NODE_ENV=production.');

const rl = readline.createInterface({ input, output });
const answer = await rl.question('Type RESET DEMO DATA to continue: ');
rl.close();
if (answer !== 'RESET DEMO DATA') {
  console.log('Seed reset cancelled.');
  await pool.end();
  process.exit(0);
}

const client = await pool.connect();
try {
  await client.query('BEGIN');
  const ids = (
    await client.query(
      `SELECT q.quiz_id
       FROM quizzes q JOIN modules m ON m.module_id=q.module_id
       WHERE m.module_code='DEMO101'`,
    )
  ).rows.map((row) => row.quiz_id);
  if (ids.length) {
    await client.query(
      `DELETE FROM student_answers WHERE attempt_id IN (SELECT attempt_id FROM quiz_attempts WHERE quiz_id = ANY($1::uuid[]))`,
      [ids],
    );
    await client.query(
      'DELETE FROM quiz_attempts WHERE quiz_id = ANY($1::uuid[])',
      [ids],
    );
    await client.query(
      'DELETE FROM game_personal_bests WHERE quiz_id = ANY($1::uuid[])',
      [ids],
    );
    await client.query(
      'DELETE FROM game_play_moves WHERE play_id IN (SELECT play_id FROM game_plays WHERE quiz_id = ANY($1::uuid[]))',
      [ids],
    );
    await client.query(
      'DELETE FROM game_plays WHERE quiz_id = ANY($1::uuid[])',
      [ids],
    );
    await client.query(
      'DELETE FROM game_turn_cards WHERE turn_id IN (SELECT turn_id FROM game_turns WHERE session_id IN (SELECT session_id FROM game_sessions WHERE game_id IN (SELECT game_id FROM games WHERE quiz_id = ANY($1::uuid[]))))',
      [ids],
    );
    await client.query(
      'DELETE FROM game_turns WHERE session_id IN (SELECT session_id FROM game_sessions WHERE game_id IN (SELECT game_id FROM games WHERE quiz_id = ANY($1::uuid[])))',
      [ids],
    );
    await client.query(
      'DELETE FROM game_sessions WHERE game_id IN (SELECT game_id FROM games WHERE quiz_id = ANY($1::uuid[]))',
      [ids],
    );
    await client.query('DELETE FROM games WHERE quiz_id = ANY($1::uuid[])', [
      ids,
    ]);
    await client.query(
      'DELETE FROM question_options WHERE question_id IN (SELECT question_id FROM questions WHERE quiz_id = ANY($1::uuid[]))',
      [ids],
    );
    await client.query(
      'DELETE FROM questions WHERE quiz_id = ANY($1::uuid[])',
      [ids],
    );
    await client.query('DELETE FROM quizzes WHERE quiz_id = ANY($1::uuid[])', [
      ids,
    ]);
  }
  await client.query(
    "DELETE FROM resources WHERE module_id=(SELECT module_id FROM modules WHERE module_code='DEMO101') AND title='Demo revision notes'",
  );
  await client.query(
    "DELETE FROM group_members WHERE group_id IN (SELECT group_id FROM study_groups WHERE module_id=(SELECT module_id FROM modules WHERE module_code='DEMO101'))",
  );
  await client.query(
    "DELETE FROM study_groups WHERE module_id=(SELECT module_id FROM modules WHERE module_code='DEMO101') AND group_name IN ('Alpha Group','Beta Group')",
  );
  await client.query('COMMIT');
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
  await pool.end();
}

const child = (await import('node:child_process')).spawn(
  process.execPath,
  ['backend/scripts/seed.js'],
  {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
    shell: false,
  },
);
child.once('exit', (code) => process.exit(code ?? 1));
