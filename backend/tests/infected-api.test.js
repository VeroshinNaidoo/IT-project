// @ts-nocheck - integration suite drives the real API and database.
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

const password = 'InfectedDemo123!';
const prefix = crypto.randomUUID().slice(0, 8);
const actors = {
  lecturer: `${prefix}-lecturer@example.com`,
  otherLecturer: `${prefix}-other-lecturer@example.com`,
  student: `${prefix}-student@example.com`,
  secondStudent: `${prefix}-second@example.com`,
  outsider: `${prefix}-outsider@example.com`,
};
const fixture = { options: new Map() };

async function addUser(email, role, fullName) {
  const hash = await bcrypt.hash(password, 4);
  return (
    await pool.query(
      `INSERT INTO users(email,password_hash,role,full_name)
       VALUES($1,$2,$3,$4) RETURNING user_id`,
      [email, hash, role, fullName],
    )
  ).rows[0].user_id;
}

async function addQuiz({
  moduleId,
  lecturerId,
  title,
  count = 12,
  competitive = false,
  difficultyLevels = [1, 3, 5],
}) {
  const quiz = (
    await pool.query(
      `INSERT INTO quizzes(module_id,created_by,title,is_competitive,status)
       VALUES($1,$2,$3,$4,'published') RETURNING quiz_id`,
      [moduleId, lecturerId, title, competitive],
    )
  ).rows[0];
  const topicIds = {};
  for (const topic of ['Foundations', 'Design', 'Queries'])
    topicIds[topic] = (
      await pool.query(
        `INSERT INTO topics(module_id,name) VALUES($1,$2)
         ON CONFLICT(module_id,name) DO UPDATE SET name=EXCLUDED.name RETURNING topic_id`,
        [moduleId, topic],
      )
    ).rows[0].topic_id;
  for (let index = 0; index < count; index += 1) {
    const difficultyLevel = difficultyLevels[index % difficultyLevels.length];
    const topic = ['Foundations', 'Design', 'Queries'][index % 3];
    const question = (
      await pool.query(
        `INSERT INTO questions(quiz_id,topic_id,question_text,marks,difficulty_level,explanation)
         VALUES($1,$2,$3,1,$4,$5) RETURNING question_id`,
        [
          quiz.quiz_id,
          topicIds[topic],
          `${title} question ${index + 1}?`,
          difficultyLevel,
          `Explanation for ${title} question ${index + 1}.`,
        ],
      )
    ).rows[0];
    const correct = (
      await pool.query(
        `INSERT INTO question_options(question_id,option_text,is_correct)
         VALUES($1,$2,true) RETURNING option_id`,
        [question.question_id, `${title} correct ${index + 1}`],
      )
    ).rows[0].option_id;
    const wrong = (
      await pool.query(
        `INSERT INTO question_options(question_id,option_text,is_correct)
         VALUES($1,$2,false) RETURNING option_id`,
        [question.question_id, `${title} wrong ${index + 1}`],
      )
    ).rows[0].option_id;
    fixture.options.set(question.question_id, { correct, wrong });
  }
  return quiz.quiz_id;
}

async function login(actor) {
  const agent = request.agent(app);
  const response = await agent.post('/api/v1/auth/login').send({
    email: actors[actor],
    password,
  });
  expect(response.status).toBe(200);
  return agent;
}

async function start(agent, quizId, expected = 201) {
  const response = await agent
    .post('/api/v1/games/infected/sessions')
    .send({ quizId });
  expect(response.status).toBe(expected);
  return response.body;
}

async function chooseAndAnswer(agent, state, correct, difficulty) {
  const card =
    state.cards.find((candidate) => candidate.difficulty === difficulty) ||
    state.cards[0];
  const chosen = await agent
    .post(`/api/v1/games/infected/sessions/${state.session.sessionId}/choose`)
    .send({ cardId: card.cardId });
  expect(chosen.status).toBe(200);
  expect(JSON.stringify(chosen.body)).not.toMatch(
    /isCorrect|is_correct|correctOption/,
  );
  const option = fixture.options.get(card.cardId)[
    correct ? 'correct' : 'wrong'
  ];
  const answered = await agent
    .post(`/api/v1/games/infected/sessions/${state.session.sessionId}/answer`)
    .send({ optionId: option });
  expect(answered.status).toBe(200);
  return { card, chosen: chosen.body, answered: answered.body, option };
}

