import 'dotenv/config';
import { pool } from '../db.js';
import { generateSessionReminders } from '../src/groups/sessions.js';

let stopping = false;
for (const signal of ['SIGTERM', 'SIGINT'])
  process.once(signal, () => {
    stopping = true;
  });
console.log('EduQuest session reminder worker started');
while (!stopping) {
  try {
    await generateSessionReminders(pool);
  } catch {
    console.error('Session reminder pass failed; check database availability.');
  }
  if (process.argv.includes('--once')) break;
  for (let second = 0; second < 60 && !stopping; second++)
    await new Promise((resolve) => setTimeout(resolve, 1000));
}
await pool.end();
