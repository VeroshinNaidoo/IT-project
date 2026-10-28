// @ts-nocheck - integration suite drives runtime Express and PostgreSQL records.
import 'dotenv/config';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';

process.env.NODE_ENV = 'development';
process.env.COOKIE_SECURE = 'false';
process.env.AUTH_RATE_LIMIT = '1000';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
const { app } = await import('../src/app.js');
const { pool } = await import('../db.js');

const prefix = crypto.randomUUID().slice(0, 8);
const password = 'MemoryMatch123!';
const people = {
  lecturer: `${prefix}-memory-lecturer@example.com`,
  otherLecturer: `${prefix}-memory-other-lecturer@example.com`,
  student: `${prefix}-memory-student@example.com`,
  otherStudent: `${prefix}-memory-other-student@example.com`,
  locked: `${prefix}-memory-locked@example.com`,
  outsider: `${prefix}-memory-outsider@example.com`,
};
const fixture = { texts: new Map() };

async function addUser(name, role) {
  const userId = (
    await pool.query(
      `INSERT INTO users(email,password_hash,role,full_name)
       VALUES($1,$2,$3,$4) RETURNING user_id`,
      [people[name], await bcrypt.hash(password, 4), role, `Memory ${name}`],
    )
  ).rows[0].user_id;
  fixture[name] = userId;
  return userId;
}

async function addQuiz(
  moduleId,
  lecturerId,
  title,
  count,
  competitive = false,
) {
  const quizId = (
    await pool.query(
      `INSERT INTO quizzes(module_id,created_by,title,is_competitive,status)
       VALUES($1,$2,$3,$4,'published') RETURNING quiz_id`,
      [moduleId, lecturerId, title, competitive],
    )
  ).rows[0].quiz_id;
  const texts = [];
  for (let index = 0; index < count; index += 1) {
    const questionText = `${title} question ${index + 1}?`;
    const answerText = `${title} answer ${index + 1}`;
    const questionId = (
      await pool.query(
        `INSERT INTO questions(quiz_id,question_text,marks,difficulty_level,explanation)
         VALUES($1,$2,1,3,$3) RETURNING question_id`,
        [quizId, questionText, `${title} explanation ${index + 1}.`],
      )
    ).rows[0].question_id;
    await pool.query(
      `INSERT INTO question_options(question_id,option_text,is_correct)
       VALUES($1,$2,true),($1,$3,false)`,
      [questionId, answerText, `${title} distractor ${index + 1}`],
    );
    texts.push(questionText, answerText);
  }
  fixture.texts.set(quizId, texts);
  return quizId;
}

async function login(name) {
  const agent = request.agent(app);
  const response = await agent.post('/api/v1/auth/login').send({
    email: people[name],
    password,
  });
  expect(response.status).toBe(200);
  return agent;
}

async function start(agent, quizId) {
  return agent.post('/api/v1/games/memory-match/plays').send({ quizId });
}

beforeAll(async () => {
  await pool.query(
    "UPDATE game_types SET is_enabled=true WHERE key='memory_match'",
  );
  await addUser('lecturer', 'lecturer');
  await addUser('otherLecturer', 'lecturer');
  for (const name of ['student', 'otherStudent', 'locked', 'outsider'])
    await addUser(name, 'student');
  fixture.module = (
    await pool.query(
      `INSERT INTO modules(lecturer_id,module_code,module_name,join_code)
       VALUES($1,$2,'Memory Module',$3) RETURNING module_id`,
      [fixture.lecturer, `MM${prefix}`, `MMJOIN${prefix}`],
    )
  ).rows[0].module_id;
  fixture.otherModule = (
    await pool.query(
      `INSERT INTO modules(lecturer_id,module_code,module_name,join_code)
       VALUES($1,$2,'Other Memory Module',$3) RETURNING module_id`,
      [fixture.otherLecturer, `OM${prefix}`, `OMJOIN${prefix}`],
    )
  ).rows[0].module_id;
  for (const name of ['student', 'otherStudent', 'locked'])
    await pool.query(
      'INSERT INTO enrollments(student_id,module_id) VALUES($1,$2)',
      [fixture[name], fixture.module],
    );
  fixture.practice = await addQuiz(
    fixture.module,
    fixture.lecturer,
    'Memory Practice',
    6,
  );
  fixture.short = await addQuiz(
    fixture.module,
    fixture.lecturer,
    'Memory Short',
    5,
  );
  fixture.competitive = await addQuiz(
    fixture.module,
    fixture.lecturer,
    'Memory Competitive',
    6,
    true,
  );
  fixture.isolation = await addQuiz(
    fixture.module,
    fixture.lecturer,
    'Memory Isolation',
    6,
  );
  fixture.otherQuiz = await addQuiz(
    fixture.otherModule,
    fixture.otherLecturer,
    'Other Memory Quiz',
    6,
  );
});

