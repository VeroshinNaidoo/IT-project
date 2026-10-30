// @ts-nocheck - integration suite drives runtime Express and PostgreSQL records.
import 'dotenv/config';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { beforeAll, describe, expect, it, vi } from 'vitest';

process.env.NODE_ENV = 'development';
process.env.COOKIE_SECURE = 'false';
process.env.AUTH_RATE_LIMIT = '1000';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
const { app } = await import('../src/app.js');
const { pool } = await import('../db.js');

const prefix = crypto.randomUUID().slice(0, 8);
const password = 'TimerTrivia123!';
const people = {
  lecturer: `${prefix}-timer-lecturer@example.com`,
  otherLecturer: `${prefix}-timer-other-lecturer@example.com`,
  player: `${prefix}-timer-player@example.com`,
  locked: `${prefix}-timer-locked@example.com`,
  outsider: `${prefix}-timer-outsider@example.com`,
  otherStudent: `${prefix}-timer-other-student@example.com`,
  finisher: `${prefix}-timer-finisher@example.com`,
};
const fixture = { options: new Map() };

async function addUser(person, role) {
  return (
    await pool.query(
      `INSERT INTO users(email,password_hash,role,full_name)
       VALUES($1,$2,$3,$4) RETURNING user_id`,
      [people[person], await bcrypt.hash(password, 4), role, `Timer ${person}`],
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
  const topics = [];
  for (const name of [`${title} Alpha`, `${title} Beta`])
    topics.push(
      (
        await pool.query(
          `INSERT INTO topics(module_id,name) VALUES($1,$2)
           ON CONFLICT(module_id,name) DO UPDATE SET name=excluded.name RETURNING topic_id`,
          [moduleId, name],
        )
      ).rows[0].topic_id,
    );
  for (let index = 0; index < count; index += 1) {
    const questionId = (
      await pool.query(
        `INSERT INTO questions(
           quiz_id,topic_id,question_text,marks,difficulty_level,explanation
         ) VALUES($1,$2,$3,1,$4,$5) RETURNING question_id`,
        [
          quizId,
          topics[Math.floor(index / 5) % 2],
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
  agent.post('/api/v1/games/timer-trivia/plays').send(body);
const getPlay = (agent, playId, body) => {
  const call = agent.get(`/api/v1/games/timer-trivia/plays/${playId}`);
  return body === undefined ? call : call.send(body);
};
const choose = (agent, playId, cellId, body = { cellId }) =>
  agent.post(`/api/v1/games/timer-trivia/plays/${playId}/choose`).send(body);
const answer = (agent, playId, optionId, body = { optionId }) =>
  agent.post(`/api/v1/games/timer-trivia/plays/${playId}/answer`).send(body);

const expectNoCorrectness = (response) => {
  expect(JSON.stringify(response.body)).not.toMatch(
    /isCorrect|is_correct|correctOption|explanation/,
  );
};

async function chooseOpen(agent, response, points) {
  const cell = response.body.data.play.board.find(
    (candidate) =>
      !candidate.disabled && (!points || candidate.points === points),
  );
  return choose(agent, response.body.data.play.playId, cell.cellId);
}

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
    "UPDATE game_types SET is_enabled=true WHERE key='timer_trivia'",
  );
  for (const person of Object.keys(people))
    fixture[person] = await addUser(
      person,
      person.toLowerCase().includes('lecturer') ? 'lecturer' : 'student',
    );
  fixture.module = (
    await pool.query(
      `INSERT INTO modules(lecturer_id,module_code,module_name,join_code)
       VALUES($1,$2,'Timer Module',$3) RETURNING module_id`,
      [fixture.lecturer, `TIM${prefix}`, `TIMJOIN${prefix}`],
    )
  ).rows[0].module_id;
  fixture.otherModule = (
    await pool.query(
      `INSERT INTO modules(lecturer_id,module_code,module_name,join_code)
       VALUES($1,$2,'Other Timer Module',$3) RETURNING module_id`,
      [fixture.otherLecturer, `OTIM${prefix}`, `OTIMJOIN${prefix}`],
    )
  ).rows[0].module_id;
  for (const person of ['player', 'locked', 'otherStudent', 'finisher'])
    await pool.query(
      'INSERT INTO enrollments(student_id,module_id) VALUES($1,$2)',
      [fixture[person], fixture.module],
    );
  fixture.practiceQuiz = await addQuiz(
    fixture.module,
    fixture.lecturer,
    'Timer Practice',
  );
  fixture.competitiveQuiz = await addQuiz(
    fixture.module,
    fixture.lecturer,
    'Timer Competitive',
    10,
    true,
  );
  fixture.shortQuiz = await addQuiz(
    fixture.module,
    fixture.lecturer,
    'Timer Short',
    9,
  );
  fixture.otherQuiz = await addQuiz(
    fixture.otherModule,
    fixture.otherLecturer,
    'Other Timer',
  );
});

describe.sequential('Timer Trivia persistence and API', () => {
  it('starts, chooses a 50-point cell, and hides correctness until answer', async () => {
    const agent = await login('player');
    const started = await start(agent, fixture.practiceQuiz);
    expect(started.status).toBe(201);
    expect(started.body.data.question).toBeNull();
    expectNoCorrectness(started);
    const chosen = await chooseOpen(agent, started, 50);
    expect(chosen.status).toBe(200);
    expect(chosen.body.data.question.options.length).toBe(2);
    expectNoCorrectness(chosen);
    const result = await answerCurrent(agent, chosen, true);
    expect(result.status).toBe(200);
    expect(result.body.data).toMatchObject({
      isCorrect: true,
      timedOut: false,
      pointsEarned: 50,
    });
    expect(result.body.data.play.score).toBe(50);
  });

  it('records an answer after expiry as timed out with zero points', async () => {
    const agent = await login('otherStudent');
    const started = await start(agent, fixture.practiceQuiz);
    const chosen = await chooseOpen(agent, started);
    vi.useFakeTimers();
    vi.setSystemTime(
      new Date(Date.parse(chosen.body.data.play.deadlineAt) + 1000),
    );
    const result = await answerCurrent(agent, chosen, true);
    vi.useRealTimers();
    expect(result.status).toBe(200);
    expect(result.body.data).toMatchObject({
      isCorrect: false,
      timedOut: true,
      pointsEarned: 0,
    });
  });

  it('returns the stored result for a double answer and never scores twice', async () => {
    const agent = await login('otherStudent');
    const active = await start(agent, fixture.practiceQuiz);
    const chosen = await chooseOpen(agent, active);
    const optionId = fixture.options.get(
      chosen.body.data.question.questionId,
    ).correct;
    const first = await answer(agent, active.body.data.play.playId, optionId);
    const replay = await answer(agent, active.body.data.play.playId, optionId);
    expect(replay.status).toBe(200);
    expect(replay.body.data.replayed).toBe(true);
    expect(replay.body.data.play.score).toBe(first.body.data.play.score);
  });

  it('rejects cell reuse and an option from another question', async () => {
    const agent = await login('otherStudent');
    let active = await start(agent, fixture.practiceQuiz);
    const firstCell = active.body.data.play.board.find(
      (cell) => !cell.disabled,
    );
    let chosen = await choose(
      agent,
      active.body.data.play.playId,
      firstCell.cellId,
    );
    const foreignQuestionId = [...fixture.options.keys()].find(
      (id) => id !== chosen.body.data.question.questionId,
    );
    expect(
      (
        await answer(
          agent,
          active.body.data.play.playId,
          fixture.options.get(foreignQuestionId).correct,
        )
      ).status,
    ).toBe(409);
    active = await answerCurrent(agent, chosen, false);
    const reused = await choose(
      agent,
      active.body.data.play.playId,
      firstCell.cellId,
    );
    expect(reused.status).toBe(409);
  });

  it('resumes an active server timer unchanged after refresh', async () => {
    const agent = await login('otherStudent');
    const active = await start(agent, fixture.practiceQuiz);
    const chosen = await chooseOpen(agent, active);
    const refreshed = await getPlay(agent, active.body.data.play.playId);
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.data.play.deadlineAt).toBe(
      chosen.body.data.play.deadlineAt,
    );
    expect(refreshed.body.data.question.questionId).toBe(
      chosen.body.data.question.questionId,
    );
    expectNoCorrectness(refreshed);
  });

  it('uses the persisted extended-time preference to double the deadline', async () => {
    await pool.query('UPDATE users SET extended_time=true WHERE user_id=$1', [
      fixture.locked,
    ]);
    const agent = await login('locked');
    const active = await start(agent, fixture.practiceQuiz);
    const chosen = await chooseOpen(agent, active);
    const duration =
      new Date(chosen.body.data.play.deadlineAt).getTime() -
      Date.parse(
        (
          await pool.query('SELECT state FROM game_plays WHERE play_id=$1', [
            active.body.data.play.playId,
          ])
        ).rows[0].state.questionStartedAt,
      );
    expect(duration).toBe(60_000);
    expect(chosen.body.data.play.extendedTime).toBe(true);
  });

  it('refuses too few questions and a student outside the module', async () => {
    expect((await start(await login('player'), fixture.shortQuiz)).status).toBe(
      409,
    );
    expect(
      (await start(await login('outsider'), fixture.practiceQuiz)).status,
    ).toBe(403);
  });

  it('blocks competitive play before a scored attempt and allows it after', async () => {
    const agent = await login('locked');
    expect((await start(agent, fixture.competitiveQuiz)).status).toBe(403);
    await pool.query(
      `INSERT INTO quiz_attempts(quiz_id,student_id,is_scored,completion_time,score)
       VALUES($1,$2,true,now(),0)`,
      [fixture.competitiveQuiz, fixture.locked],
    );
    expect((await start(agent, fixture.competitiveQuiz)).status).toBe(201);
  });

  it('allows an owning lecturer and refuses another lecturer quiz', async () => {
    expect(
      (await start(await login('lecturer'), fixture.practiceQuiz)).status,
    ).toBe(201);
    expect(
      (await start(await login('lecturer'), fixture.otherQuiz)).status,
    ).toBe(403);
  });

  it('refuses another user play and rejects authoritative client fields', async () => {
    const owner = await login('player');
    const active = await start(owner, fixture.practiceQuiz);
    expect(
      (await getPlay(await login('otherStudent'), active.body.data.play.playId))
        .status,
    ).toBe(404);
    expect(
      (
        await start(owner, fixture.practiceQuiz, {
          quizId: fixture.practiceQuiz,
          score: 999,
        })
      ).status,
    ).toBe(422);
  });

  it('finishes ten rounds, stores a personal best, and leaves scored data unchanged', async () => {
    const agent = await login('finisher');
    let response = await start(agent, fixture.practiceQuiz);
    const before = await pool.query(
      'SELECT count(*)::int AS count FROM quiz_attempts',
    );
    for (let round = 0; round < 10; round += 1) {
      const chosen = await chooseOpen(agent, response);
      response = await answerCurrent(agent, chosen, true);
    }
    expect(response.body.data.play.status).toBe('finished');
    const best = await pool.query(
      `SELECT score FROM game_personal_bests b JOIN game_types gt USING(game_type_id)
       WHERE gt.key='timer_trivia' AND student_id=$1 AND quiz_id=$2`,
      [fixture.finisher, fixture.practiceQuiz],
    );
    expect(best.rows[0].score).toBe(response.body.data.play.score);
    expect(
      (await pool.query('SELECT count(*)::int AS count FROM quiz_attempts'))
        .rows[0].count,
    ).toBe(before.rows[0].count);
  });
});
