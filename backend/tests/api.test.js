// @ts-nocheck - Supertest agents and dynamic API fixtures are runtime values.
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';

process.env.NODE_ENV = 'development';
process.env.COOKIE_SECURE = 'false';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
const { app } = await import('../src/app.js');
const { pool } = await import('../db.js');

describe('Milestones 2–5 API authorization and profanity boundary', () => {
  let lecturerAgent;
  let studentAgent;
  let studentTwoAgent;
  let studentThreeAgent;
  let moduleRecord;
  let resourceRecord;
  let groupRecord;
  let quizRecord;
  let attemptRecord;
  let questionRecords;

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash('StrongLecturerPassword1!', 12);
    await pool.query(
      `INSERT INTO users(email,password_hash,role,full_name) VALUES ('api-lecturer@example.com',$1,'lecturer','API Lecturer') ON CONFLICT DO NOTHING`,
      [passwordHash],
    );
    lecturerAgent = request.agent(app);
    studentAgent = request.agent(app);
    studentTwoAgent = request.agent(app);
    studentThreeAgent = request.agent(app);
    await lecturerAgent.post('/api/v1/auth/login').send({
      email: 'api-lecturer@example.com',
      password: 'StrongLecturerPassword1!',
    });
    await studentAgent.post('/api/v1/auth/register').send({
      email: 'api-student@example.com',
      password: 'StrongStudentPassword1!',
      fullName: 'API Student',
    });
    await studentTwoAgent.post('/api/v1/auth/register').send({
      email: 'api-student-two@example.com',
      password: 'StrongStudentPassword1!',
      fullName: 'API Student Two',
    });
    await studentThreeAgent.post('/api/v1/auth/register').send({
      email: 'api-student-three@example.com',
      password: 'StrongStudentPassword1!',
      fullName: 'API Student Three',
    });
  });

  it('rejects unauthenticated protected access with 401', async () => {
    expect((await request(app).get('/api/v1/modules')).status).toBe(401);
  });

  it('rejects wrong-role module creation with 403', async () => {
    expect(
      (
        await studentAgent
          .post('/api/v1/modules')
          .send({ moduleCode: 'API101', moduleName: 'API Databases' })
      ).status,
    ).toBe(403);
  });

  it('rejects profanity directly at the backend boundary with generic 422', async () => {
    const result = await request(app).post('/api/v1/auth/register').send({
      email: 'bad-text@example.com',
      password: 'StrongStudentPassword1!',
      fullName: 'fuck',
    });
    expect(result.status).toBe(422);
    expect(JSON.stringify(result.body)).not.toContain('fuck');
  });

  it('creates a lecturer-owned module with a join code', async () => {
    const result = await lecturerAgent
      .post('/api/v1/modules')
      .send({ moduleCode: 'API101', moduleName: 'API Databases' });
    expect(result.status).toBe(201);
    expect(result.body.module.join_code).toHaveLength(16);
    moduleRecord = result.body.module;
  });

  it('enrols a student using the join code and lists the module', async () => {
    expect(
      (
        await studentAgent
          .post('/api/v1/enrollments')
          .send({ joinCode: moduleRecord.join_code })
      ).status,
    ).toBe(201);
    const result = await studentAgent.get('/api/v1/modules');
    expect(result.status).toBe(200);
    expect(
      result.body.data.some(
        (module) => module.module_id === moduleRecord.module_id,
      ),
    ).toBe(true);
  });

  it('creates a competitive quiz for quiz-engine tests', async () => {
    const response = await lecturerAgent.post('/api/v1/quizzes').send({
      moduleId: moduleRecord.module_id,
      title: 'API Competitive Quiz',
      isCompetitive: true,
      questions: [
        {
          questionText: 'Which layer stores data?',
          marks: 1,
          options: [
            { optionText: 'Database', isCorrect: true },
            { optionText: 'Presentation', isCorrect: false },
          ],
        },
        {
          questionText: 'Which command reads rows?',
          marks: 1,
          options: [
            { optionText: 'SELECT', isCorrect: true },
            { optionText: 'DROP', isCorrect: false },
          ],
        },
      ],
    });
    expect(response.status).toBe(201);
    quizRecord = response.body.quiz;
  });

  it('starts an attempt transactionally without exposing correctness', async () => {
    const response = await studentAgent.post(
      `/api/v1/quizzes/${quizRecord.quiz_id}/attempts`,
    );
    expect(response.status).toBe(201);
    expect(JSON.stringify(response.body)).not.toContain('isCorrect');
    attemptRecord = response.body.attempt;
    questionRecords = await pool.query(
      `SELECT q.question_id, q.marks, o.option_id, o.is_correct FROM questions q JOIN question_options o ON o.question_id=q.question_id WHERE q.quiz_id=$1 ORDER BY q.question_id, o.option_id`,
      [quizRecord.quiz_id],
    );
    expect(response.body.questions).toHaveLength(2);
  });

  it('rejects forged score fields and options belonging to another question', async () => {
    const rows = questionRecords.rows;
    const first = rows[0];
    const otherQuestionOption = rows.find(
      (row) => row.question_id !== first.question_id,
    );
    expect(
      (
        await studentAgent
          .post(`/api/v1/attempts/${attemptRecord.attempt_id}/submit`)
          .send({
            score: 999,
            isCorrect: true,
            answers: [],
          })
      ).status,
    ).toBe(400);
    expect(
      (
        await studentAgent
          .post(`/api/v1/attempts/${attemptRecord.attempt_id}/submit`)
          .send({
            answers: [
              {
                questionId: first.question_id,
                optionId: otherQuestionOption.option_id,
              },
            ],
          })
      ).status,
    ).toBe(400);
  });

  it('scores on the server, counts unanswered questions, and makes submit idempotent', async () => {
    const correct = questionRecords.rows.find((row) => row.is_correct);
    const result = await studentAgent
      .post(`/api/v1/attempts/${attemptRecord.attempt_id}/submit`)
      .send({
        answers: [
          { questionId: correct.question_id, optionId: correct.option_id },
        ],
      });
    expect(result.status).toBe(200);
    expect(Number(result.body.result.score)).toBe(1);
    expect(result.body.unansweredCount).toBe(1);
    expect(
      (
        await pool.query(
          'SELECT count(*)::int AS count FROM student_answers WHERE attempt_id=$1',
          [attemptRecord.attempt_id],
        )
      ).rows[0].count,
    ).toBe(1);
    const replay = await studentAgent
      .post(`/api/v1/attempts/${attemptRecord.attempt_id}/submit`)
      .send({ answers: [] });
    expect(replay.status).toBe(200);
    expect(replay.body.alreadySubmitted).toBe(true);
    expect(Number(replay.body.score)).toBe(1);
  });

  it('blocks a second competitive attempt and rejects a late submission', async () => {
    expect(
      (
        await studentAgent.post(
          `/api/v1/quizzes/${quizRecord.quiz_id}/attempts`,
        )
      ).status,
    ).toBe(409);
    const lateQuiz = await lecturerAgent.post('/api/v1/quizzes').send({
      moduleId: moduleRecord.module_id,
      title: 'Late Quiz',
      isCompetitive: false,
      closesAt: new Date(Date.now() + 60_000).toISOString(),
      questions: [
        {
          questionText: 'Late question',
          marks: 1,
          options: [
            { optionText: 'Yes', isCorrect: true },
            { optionText: 'No', isCorrect: false },
          ],
        },
      ],
    });
    const lateAttempt = await studentAgent.post(
      `/api/v1/quizzes/${lateQuiz.body.quiz.quiz_id}/attempts`,
    );
    expect(lateAttempt.status).toBe(201);
    await pool.query(
      "UPDATE quizzes SET closes_at=now()-interval '1 second' WHERE quiz_id=$1",
      [lateQuiz.body.quiz.quiz_id],
    );
    expect(
      (
        await studentAgent
          .post(
            `/api/v1/attempts/${lateAttempt.body.attempt.attempt_id}/submit`,
          )
          .send({ answers: [] })
      ).status,
    ).toBe(409);
  });

  it('returns competition ranking and scoped analytics with role boundaries', async () => {
    if (!groupRecord) {
      const group = await studentAgent
        .post(`/api/v1/modules/${moduleRecord.module_id}/groups`)
        .send({ groupName: 'Analytics Group' });
      expect(group.status).toBe(201);
      groupRecord = group.body.group;
    }
    const leaderboard = await studentAgent.get(
      `/api/v1/modules/${moduleRecord.module_id}/leaderboard`,
    );
    expect(leaderboard.status).toBe(200);
    expect(leaderboard.body.data[0].rank).toBe('1');
    const groupLeaderboard = await studentAgent.get(
      `/api/v1/modules/${moduleRecord.module_id}/leaderboard?groupId=${groupRecord.group_id}`,
    );
    expect(groupLeaderboard.status).toBe(200);
    expect(groupLeaderboard.body.data).toHaveLength(1);
    expect((await studentAgent.get('/api/v1/me/analytics')).status).toBe(200);
    expect(
      (
        await studentAgent.get(
          `/api/v1/modules/${moduleRecord.module_id}/analytics`,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await lecturerAgent.get(
          `/api/v1/modules/${moduleRecord.module_id}/analytics`,
        )
      ).status,
    ).toBe(200);
    const groupAnalytics = await lecturerAgent.get(
      `/api/v1/modules/${moduleRecord.module_id}/groups/${groupRecord.group_id}/analytics`,
    );
    expect(groupAnalytics.status).toBe(200);
    expect(groupAnalytics.body.data.students).toBe(1);
  });

  it('creates and joins a study group as an enrolled student', async () => {
    const created = await studentAgent
      .post(`/api/v1/modules/${moduleRecord.module_id}/groups`)
      .send({ groupName: 'API Study Group' });
    expect(created.status).toBe(201);
    groupRecord = created.body.group;
    expect(
      (
        await studentTwoAgent
          .post('/api/v1/enrollments')
          .send({ joinCode: moduleRecord.join_code })
      ).status,
    ).toBe(201);
    expect(
      (
        await studentTwoAgent.post(
          `/api/v1/groups/${created.body.group.group_id}/join`,
        )
      ).status,
    ).toBe(201);
  });

  it('requires lecturer ownership for resource upload', async () => {
    const response = await studentAgent
      .post(`/api/v1/modules/${moduleRecord.module_id}/resources`)
      .field('title', 'Notes')
      .attach('file', Buffer.from('%PDF-1.4'), 'notes.pdf');
    expect(response.status).toBe(403);
  });

  it('accepts a lecturer resource within the configured size limit', async () => {
    const response = await lecturerAgent
      .post(`/api/v1/modules/${moduleRecord.module_id}/resources`)
      .field('title', 'Revision Notes')
      .attach('file', Buffer.from('%PDF-1.4'), 'notes.pdf');
    expect(response.status).toBe(201);
    resourceRecord = response.body.resource;
  });

  it('rejects a spoofed file whose extension does not match its magic bytes', async () => {
    const response = await lecturerAgent
      .post(`/api/v1/modules/${moduleRecord.module_id}/resources`)
      .field('title', 'Spoofed Notes')
      .attach('file', Buffer.from('not a PDF'), 'spoof.pdf');
    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('FILE_TYPE_NOT_ALLOWED');
  });

  it('enforces group-scoped resource visibility', async () => {
    const groupResource = await lecturerAgent
      .post(`/api/v1/modules/${moduleRecord.module_id}/resources`)
      .field('title', 'Group Notes')
      .field('groupId', groupRecord.group_id)
      .attach('file', Buffer.from('group notes'), 'group.txt');
    expect(groupResource.status).toBe(201);
    await studentThreeAgent
      .post('/api/v1/enrollments')
      .send({ joinCode: moduleRecord.join_code });
    const outsider = await studentThreeAgent.get(
      `/api/v1/modules/${moduleRecord.module_id}/resources`,
    );
    expect(outsider.status).toBe(200);
    expect(
      outsider.body.data.some(
        (item) => item.resource_id === groupResource.body.resource.resource_id,
      ),
    ).toBe(false);
  });

  it('queues an AI job and restricts polling to its requester', async () => {
    const queued = await lecturerAgent.post(
      `/api/v1/resources/${resourceRecord.resource_id}/generation-jobs`,
    );
    expect(queued.status).toBe(202);
    expect(queued.body.job.status).toBe('queued');
    const status = await lecturerAgent.get(
      `/api/v1/ai-generation-jobs/${queued.body.job.job_id}`,
    );
    expect(status.status).toBe(200);
    expect(status.body.job.status).toBe('queued');
    expect(
      (
        await studentAgent.get(
          `/api/v1/ai-generation-jobs/${queued.body.job.job_id}`,
        )
      ).status,
    ).toBe(404);
  });

  it('revokes the server-side session on logout', async () => {
    expect((await lecturerAgent.post('/api/v1/auth/logout')).status).toBe(204);
    expect((await lecturerAgent.get('/api/v1/modules')).status).toBe(401);
    await lecturerAgent.post('/api/v1/auth/login').send({
      email: 'api-lecturer@example.com',
      password: 'StrongLecturerPassword1!',
    });
  });

  it('rejects invalid login without revealing account state', async () => {
    const response = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'api-lecturer@example.com', password: 'wrong-password' });
    expect(response.status).toBe(401);
    expect(response.body.error.message).toBe('Email or password is incorrect.');
  });
});
