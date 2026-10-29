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
const password = 'PixelRacer123!';
const people = {
  lecturer: `${prefix}-pixel-lecturer@example.com`,
  otherLecturer: `${prefix}-pixel-other-lecturer@example.com`,
  racer: `${prefix}-pixel-racer@example.com`,
  locked: `${prefix}-pixel-locked@example.com`,
  outsider: `${prefix}-pixel-outsider@example.com`,
  otherStudent: `${prefix}-pixel-other-student@example.com`,
};
const fixture = { options: new Map() };

async function addUser(person, role) {
  return (
    await pool.query(
      `INSERT INTO users(email,password_hash,role,full_name)
       VALUES($1,$2,$3,$4) RETURNING user_id`,
      [people[person], await bcrypt.hash(password, 4), role, `Pixel ${person}`],
    )
  ).rows[0].user_id;
}

async function addQuiz(
  moduleId,
  lecturerId,
  title,
  count = 10,
  competitive = false,
) {
  const quizId = (
    await pool.query(
      `INSERT INTO quizzes(module_id,created_by,title,is_competitive,status)
       VALUES($1,$2,$3,$4,'published') RETURNING quiz_id`,
      [moduleId, lecturerId, title, competitive],
    )
  ).rows[0].quiz_id;
  for (let index = 0; index < count; index += 1) {
    const questionId = (
      await pool.query(
        `INSERT INTO questions(
           quiz_id,question_text,marks,difficulty_level,explanation
         ) VALUES($1,$2,1,$3,$4) RETURNING question_id`,
        [
          quizId,
          `${title} question ${index + 1}?`,
          (index % 5) + 1,
          `${title} explanation ${index + 1}.`,
        ],
      )
    ).rows[0].question_id;
    const correct = (
      await pool.query(
        `INSERT INTO question_options(question_id,option_text,is_correct)
         VALUES($1,$2,true) RETURNING option_id`,
        [questionId, `${title} correct ${index + 1}`],
      )
    ).rows[0].option_id;
    const wrong = (
      await pool.query(
        `INSERT INTO question_options(question_id,option_text,is_correct)
         VALUES($1,$2,false) RETURNING option_id`,
        [questionId, `${title} wrong ${index + 1}`],
      )
    ).rows[0].option_id;
    fixture.options.set(questionId, { correct, wrong });
  }
  return quizId;
}

async function login(person) {
  const agent = request.agent(app);
  const response = await agent.post('/api/v1/auth/login').send({
    email: people[person],
    password,
  });
  expect(response.status).toBe(200);
  return agent;
}

const start = (agent, quizId, body = { quizId }) =>
  agent.post('/api/v1/games/pixel-racer/plays').send(body);
const getPlay = (agent, playId, body) => {
  const call = agent.get(`/api/v1/games/pixel-racer/plays/${playId}`);
  return body === undefined ? call : call.send(body);
};
const answer = (agent, playId, optionId, body = { optionId }) =>
  agent.post(`/api/v1/games/pixel-racer/plays/${playId}/answer`).send(body);

const expectNoCorrectness = (response) => {
  const serialized = JSON.stringify(response.body);
  expect(serialized).not.toMatch(
    /isCorrect|is_correct|correctOption|explanation/,
  );
  for (const option of response.body.data.question?.options ?? [])
    expect(Object.keys(option).sort()).toEqual(['optionId', 'optionText']);
};

async function answerCurrent(agent, response, correct) {
  const questionId = response.body.data.question.questionId;
  return answer(
    agent,
    response.body.data.play.playId,
    fixture.options.get(questionId)[correct ? 'correct' : 'wrong'],
  );
}

beforeAll(async () => {
  await pool.query(
    "UPDATE game_types SET is_enabled=true WHERE key='pixel_racer'",
  );
  fixture.lecturer = await addUser('lecturer', 'lecturer');
  fixture.otherLecturer = await addUser('otherLecturer', 'lecturer');
  fixture.racer = await addUser('racer', 'student');
  fixture.locked = await addUser('locked', 'student');
  fixture.outsider = await addUser('outsider', 'student');
  fixture.otherStudent = await addUser('otherStudent', 'student');
  fixture.module = (
    await pool.query(
      `INSERT INTO modules(lecturer_id,module_code,module_name,join_code)
       VALUES($1,$2,'Pixel Module',$3) RETURNING module_id`,
      [fixture.lecturer, `PIX${prefix}`, `PIXJOIN${prefix}`],
    )
  ).rows[0].module_id;
  fixture.otherModule = (
    await pool.query(
      `INSERT INTO modules(lecturer_id,module_code,module_name,join_code)
       VALUES($1,$2,'Other Pixel Module',$3) RETURNING module_id`,
      [fixture.otherLecturer, `OPIX${prefix}`, `OPIXJOIN${prefix}`],
    )
  ).rows[0].module_id;
  for (const person of ['racer', 'locked', 'otherStudent'])
    await pool.query(
      'INSERT INTO enrollments(student_id,module_id) VALUES($1,$2)',
      [fixture[person], fixture.module],
    );
  fixture.practiceQuiz = await addQuiz(
    fixture.module,
    fixture.lecturer,
    'Pixel Practice',
  );
  fixture.competitiveQuiz = await addQuiz(
    fixture.module,
    fixture.lecturer,
    'Pixel Competitive',
    10,
    true,
  );
  fixture.shortQuiz = await addQuiz(
    fixture.module,
    fixture.lecturer,
    'Pixel Short',
    9,
  );
  fixture.otherQuiz = await addQuiz(
    fixture.otherModule,
    fixture.otherLecturer,
    'Other Pixel',
  );
});