beforeAll(async () => {
  fixture.lecturer = await addUser(
    actors.lecturer,
    'lecturer',
    'Infected Lecturer',
  );
  fixture.otherLecturer = await addUser(
    actors.otherLecturer,
    'lecturer',
    'Other Lecturer',
  );
  fixture.student = await addUser(
    actors.student,
    'student',
    'Infected Student',
  );
  fixture.secondStudent = await addUser(
    actors.secondStudent,
    'student',
    'Second Student',
  );
  fixture.outsider = await addUser(
    actors.outsider,
    'student',
    'Outside Student',
  );
  fixture.module = (
    await pool.query(
      `INSERT INTO modules(lecturer_id,module_code,module_name,join_code)
       VALUES($1,$2,'Infected Module',$3) RETURNING module_id`,
      [fixture.lecturer, `INF${prefix}`, `INFECTEDJOIN${prefix}`],
    )
  ).rows[0].module_id;
  fixture.otherModule = (
    await pool.query(
      `INSERT INTO modules(lecturer_id,module_code,module_name,join_code)
       VALUES($1,$2,'Other Module',$3) RETURNING module_id`,
      [fixture.otherLecturer, `OTH${prefix}`, `OTHERGAMEJOIN${prefix}`],
    )
  ).rows[0].module_id;
  for (const student of [fixture.student, fixture.secondStudent])
    await pool.query(
      'INSERT INTO enrollments(student_id,module_id) VALUES($1,$2)',
      [student, fixture.module],
    );
  fixture.practiceQuiz = await addQuiz({
    moduleId: fixture.module,
    lecturerId: fixture.lecturer,
    title: 'Infected Practice',
  });
  fixture.competitiveQuiz = await addQuiz({
    moduleId: fixture.module,
    lecturerId: fixture.lecturer,
    title: 'Infected Competitive',
    competitive: true,
  });
  fixture.exhaustionQuiz = await addQuiz({
    moduleId: fixture.module,
    lecturerId: fixture.lecturer,
    title: 'Infected Exhaustion',
    count: 6,
    difficultyLevels: [1],
  });
  fixture.shortQuiz = await addQuiz({
    moduleId: fixture.module,
    lecturerId: fixture.lecturer,
    title: 'Infected Short',
    count: 5,
  });
  fixture.resumeQuiz = await addQuiz({
    moduleId: fixture.module,
    lecturerId: fixture.lecturer,
    title: 'Infected Resume',
  });
  fixture.otherQuiz = await addQuiz({
    moduleId: fixture.otherModule,
    lecturerId: fixture.otherLecturer,
    title: 'Infected Other',
  });
});

