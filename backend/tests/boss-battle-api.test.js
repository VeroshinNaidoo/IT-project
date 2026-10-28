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
const password = 'BossBattle123!';
const people = {
  lecturer: `${prefix}-boss-lecturer@example.com`,
  otherLecturer: `${prefix}-boss-other-lecturer@example.com`,
  winner: `${prefix}-boss-winner@example.com`,
  loser: `${prefix}-boss-loser@example.com`,
  exhausted: `${prefix}-boss-exhausted@example.com`,
  resume: `${prefix}-boss-resume@example.com`,
  duplicate: `${prefix}-boss-duplicate@example.com`,
  invalid: `${prefix}-boss-invalid@example.com`,
  noPending: `${prefix}-boss-no-pending@example.com`,
  locked: `${prefix}-boss-locked@example.com`,
  secrecy: `${prefix}-boss-secrecy@example.com`,
  isolation: `${prefix}-boss-isolation@example.com`,
  outsider: `${prefix}-boss-outsider@example.com`,
};
const fixture = { options: new Map(), questionIds: new Map() };

async function addUser(person, role) {
  return (
    await pool.query(
      `INSERT INTO users(email,password_hash,role,full_name)
       VALUES($1,$2,$3,$4) RETURNING user_id`,
      [people[person], await bcrypt.hash(password, 4), role, `Boss ${person}`],
    )
  ).rows[0].user_id;
}