describe.sequential('Pixel Car Racer persistence and API', () => {
  it('runs the worked seven-answer nitro race and returns a server-owned result', async () => {
    const agent = await login('racer');
    let response = await start(agent, fixture.practiceQuiz);
    expect(response.status).toBe(201);
    expectNoCorrectness(response);
    for (let index = 0; index < 7; index += 1) {
      response = await answerCurrent(agent, response, true);
      expect(response.status).toBe(200);
      expect(response.body.data.isCorrect).toBe(true);
    }
    expect(response.body.data.play).toMatchObject({
      status: 'finished',
      slotsUsed: 10,
      answersUsed: 7,
      points: 100,
      nitroActive: true,
    });
    expect(['player', 'bot', 'shared']).toContain(
      response.body.data.outcome.winner,
    );
    expect(response.body.data.play.bot.name).toBe('Bot');
  });

  it('resumes the same active play and refreshes without answer leakage', async () => {
    const agent = await login('otherStudent');
    const first = await start(agent, fixture.practiceQuiz);
    const resumed = await start(agent, fixture.practiceQuiz);
    expect(resumed.status).toBe(200);
    expect(resumed.body.data.resumed).toBe(true);
    expect(resumed.body.data.play.playId).toBe(first.body.data.play.playId);
    const refreshed = await getPlay(agent, first.body.data.play.playId);
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.data.question.questionId).toBe(
      first.body.data.question.questionId,
    );
    expectNoCorrectness(refreshed);
  });

  it('replays a duplicate answer without applying movement twice', async () => {
    const agent = await login('otherStudent');
    const active = await start(agent, fixture.practiceQuiz);
    const optionId = fixture.options.get(
      active.body.data.question.questionId,
    ).correct;
    const first = await answer(agent, active.body.data.play.playId, optionId);
    const replay = await answer(agent, active.body.data.play.playId, optionId);
    expect(replay.status).toBe(200);
    expect(replay.body.data.replayed).toBe(true);
    expect(replay.body.data.play).toEqual(first.body.data.play);
  });

  it('rejects foreign options and authoritative client fields', async () => {
    const agent = await login('otherStudent');
    const active = await start(agent, fixture.practiceQuiz);
    const otherQuestion = [...fixture.options.keys()].at(-1);
    expect(otherQuestion).not.toBe(active.body.data.question.questionId);
    expect(
      (
        await answer(
          agent,
          active.body.data.play.playId,
          fixture.options.get(otherQuestion).correct,
        )
      ).status,
    ).toBe(409);
    for (const body of [
      { quizId: fixture.practiceQuiz, points: 999 },
      { quizId: fixture.practiceQuiz, speed: 5 },
      { quizId: fixture.practiceQuiz, status: 'finished' },
      { quizId: fixture.practiceQuiz, isCorrect: true },
    ])
      expect((await start(agent, fixture.practiceQuiz, body)).status).toBe(422);
  });

  it('blocks a competitive quiz before a scored attempt and allows it after', async () => {
    const agent = await login('locked');
    expect((await start(agent, fixture.competitiveQuiz)).status).toBe(403);
    await pool.query(
      `INSERT INTO quiz_attempts(
         quiz_id,student_id,score,start_time,completion_time,is_scored
       ) VALUES($1,$2,1,now(),now(),true)`,
      [fixture.competitiveQuiz, fixture.locked],
    );
    expect((await start(agent, fixture.competitiveQuiz)).status).toBe(201);
  });

  it('refuses too few questions and a student outside the module', async () => {
    const racer = await login('racer');
    const short = await start(racer, fixture.shortQuiz);
    expect(short.status).toBe(409);
    expect(short.body.error.message).toContain('at least 10');
    expect(
      (await start(await login('outsider'), fixture.practiceQuiz)).status,
    ).toBe(403);
  });

  it("allows a lecturer's quiz and rejects another lecturer's quiz", async () => {
    const lecturer = await login('lecturer');
    expect((await start(lecturer, fixture.practiceQuiz)).status).toBe(201);
    expect((await start(lecturer, fixture.otherQuiz)).status).toBe(403);
  });

  it("refuses another user's play", async () => {
    const owner = await login('racer');
    const finished = await start(owner, fixture.practiceQuiz);
    const other = await login('otherStudent');
    expect((await getPlay(other, finished.body.data.play.playId)).status).toBe(
      404,
    );
  });

  it('never changes scored attempts, leaderboard data, or analytics inputs', async () => {
    const before = (
      await pool.query(
        `SELECT
          (SELECT count(*) FROM quiz_attempts WHERE quiz_id=$1)::int AS attempts,
          (SELECT count(*) FROM student_answers sa JOIN quiz_attempts qa
             ON qa.attempt_id=sa.attempt_id WHERE qa.quiz_id=$1)::int AS answers`,
        [fixture.practiceQuiz],
      )
    ).rows[0];
    const agent = await login('otherStudent');
    let response = await start(agent, fixture.practiceQuiz);
    while (response.body.data.play.status === 'in_progress')
      response = await answerCurrent(agent, response, true);
    const after = (
      await pool.query(
        `SELECT
          (SELECT count(*) FROM quiz_attempts WHERE quiz_id=$1)::int AS attempts,
          (SELECT count(*) FROM student_answers sa JOIN quiz_attempts qa
             ON qa.attempt_id=sa.attempt_id WHERE qa.quiz_id=$1)::int AS answers`,
        [fixture.practiceQuiz],
      )
    ).rows[0];
    expect(after).toEqual(before);
  });
});