describe.sequential('Memory Match start and refresh API', () => {
  it('start creates a play and returns opaque card ids and kinds only', async () => {
    const response = await start(await login('student'), fixture.practice);
    expect(response.status).toBe(200);
    fixture.playId = response.body.data.playId;
    expect(response.body.data.cards).toHaveLength(12);
    for (const card of response.body.data.cards) {
      expect(card.cardId).toMatch(/^[0-9a-f-]{36}$/i);
      expect(['question', 'answer']).toContain(card.kind);
      expect(card).not.toHaveProperty('text');
      expect(card).not.toHaveProperty('questionId');
      expect(card).not.toHaveProperty('pairKey');
    }
    expect(response.body.data.revealed).toEqual([]);
  });

  it('starting again returns the same in-progress play instead of a second one', async () => {
    const agent = await login('student');
    const first = await start(agent, fixture.practice);
    const second = await start(agent, fixture.practice);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body.data.playId).toBe(first.body.data.playId);
    const count = await pool.query(
      `SELECT count(*)::int AS count FROM game_plays p JOIN game_types gt ON gt.game_type_id=p.game_type_id
       WHERE gt.key='memory_match' AND p.student_id=$1 AND p.quiz_id=$2 AND p.status='in_progress'`,
      [fixture.student, fixture.practice],
    );
    expect(count.rows[0].count).toBe(1);
  });

  it('refuses fewer than six eligible questions with the standard error shape and reason', async () => {
    const response = await start(await login('student'), fixture.short);
    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error: expect.objectContaining({
        code: 'NOT_ENOUGH_QUESTIONS',
        message: expect.stringContaining('at least 6 eligible questions'),
      }),
    });
  });

  it('refuses a student who is not enrolled in the module', async () => {
    const response = await start(await login('outsider'), fixture.practice);
    expect(response.status).toBe(403);
    expect(response.body.error).toMatchObject({ code: 'FORBIDDEN' });
  });

  it('blocks competitive play before the scored attempt and allows it after completion', async () => {
    const agent = await login('locked');
    const blocked = await start(agent, fixture.competitive);
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('GAME_LOCKED');
    await pool.query(
      `INSERT INTO quiz_attempts(quiz_id,student_id,score,completion_time,is_scored)
       VALUES($1,$2,0,now(),true)`,
      [fixture.competitive, fixture.locked],
    );
    const allowed = await start(agent, fixture.competitive);
    expect(allowed.status).toBe(200);
    expect(allowed.body.data.playId).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it("allows a lecturer on their own quiz but refuses another lecturer's quiz", async () => {
    const lecturer = await login('lecturer');
    expect((await start(lecturer, fixture.practice)).status).toBe(200);
    const denied = await start(lecturer, fixture.otherQuiz);
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe('FORBIDDEN');
  });

  it("never exposes an unflipped card's question or answer text in start or get", async () => {
    const agent = await login('student');
    const started = await start(agent, fixture.practice);
    const refreshed = await agent.get(
      `/api/v1/games/memory-match/plays/${started.body.data.playId}`,
    );
    expect(refreshed.status).toBe(200);
    for (const response of [started, refreshed]) {
      const serialized = JSON.stringify(response.body);
      for (const text of fixture.texts.get(fixture.practice))
        expect(serialized).not.toContain(text);
    }
  });

  it("GET refuses another student's play", async () => {
    const response = await (
      await login('otherStudent')
    ).get(`/api/v1/games/memory-match/plays/${fixture.playId}`);
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });

  it('starting a play does not change leaderboard rows, scored attempts, or analytics figures', async () => {
    const lecturer = await login('lecturer');
    const leaderboardBefore = await lecturer.get(
      `/api/v1/modules/${fixture.module}/leaderboard`,
    );
    const analyticsBefore = await lecturer.get(
      `/api/v1/modules/${fixture.module}/analytics`,
    );
    const countsBefore = (
      await pool.query(
        `SELECT
          (SELECT count(*)::int FROM quiz_attempts) AS attempts,
          (SELECT count(*)::int FROM student_answers) AS answers`,
      )
    ).rows[0];
    expect(
      (await start(await login('student'), fixture.isolation)).status,
    ).toBe(200);
    const countsAfter = (
      await pool.query(
        `SELECT
          (SELECT count(*)::int FROM quiz_attempts) AS attempts,
          (SELECT count(*)::int FROM student_answers) AS answers`,
      )
    ).rows[0];
    const leaderboardAfter = await lecturer.get(
      `/api/v1/modules/${fixture.module}/leaderboard`,
    );
    const analyticsAfter = await lecturer.get(
      `/api/v1/modules/${fixture.module}/analytics`,
    );
    expect(countsAfter).toEqual(countsBefore);
    expect(leaderboardAfter.body).toEqual(leaderboardBefore.body);
    expect(analyticsAfter.body).toEqual(analyticsBefore.body);
  });
});
