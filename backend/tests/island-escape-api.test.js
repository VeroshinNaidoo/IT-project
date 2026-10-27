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
const password = 'IslandEscape123!';
const people = {
  lecturer: `${prefix}-island-lecturer@example.com`,
  otherLecturer: `${prefix}-island-other-lecturer@example.com`,
  winner: `${prefix}-island-winner@example.com`,
  setbacks: `${prefix}-island-setbacks@example.com`,
  resume: `${prefix}-island-resume@example.com`,
  locked: `${prefix}-island-locked@example.com`,
  outsider: `${prefix}-island-outsider@example.com`,
};
const fixture = { options: new Map(), questionIds: new Map() };

async function addUser(email, role, name) {
  const hash = await bcrypt.hash(password, 4);
  return (
    await pool.query(
      `INSERT INTO users(email,password_hash,role,full_name)
       VALUES($1,$2,$3,$4) RETURNING user_id`,
      [email, hash, role, name],
    )
  ).rows[0].user_id;
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
  const questions = [];
  for (let index = 0; index < count; index += 1) {
    const questionId = (
      await pool.query(
        `INSERT INTO questions(quiz_id,question_text,marks,difficulty_level,explanation)
         VALUES($1,$2,1,$3,$4) RETURNING question_id`,
        [
          quizId,
          `${title} island question ${index + 1}?`,
          (index % 5) + 1,
          `Explanation for island question ${index + 1}.`,
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
    questions.push(questionId);
  }
  fixture.questionIds.set(quizId, questions);
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

async function start(agent, quizId, expected = 201) {
  const response = await agent
    .post('/api/v1/games/island-escape/plays')
    .send({ quizId });
  expect(response.status).toBe(expected);
  return response.body;
}

async function answer(agent, body, correct) {
  const option = fixture.options.get(body.question.questionId)[
    correct ? 'correct' : 'wrong'
  ];
  const result = await agent
    .post(`/api/v1/games/island-escape/plays/${body.play.playId}/answer`)
    .send({ optionId: option });
  expect(result.status).toBe(200);
  return { body: result.body, option };
}

beforeAll(async () => {
  fixture.lecturer = await addUser(
    people.lecturer,
    'lecturer',
    'Island Lecturer',
  );
  fixture.otherLecturer = await addUser(
    people.otherLecturer,
    'lecturer',
    'Other Island Lecturer',
  );
  for (const person of ['winner', 'setbacks', 'resume', 'locked', 'outsider'])
    fixture[person] = await addUser(
      people[person],
      'student',
      `Island ${person}`,
    );
  fixture.module = (
    await pool.query(
      `INSERT INTO modules(lecturer_id,module_code,module_name,join_code)
       VALUES($1,$2,'Island Module',$3) RETURNING module_id`,
      [fixture.lecturer, `ISL${prefix}`, `ISLAND${prefix}`],
    )
  ).rows[0].module_id;
  fixture.otherModule = (
    await pool.query(
      `INSERT INTO modules(lecturer_id,module_code,module_name,join_code)
       VALUES($1,$2,'Other Island Module',$3) RETURNING module_id`,
      [fixture.otherLecturer, `OIS${prefix}`, `OTHERIS${prefix}`],
    )
  ).rows[0].module_id;
  for (const person of ['winner', 'setbacks', 'resume', 'locked'])
    await pool.query(
      `INSERT INTO enrollments(student_id,module_id) VALUES($1,$2)`,
      [fixture[person], fixture.module],
    );
  fixture.practice = await addQuiz(
    fixture.module,
    fixture.lecturer,
    'Island Practice',
    40,
  );
  fixture.resumeQuiz = await addQuiz(
    fixture.module,
    fixture.lecturer,
    'Island Resume',
    40,
  );
  fixture.competitive = await addQuiz(
    fixture.module,
    fixture.lecturer,
    'Island Competitive',
    40,
    true,
  );
  fixture.short = await addQuiz(
    fixture.module,
    fixture.lecturer,
    'Island Short',
    29,
  );
  fixture.otherQuiz = await addQuiz(
    fixture.otherModule,
    fixture.otherLecturer,
    'Other Island Quiz',
    40,
  );
});

describe.sequential('Island Escape API', () => {
  it('requires authentication and rejects client-owned state fields', async () => {
    expect(
      (
        await request(app)
          .post('/api/v1/games/island-escape/plays')
          .send({ quizId: fixture.practice })
      ).status,
    ).toBe(401);
    const agent = await login('winner');
    for (const field of [
      ['score', 999],
      ['phase', 3],
      ['streak', 10],
      ['isCorrect', true],
      ['status', 'won'],
    ])
      expect(
        (
          await agent
            .post('/api/v1/games/island-escape/plays')
            .send({ quizId: fixture.practice, [field[0]]: field[1] })
        ).status,
      ).toBe(422);
  });

  it('rejects quizzes below the 30-question minimum with a reason', async () => {
    const agent = await login('winner');
    const catalog = await agent.get(`/api/v1/quizzes/${fixture.short}/games`);
    const island = catalog.body.data.find(
      (game) => game.key === 'island_escape',
    );
    expect(island).toMatchObject({ available: false });
    expect(island.reason).toContain('at least 30 questions');
    const response = await agent
      .post('/api/v1/games/island-escape/plays')
      .send({ quizId: fixture.short });
    expect(response.status).toBe(409);
  });

  it('blocks a student who is not enrolled', async () => {
    expect(
      (await start(await login('outsider'), fixture.practice, 403)).error,
    ).toBeTruthy();
  });

  it('blocks competitive play before the scored attempt and allows it after', async () => {
    const agent = await login('locked');
    await start(agent, fixture.competitive, 403);
    await pool.query(
      `INSERT INTO quiz_attempts(quiz_id,student_id,score,completion_time,is_scored)
       VALUES($1,$2,0,now(),true)`,
      [fixture.competitive, fixture.locked],
    );
    const allowed = await start(agent, fixture.competitive);
    expect(allowed.question).toBeTruthy();
  });

  it('allows a lecturer on their own quiz and blocks another lecturer quiz', async () => {
    const lecturer = await login('lecturer');
    expect((await start(lecturer, fixture.practice)).question).toBeTruthy();
    await start(lecturer, fixture.otherQuiz, 403);
  });

  it('resumes after refresh without exposing correctness', async () => {
    const agent = await login('resume');
    const started = await start(agent, fixture.resumeQuiz);
    expect(JSON.stringify(started)).not.toMatch(
      /isCorrect|is_correct|correctOption/,
    );
    const refreshed = await agent.get(
      `/api/v1/games/island-escape/plays/${started.play.playId}`,
    );
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.question.questionId).toBe(
      started.question.questionId,
    );
    expect(JSON.stringify(refreshed.body)).not.toMatch(
      /isCorrect|is_correct|correctOption/,
    );
    const resumed = await start(agent, fixture.resumeQuiz, 200);
    expect(resumed.resumed).toBe(true);
  });

  it('rejects an option from another question', async () => {
    const agent = await login('resume');
    const current = await start(agent, fixture.resumeQuiz, 200);
    const otherQuestion = fixture.questionIds
      .get(fixture.resumeQuiz)
      .find((id) => id !== current.question.questionId);
    const response = await agent
      .post(`/api/v1/games/island-escape/plays/${current.play.playId}/answer`)
      .send({ optionId: fixture.options.get(otherQuestion).correct });
    expect(response.status).toBe(409);
  });

  it('returns the stored result for a double-submitted answer', async () => {
    const agent = await login('resume');
    let state = await start(agent, fixture.resumeQuiz, 200);
    const first = await answer(agent, state, true);
    const replay = await agent
      .post(`/api/v1/games/island-escape/plays/${state.play.playId}/answer`)
      .send({ optionId: first.option });
    expect(replay.status).toBe(200);
    expect(replay.body.replayed).toBe(true);
    expect(replay.body.play.score).toBe(first.body.play.score);
  });

  it('completes a perfect 30-answer win with 570 points and no score leakage', async () => {
    const agent = await login('winner');
    const attemptsBefore = Number(
      (
        await pool.query(
          'SELECT count(*)::int AS count FROM quiz_attempts WHERE student_id=$1',
          [fixture.winner],
        )
      ).rows[0].count,
    );
    let state = await start(agent, fixture.practice);
    for (let index = 0; index < 30; index += 1)
      state = (await answer(agent, state, true)).body;
    expect(state.play).toMatchObject({ status: 'won', score: 570 });
    expect(state.personalBest).toBe(570);
    expect(state.question).toBeNull();
    const attemptsAfter = Number(
      (
        await pool.query(
          'SELECT count(*)::int AS count FROM quiz_attempts WHERE student_id=$1',
          [fixture.winner],
        )
      ).rows[0].count,
    );
    expect(attemptsAfter).toBe(attemptsBefore);
  });

  it('applies every setback path and loses on the fourth setback', async () => {
    const agent = await login('setbacks');
    let state = await start(agent, fixture.practice);
    for (let index = 0; index < 5; index += 1)
      state = (await answer(agent, state, false)).body;
    expect(state.play).toMatchObject({ phase: 1, event: 'tools_lost' });
    for (let index = 0; index < 10; index += 1)
      state = (await answer(agent, state, true)).body;
    expect(state.play.phase).toBe(2);
    for (let index = 0; index < 5; index += 1)
      state = (await answer(agent, state, false)).body;
    expect(state.play).toMatchObject({ phase: 2, event: 'boat_broken' });
    for (let index = 0; index < 10; index += 1)
      state = (await answer(agent, state, true)).body;
    expect(state.play.phase).toBe(3);
    for (let index = 0; index < 5; index += 1)
      state = (await answer(agent, state, false)).body;
    expect(state.play).toMatchObject({ phase: 2, event: 'sharks' });
    for (let index = 0; index < 5; index += 1)
      state = (await answer(agent, state, false)).body;
    expect(state.play).toMatchObject({
      status: 'lost',
      setbacks: 4,
      event: 'stranded',
    });
  });

  it('hides another user play and rejects moves after terminal status', async () => {
    const owner = await login('winner');
    const replay = await start(owner, fixture.practice);
    const other = await login('resume');
    expect(
      (
        await other.get(
          `/api/v1/games/island-escape/plays/${replay.play.playId}`,
        )
      ).status,
    ).toBe(404);
    const terminal = await pool.query(
      `SELECT play_id,state FROM game_plays WHERE student_id=$1 AND status='won'`,
      [fixture.winner],
    );
    const option = fixture.options.get(
      terminal.rows[0].state.askedQuestionIds[0],
    ).correct;
    const response = await owner
      .post(
        `/api/v1/games/island-escape/plays/${terminal.rows[0].play_id}/answer`,
      )
      .send({ optionId: option });
    expect(response.status).toBe(200);
    expect(response.body.replayed).toBe(true);
    const unasked = fixture.questionIds
      .get(fixture.practice)
      .find(
        (questionId) =>
          !terminal.rows[0].state.askedQuestionIds.includes(questionId),
      );
    const rejected = await owner
      .post(
        `/api/v1/games/island-escape/plays/${terminal.rows[0].play_id}/answer`,
      )
      .send({ optionId: fixture.options.get(unasked).correct });
    expect(rejected.status).toBe(409);
  });
});