async function addQuiz(
  moduleId,
  lecturerId,
  title,
  count = 12,
  levels = [1, 2, 3, 4, 5],
  competitive = false,
) {
  const quizId = (
    await pool.query(
      `INSERT INTO quizzes(module_id,created_by,title,is_competitive,status)
       VALUES($1,$2,$3,$4,'published') RETURNING quiz_id`,
      [moduleId, lecturerId, title, competitive],
    )
  ).rows[0].quiz_id;
  const questionIds = [];
  for (let index = 0; index < count; index += 1) {
    const questionId = (
      await pool.query(
        `INSERT INTO questions(
           quiz_id,question_text,marks,difficulty_level,explanation
         ) VALUES($1,$2,1,$3,$4) RETURNING question_id`,
        [
          quizId,
          `${title} question ${index + 1}?`,
          levels[index % levels.length],
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
    questionIds.push(questionId);
  }
  fixture.questionIds.set(quizId, questionIds);
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
  agent.post('/api/v1/games/boss-battle/plays').send(body);

const getPlay = (agent, playId, body) => {
  const call = agent.get(`/api/v1/games/boss-battle/plays/${playId}`);
  return body === undefined ? call : call.send(body);
};

const submit = (agent, playId, optionId, body = { optionId }) =>
  agent.post(`/api/v1/games/boss-battle/plays/${playId}/answer`).send(body);

async function answerCurrent(agent, body, correct) {
  const optionId = fixture.options.get(body.data.question.questionId)[
    correct ? 'correct' : 'wrong'
  ];
  const response = await submit(agent, body.data.play.playId, optionId);
  expect(response.status).toBe(200);
  return { response, optionId };
}

const expectNoCorrectness = (response) => {
  const serialized = JSON.stringify(response.body);
  expect(serialized).not.toMatch(
    /isCorrect|is_correct|correctOption|explanation/,
  );
  for (const option of response.body.data.question?.options ?? [])
    expect(Object.keys(option).sort()).toEqual(['optionId', 'optionText']);
};

beforeAll(async () => {
  await pool.query(
    "UPDATE game_types SET is_enabled=true WHERE key='boss_battle'",
  );
  fixture.lecturer = await addUser('lecturer', 'lecturer');
  fixture.otherLecturer = await addUser('otherLecturer', 'lecturer');
  for (const person of Object.keys(people).filter(
    (name) => !['lecturer', 'otherLecturer'].includes(name),
  ))
    fixture[person] = await addUser(person, 'student');

  fixture.module = (
    await pool.query(
      `INSERT INTO modules(lecturer_id,module_code,module_name,join_code)
       VALUES($1,$2,'Boss Module',$3) RETURNING module_id`,
      [fixture.lecturer, `BOSS${prefix}`, `BOSSJOIN${prefix}`],
    )
  ).rows[0].module_id;
  fixture.otherModule = (
    await pool.query(
      `INSERT INTO modules(lecturer_id,module_code,module_name,join_code)
       VALUES($1,$2,'Other Boss Module',$3) RETURNING module_id`,
      [fixture.otherLecturer, `OBOSS${prefix}`, `OBOSSJOIN${prefix}`],
    )
  ).rows[0].module_id;
  for (const person of Object.keys(people).filter(
    (name) => !['lecturer', 'otherLecturer', 'outsider'].includes(name),
  ))
    await pool.query(
      'INSERT INTO enrollments(student_id,module_id) VALUES($1,$2)',
      [fixture[person], fixture.module],
    );

  fixture.winQuiz = await addQuiz(
    fixture.module,
    fixture.lecturer,
    'Boss Win',
    12,
    [5],
  );
  fixture.lossQuiz = await addQuiz(
    fixture.module,
    fixture.lecturer,
    'Boss Loss',
    12,
    [5],
  );
  fixture.exhaustQuiz = await addQuiz(
    fixture.module,
    fixture.lecturer,
    'Boss Exhaust',
    12,
    [1],
  );
  fixture.resumeQuiz = await addQuiz(
    fixture.module,
    fixture.lecturer,
    'Boss Resume',
  );
  fixture.duplicateQuiz = await addQuiz(
    fixture.module,
    fixture.lecturer,
    'Boss Duplicate',
  );
  fixture.invalidQuiz = await addQuiz(
    fixture.module,
    fixture.lecturer,
    'Boss Invalid',
  );
  fixture.noPendingQuiz = await addQuiz(
    fixture.module,
    fixture.lecturer,
    'Boss No Pending',
  );
  fixture.competitiveQuiz = await addQuiz(
    fixture.module,
    fixture.lecturer,
    'Boss Competitive',
    12,
    [1, 2, 3, 4, 5],
    true,
  );
  fixture.shortQuiz = await addQuiz(
    fixture.module,
    fixture.lecturer,
    'Boss Short',
    11,
  );
  fixture.secrecyQuiz = await addQuiz(
    fixture.module,
    fixture.lecturer,
    'Boss Secret',
  );
  fixture.isolationQuiz = await addQuiz(
    fixture.module,
    fixture.lecturer,
    'Boss Isolation',
  );
  fixture.otherQuiz = await addQuiz(
    fixture.otherModule,
    fixture.otherLecturer,
    'Other Boss',
  );
  await pool.query(
    `INSERT INTO games(quiz_id,game_type_id)
     SELECT quiz_id,gt.game_type_id
     FROM quizzes CROSS JOIN game_types gt
     WHERE gt.key='boss_battle'
     ON CONFLICT(quiz_id,game_type_id) DO NOTHING`,
  );
});

describe.sequential('Boss Battle persistence and API', () => {
  it('completes a full win and returns server-owned damage and feedback', async () => {
    const agent = await login('winner');
    let response = await start(agent, fixture.winQuiz);
    expect(response.status).toBe(201);
    expectNoCorrectness(response);
    while (response.body.data.play.status === 'in_progress') {
      const answered = await answerCurrent(agent, response.body, true);
      response = answered.response;
      expect(response.body.data.damageTaken).toBe(0);
      expect(response.body.data.damageDealt).toBeGreaterThan(0);
    }
    expect(response.body.data.play).toMatchObject({
      bossHp: 0,
      playerHp: 100,
      score: 100,
      status: 'won',
    });
    expect(response.body.data.outcome.status).toBe('won');
  });

  it('completes a full loss after wrong hard answers', async () => {
    const agent = await login('loser');
    let response = await start(agent, fixture.lossQuiz);
    while (response.body.data.play.status === 'in_progress') {
      const answered = await answerCurrent(agent, response.body, false);
      response = answered.response;
      expect(response.body.data.damageDealt).toBe(0);
      expect(response.body.data.damageTaken).toBe(20);
    }
    expect(response.body.data.play).toMatchObject({
      bossHp: 100,
      playerHp: 0,
      score: 0,
      status: 'lost',
    });
  });

  it('ends exhausted when all questions are used before either HP reaches zero', async () => {
    const agent = await login('exhausted');
    let response = await start(agent, fixture.exhaustQuiz);
    let answerNumber = 0;
    while (response.body.data.play.status === 'in_progress') {
      const answered = await answerCurrent(
        agent,
        response.body,
        answerNumber % 2 === 0,
      );
      answerNumber += 1;
      response = answered.response;
    }
    expect(response.body.data.play).toMatchObject({
      bossHp: 40,
      playerHp: 40,
      score: 60,
      status: 'exhausted',
      questionsAnswered: 12,
      questionsRemaining: 0,
    });
  });

  it('resumes the same play after refresh and rebuilds state from appended moves', async () => {
    const agent = await login('resume');
    const started = await start(agent, fixture.resumeQuiz);
    const playId = started.body.data.play.playId;
    const initialState = (
      await pool.query('SELECT state FROM game_plays WHERE play_id=$1', [
        playId,
      ])
    ).rows[0].state;
    const answered = await answerCurrent(agent, started.body, true);
    const pendingQuestionId = answered.response.body.data.question.questionId;
    await pool.query('UPDATE game_plays SET state=$1::jsonb WHERE play_id=$2', [
      JSON.stringify(initialState),
      playId,
    ]);
    const refreshed = await getPlay(agent, playId);
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.data.play.score).toBeGreaterThan(0);
    expect(refreshed.body.data.question.questionId).toBe(pendingQuestionId);
    expectNoCorrectness(refreshed);
    const resumed = await start(agent, fixture.resumeQuiz);
    expect(resumed.status).toBe(200);
    expect(resumed.body.data.play.playId).toBe(playId);
    expect(resumed.body.data.resumed).toBe(true);
  });

  it('returns the stored result for a double-submitted answer without double damage', async () => {
    const agent = await login('duplicate');
    const started = await start(agent, fixture.duplicateQuiz);
    const first = await answerCurrent(agent, started.body, true);
    const replay = await submit(
      agent,
      started.body.data.play.playId,
      first.optionId,
    );
    expect(replay.status).toBe(200);
    expect(replay.body.data.replayed).toBe(true);
    expect(replay.body.data.play).toEqual(first.response.body.data.play);
    expect(
      (
        await pool.query(
          'SELECT count(*)::int AS count FROM game_play_moves WHERE play_id=$1',
          [started.body.data.play.playId],
        )
      ).rows[0].count,
    ).toBe(1);
  });

  it('rejects an option belonging to another question', async () => {
    const agent = await login('invalid');
    const started = await start(agent, fixture.invalidQuiz);
    const currentId = started.body.data.question.questionId;
    const otherId = fixture.questionIds
      .get(fixture.invalidQuiz)
      .find((questionId) => questionId !== currentId);
    const response = await submit(
      agent,
      started.body.data.play.playId,
      fixture.options.get(otherId).correct,
    );
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('INVALID_OPTION');
  });

  it('rejects an answer when the play has no pending question', async () => {
    const agent = await login('noPending');
    const started = await start(agent, fixture.noPendingQuiz);
    const playId = started.body.data.play.playId;
    const state = (
      await pool.query('SELECT state FROM game_plays WHERE play_id=$1', [
        playId,
      ])
    ).rows[0].state;
    state.questionIndex = state.questions.length;
    state.answeredQuestionIds = state.questions.map(
      (question) => question.question_id,
    );
    await pool.query('UPDATE game_plays SET state=$1::jsonb WHERE play_id=$2', [
      JSON.stringify(state),
      playId,
    ]);
    const response = await submit(
      agent,
      playId,
      fixture.options.get(state.questions[0].question_id).correct,
    );
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('NO_PENDING_QUESTION');
  });

  it('blocks competitive play before the scored attempt and allows it after completion', async () => {
    const agent = await login('locked');
    const blocked = await start(agent, fixture.competitiveQuiz);
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('GAME_LOCKED');
    await pool.query(
      `INSERT INTO quiz_attempts(
         quiz_id,student_id,score,start_time,completion_time,is_scored
       ) VALUES($1,$2,0,now(),now(),true)`,
      [fixture.competitiveQuiz, fixture.locked],
    );
    const allowed = await start(agent, fixture.competitiveQuiz);
    expect(allowed.status).toBe(201);
    expect(allowed.body.data.play.status).toBe('in_progress');
  });

  it('refuses a quiz with fewer than twelve eligible questions', async () => {
    const response = await start(await login('winner'), fixture.shortQuiz);
    expect(response.status).toBe(409);
    expect(response.body.error).toMatchObject({
      code: 'NOT_ENOUGH_QUESTIONS',
      message: 'Boss Battle needs at least 12 eligible questions.',
    });
  });

  it('reports the twelve-eligible-question requirement in the games catalogue', async () => {
    const response = await (
      await login('winner')
    ).get(`/api/v1/quizzes/${fixture.shortQuiz}/games`);
    expect(response.status).toBe(200);
    expect(
      response.body.data.find((game) => game.key === 'boss_battle'),
    ).toMatchObject({
      available: false,
      reason: 'Boss Battle needs at least 12 eligible questions.',
      eligible_question_count: 11,
    });
  });

  it('refuses a student who is not enrolled in the module', async () => {
    const response = await start(await login('outsider'), fixture.winQuiz);
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
  });

  it("allows a lecturer on their own quiz but refuses another lecturer's quiz", async () => {
    const lecturer = await login('lecturer');
    const own = await start(lecturer, fixture.secrecyQuiz);
    expect(own.status).toBe(201);
    const other = await start(lecturer, fixture.otherQuiz);
    expect(other.status).toBe(403);
    expect(other.body.error.code).toBe('FORBIDDEN');
  });

  it('never exposes correctness before the answer response', async () => {
    const agent = await login('secrecy');
    const started = await start(agent, fixture.secrecyQuiz);
    expect(started.status).toBe(201);
    expectNoCorrectness(started);
    const refreshed = await getPlay(agent, started.body.data.play.playId);
    expect(refreshed.status).toBe(200);
    expectNoCorrectness(refreshed);
  });

  it('refuses another user reading or answering the play', async () => {
    const owner = await login('isolation');
    const started = await start(owner, fixture.isolationQuiz);
    const outsider = await login('winner');
    expect(
      (await getPlay(outsider, started.body.data.play.playId)).status,
    ).toBe(404);
    expect(
      (
        await submit(
          outsider,
          started.body.data.play.playId,
          fixture.options.get(started.body.data.question.questionId).correct,
        )
      ).status,
    ).toBe(404);
  });

  it('never changes leaderboard rows, scored attempts, or analytics figures', async () => {
    const agent = await login('isolation');
    const lecturer = await login('lecturer');
    const before = {
      attempts: await pool.query(
        `SELECT count(*)::int AS count FROM quiz_attempts
         WHERE student_id=$1`,
        [fixture.isolation],
      ),
      leaderboard: await lecturer.get(
        `/api/v1/modules/${fixture.module}/leaderboard`,
      ),
      studentAnalytics: await agent.get('/api/v1/me/analytics'),
      moduleAnalytics: await lecturer.get(
        `/api/v1/modules/${fixture.module}/analytics`,
      ),
    };
    const started = await start(agent, fixture.isolationQuiz);
    await answerCurrent(agent, started.body, true);
    const after = {
      attempts: await pool.query(
        `SELECT count(*)::int AS count FROM quiz_attempts
         WHERE student_id=$1`,
        [fixture.isolation],
      ),
      leaderboard: await lecturer.get(
        `/api/v1/modules/${fixture.module}/leaderboard`,
      ),
      studentAnalytics: await agent.get('/api/v1/me/analytics'),
      moduleAnalytics: await lecturer.get(
        `/api/v1/modules/${fixture.module}/analytics`,
      ),
    };
    expect(after.attempts.rows).toEqual(before.attempts.rows);
    expect(after.leaderboard.body).toEqual(before.leaderboard.body);
    expect(after.studentAnalytics.body).toEqual(before.studentAnalytics.body);
    expect(after.moduleAnalytics.body).toEqual(before.moduleAnalytics.body);
  });
});