describe.sequential('Infected solo API', () => {
  it('requires authentication and rejects authoritative or unknown fields', async () => {
    expect(
      (
        await request(app)
          .post('/api/v1/games/infected/sessions')
          .send({ quizId: fixture.practiceQuiz })
      ).status,
    ).toBe(401);
    const agent = await login('student');
    for (const body of [
      { quizId: fixture.practiceQuiz, cure: 100 },
      { quizId: fixture.practiceQuiz, score: 999 },
      { quizId: fixture.practiceQuiz, status: 'won' },
      { quizId: fixture.practiceQuiz, difficulty: 'hard' },
      { quizId: fixture.practiceQuiz, isCorrect: true },
    ])
      expect(
        (await agent.post('/api/v1/games/infected/sessions').send(body)).status,
      ).toBe(422);
  });

  it('shows the enabled game and a reason when a quiz has too few questions', async () => {
    const agent = await login('student');
    const available = await agent.get(
      `/api/v1/quizzes/${fixture.practiceQuiz}/games`,
    );
    expect(available.status).toBe(200);
    expect(available.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'infected', available: true }),
      ]),
    );
    const short = await agent.get(`/api/v1/quizzes/${fixture.shortQuiz}/games`);
    expect(short.body.data[0]).toMatchObject({
      key: 'infected',
      available: false,
    });
    expect(short.body.data[0].reason).toContain('Not enough questions');
    const startShort = await agent
      .post('/api/v1/games/infected/sessions')
      .send({ quizId: fixture.shortQuiz });
    expect(startShort.status).toBe(409);
  });

  it('blocks competitive play before the scored attempt and allows it after', async () => {
    const agent = await login('student');
    const locked = await agent
      .post('/api/v1/games/infected/sessions')
      .send({ quizId: fixture.competitiveQuiz });
    expect(locked.status).toBe(403);
    expect(locked.body.error.code).toBe('GAME_LOCKED');
    await pool.query(
      `INSERT INTO quiz_attempts(quiz_id,student_id,score,completion_time,is_scored)
       VALUES($1,$2,1,now(),true)`,
      [fixture.competitiveQuiz, fixture.student],
    );
    const unlocked = await start(agent, fixture.competitiveQuiz);
    expect(unlocked.cards).toHaveLength(3);
  });

  it('rejects a student who is not enrolled', async () => {
    const outsider = await login('outsider');
    const response = await outsider
      .post('/api/v1/games/infected/sessions')
      .send({ quizId: fixture.practiceQuiz });
    expect(response.status).toBe(403);
  });

  it('allows the owner lecturer but rejects another lecturer', async () => {
    const owner = await login('lecturer');
    expect(
      (
        await owner
          .post('/api/v1/games/infected/sessions')
          .send({ quizId: fixture.practiceQuiz })
      ).status,
    ).toBe(201);
    const other = await login('otherLecturer');
    expect(
      (
        await other
          .post('/api/v1/games/infected/sessions')
          .send({ quizId: fixture.practiceQuiz })
      ).status,
    ).toBe(403);
  });

  it('runs to a win and never exposes correctness before answering', async () => {
    const agent = await login('student');
    let state = await start(agent, fixture.practiceQuiz);
    expect(state.session).toMatchObject({ cure: 0, hearts: 3, score: 0 });
    expect(JSON.stringify(state)).not.toMatch(
      /questionText|optionText|isCorrect|is_correct|correctOption/,
    );
    for (let turn = 0; turn < 4; turn += 1) {
      const result = await chooseAndAnswer(agent, state, true, 'hard');
      state = result.answered;
    }
    expect(state.session).toMatchObject({
      cure: 100,
      hearts: 3,
      score: 120,
      status: 'won',
    });
    expect(state.correctOption.optionText).toContain('correct');
    expect(state.explanation).toContain('Explanation');
  });

  it('rejects new moves on a terminal session but safely replays the final answer', async () => {
    const agent = await login('student');
    const latest = (
      await pool.query(
        `SELECT s.session_id,t.chosen_option_id FROM game_sessions s
         JOIN games g ON g.game_id=s.game_id
         JOIN game_turns t ON t.session_id=s.session_id
         WHERE g.quiz_id=$1 AND s.student_id=$2 AND s.status='won'
         ORDER BY t.turn_number DESC LIMIT 1`,
        [fixture.practiceQuiz, fixture.student],
      )
    ).rows[0];
    const replay = await agent
      .post(`/api/v1/games/infected/sessions/${latest.session_id}/answer`)
      .send({ optionId: latest.chosen_option_id });
    expect(replay.status).toBe(200);
    expect(replay.body.replayed).toBe(true);
    const choose = await agent
      .post(`/api/v1/games/infected/sessions/${latest.session_id}/choose`)
      .send({ cardId: crypto.randomUUID() });
    expect(choose.status).toBe(409);
  });

  it('runs to a loss and every wrong answer costs exactly one heart', async () => {
    const agent = await login('secondStudent');
    let state = await start(agent, fixture.practiceQuiz);
    for (const expectedHearts of [2, 1, 0]) {
      const result = await chooseAndAnswer(agent, state, false, 'easy');
      state = result.answered;
      expect(state.session.hearts).toBe(expectedHearts);
    }
    expect(state.session.status).toBe('lost');
    expect(state.session.score).toBe(0);
  });

  it('ends exhausted when no unused cards remain', async () => {
    const agent = await login('student');
    let state = await start(agent, fixture.exhaustionQuiz);
    state = (await chooseAndAnswer(agent, state, true, 'easy')).answered;
    expect(state.session.status).toBe('in_progress');
    state = (await chooseAndAnswer(agent, state, true, 'easy')).answered;
    expect(state.session).toMatchObject({
      cure: 20,
      score: 20,
      status: 'exhausted',
    });
    expect(state.cards).toEqual([]);
  });

  it('resumes after refresh and makes choose idempotent only for the same card', async () => {
    const agent = await login('student');
    const state = await start(agent, fixture.resumeQuiz);
    const card = state.cards[0];
    const chosen = await agent
      .post(`/api/v1/games/infected/sessions/${state.session.sessionId}/choose`)
      .send({ cardId: card.cardId });
    expect(chosen.status).toBe(200);
    const repeated = await agent
      .post(`/api/v1/games/infected/sessions/${state.session.sessionId}/choose`)
      .send({ cardId: card.cardId });
    expect(repeated.status).toBe(200);
    const different = await agent
      .post(`/api/v1/games/infected/sessions/${state.session.sessionId}/choose`)
      .send({ cardId: state.cards[1].cardId });
    expect(different.status).toBe(409);
    const refreshed = await agent.get(
      `/api/v1/games/infected/sessions/${state.session.sessionId}`,
    );
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.question.questionId).toBe(card.cardId);
    expect(JSON.stringify(refreshed.body)).not.toMatch(
      /isCorrect|is_correct|correctOption/,
    );
    const resumed = await start(agent, fixture.resumeQuiz, 200);
    expect(resumed.resumed).toBe(true);
    expect(resumed.session.sessionId).toBe(state.session.sessionId);
  });

  it('rejects answering before choosing and an option from another question', async () => {
    const agent = await login('student');
    const state = await start(agent, fixture.competitiveQuiz, 200);
    const premature = await agent
      .post(`/api/v1/games/infected/sessions/${state.session.sessionId}/answer`)
      .send({ optionId: fixture.options.get(state.cards[0].cardId).correct });
    expect(premature.status).toBe(409);
    const card = state.cards[0];
    await agent
      .post(`/api/v1/games/infected/sessions/${state.session.sessionId}/choose`)
      .send({ cardId: card.cardId });
    const foreignQuestion = [...fixture.options.keys()].find(
      (questionId) =>
        questionId !== card.cardId &&
        !state.cards.some((c) => c.cardId === questionId),
    );
    const invalid = await agent
      .post(`/api/v1/games/infected/sessions/${state.session.sessionId}/answer`)
      .send({ optionId: fixture.options.get(foreignQuestion).correct });
    expect(invalid.status).toBe(409);
  });

  it('rejects a card from another quiz session and hides another student session', async () => {
    const first = await login('student');
    const second = await login('secondStudent');
    const firstState = await start(first, fixture.competitiveQuiz, 200);
    const otherOwner = await login('otherLecturer');
    const otherState = await start(otherOwner, fixture.otherQuiz);
    const invalidCard = await first
      .post(
        `/api/v1/games/infected/sessions/${firstState.session.sessionId}/choose`,
      )
      .send({ cardId: otherState.cards[0].cardId });
    expect(invalidCard.status).toBe(409);
    const hidden = await second.get(
      `/api/v1/games/infected/sessions/${firstState.session.sessionId}`,
    );
    expect(hidden.status).toBe(404);
  });

  it('returns a double answer without applying reward twice', async () => {
    const agent = await login('student');
    let state = await start(agent, fixture.resumeQuiz, 200);
    if (!state.question) {
      const card = state.cards[0];
      await agent
        .post(
          `/api/v1/games/infected/sessions/${state.session.sessionId}/choose`,
        )
        .send({ cardId: card.cardId });
      state.question = { questionId: card.cardId };
    }
    const option = fixture.options.get(state.question.questionId).correct;
    const first = await agent
      .post(`/api/v1/games/infected/sessions/${state.session.sessionId}/answer`)
      .send({ optionId: option });
    const second = await agent
      .post(`/api/v1/games/infected/sessions/${state.session.sessionId}/answer`)
      .send({ optionId: option });
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body.replayed).toBe(true);
    expect(second.body.session.score).toBe(first.body.session.score);
    expect(second.body.session.cure).toBe(first.body.session.cure);
  });

  it('does not alter scored attempts, leaderboard data, or analytics', async () => {
    const before = await pool.query(
      `SELECT count(*)::int AS attempts,coalesce(sum(score),0) AS score
       FROM quiz_attempts WHERE quiz_id=$1`,
      [fixture.competitiveQuiz],
    );
    const agent = await login('student');
    const state = await start(agent, fixture.competitiveQuiz, 200);
    if (state.cards.length)
      await chooseAndAnswer(agent, state, true, state.cards[0].difficulty);
    const after = await pool.query(
      `SELECT count(*)::int AS attempts,coalesce(sum(score),0) AS score
       FROM quiz_attempts WHERE quiz_id=$1`,
      [fixture.competitiveQuiz],
    );
    expect(after.rows).toEqual(before.rows);
    const leaderboard = await agent.get(
      `/api/v1/modules/${fixture.module}/leaderboard`,
    );
    expect(leaderboard.status).toBe(200);
    expect(JSON.stringify(leaderboard.body)).not.toContain('game_session');
  });

  it('lets only the owning lecturer read aggregate activity, never live questions', async () => {
    const owner = await login('lecturer');
    const result = await owner.get(
      `/api/v1/modules/${fixture.module}/games/infected/activity`,
    );
    expect(result.status).toBe(200);
    expect(result.body.data.length).toBeGreaterThan(0);
    expect(JSON.stringify(result.body)).not.toMatch(/question|option/);
    const student = await login('student');
    expect(
      (
        await student.get(
          `/api/v1/modules/${fixture.module}/games/infected/activity`,
        )
      ).status,
    ).toBe(403);
    const other = await login('otherLecturer');
    expect(
      (
        await other.get(
          `/api/v1/modules/${fixture.module}/games/infected/activity`,
        )
      ).status,
    ).toBe(403);
  });
});
