// @ts-nocheck - integration test uses a runtime-selected database client.
import 'dotenv/config';
import pg from 'pg';
import { beforeEach, afterEach, describe, expect, it } from 'vitest';

const { Client } = pg;
const optOut = process.env.EDUQUEST_SKIP_DB_TESTS === 'true';
const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (optOut) {
  console.warn(
    'WARNING: EDUQUEST_SKIP_DB_TESTS=true; database invariant tests are explicitly opted out and do not count as a pass.',
  );
} else if (!databaseUrl) {
  throw new Error(
    'TEST_DATABASE_URL or DATABASE_URL is required for database invariant tests. Set it in EduQuest .env or explicitly set EDUQUEST_SKIP_DB_TESTS=true to opt out.',
  );
}

if (optOut) process.exitCode = 1;
/** @type {import('pg').Client | undefined} */
let client;
/**
 * @param {string} query
 * @param {unknown[]} values
 * @param {string} invariant
 */
const expectConstraintFailure = async (query, values, invariant) => {
  let error;
  try {
    await client.query(query, values);
  } catch (caught) {
    error = caught;
  }
  expect(error, invariant).toMatchObject({ code: '23514' });
  await client.end();
  client = new Client({ connectionString: databaseUrl });
  await client.connect();
};

describe.skipIf(optOut)('Milestone 1 raw-SQL database invariants', () => {
  beforeEach(async () => {
    if (!optOut) {
      client = new Client({ connectionString: databaseUrl });
      await client.connect();
    }
  });
  afterEach(async () => {
    if (!optOut && client) await client.end();
  });

  it('schema includes sessions, jobs, topics, join codes, and quiz closing times [INV-07]', async () => {
    const tables = await client.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('sessions','ai_generation_jobs','topics')`,
    );
    expect(tables.rows.map((row) => row.table_name).sort()).toEqual([
      'ai_generation_jobs',
      'sessions',
      'topics',
    ]);
    const columns = await client.query(
      `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public' AND ((table_name = 'modules' AND column_name = 'join_code') OR (table_name = 'quizzes' AND column_name IN ('title','closes_at'))) ORDER BY table_name, column_name`,
    );
    expect(columns.rows).toHaveLength(3);
  });

  it('enforces case-insensitive unique emails [INV-14]', async () => {
    const user = await client.query(
      `INSERT INTO users (email, password_hash, role, full_name) VALUES ('case@example.com', 'hash', 'student', 'Case User') RETURNING user_id`,
    );
    await expect(
      client.query(
        `INSERT INTO users (email, password_hash, role, full_name) VALUES ('case@example.com', 'hash', 'student', 'Duplicate')`,
      ),
    ).rejects.toMatchObject({ code: '23505' });
    await client.query('DELETE FROM users WHERE user_id = $1', [
      user.rows[0].user_id,
    ]);
  });

  it('enforces role, enrolment, and resource-scope invariants [INV-06, INV-07, INV-08]', async () => {
    const lecturer = (
      await client.query(
        `INSERT INTO users (email, password_hash, role, full_name) VALUES ('lecturer@example.com', 'hash', 'lecturer', 'Lecturer') RETURNING user_id`,
      )
    ).rows[0].user_id;
    const student = (
      await client.query(
        `INSERT INTO users (email, password_hash, role, full_name) VALUES ('student@example.com', 'hash', 'student', 'Student') RETURNING user_id`,
      )
    ).rows[0].user_id;
    const otherStudent = (
      await client.query(
        `INSERT INTO users (email, password_hash, role, full_name) VALUES ('other@example.com', 'hash', 'student', 'Other') RETURNING user_id`,
      )
    ).rows[0].user_id;
    const moduleId = (
      await client.query(
        `INSERT INTO modules (lecturer_id, module_code, module_name, join_code) VALUES ($1, 'CS101', 'Databases', 'JOINCODE12345') RETURNING module_id`,
        [lecturer],
      )
    ).rows[0].module_id;
    const otherModule = (
      await client.query(
        `INSERT INTO modules (lecturer_id, module_code, module_name, join_code) VALUES ($1, 'CS102', 'Networks', 'JOINCODE12346') RETURNING module_id`,
        [lecturer],
      )
    ).rows[0].module_id;
    await expectConstraintFailure(
      `INSERT INTO modules (lecturer_id, module_code, module_name, join_code) VALUES ($1, 'BAD1', 'Bad', 'JOINCODE12347')`,
      [student],
      'INV-06 lecturer role',
    );
    await expectConstraintFailure(
      `INSERT INTO enrollments (student_id, module_id) VALUES ($1, $2)`,
      [lecturer, moduleId],
      'INV-07 student role',
    );
    await client.query(
      `INSERT INTO enrollments (student_id, module_id) VALUES ($1, $2)`,
      [student, moduleId],
    );
    const groupId = (
      await client.query(
        `INSERT INTO study_groups (module_id, created_by, group_name) VALUES ($1, $2, 'Group A') RETURNING group_id`,
        [moduleId, lecturer],
      )
    ).rows[0].group_id;
    await client.query(
      `INSERT INTO group_members (group_id, student_id) VALUES ($1, $2)`,
      [groupId, student],
    );
    await expectConstraintFailure(
      `INSERT INTO group_members (group_id, student_id) VALUES ($1, $2)`,
      [groupId, otherStudent],
      'INV-07 enrolled membership',
    );
    const resourceId = (
      await client.query(
        `INSERT INTO resources (uploaded_by, module_id, title, resource_type, file_location, file_size_bytes) VALUES ($1, $2, 'Notes', 'txt', 'safe.txt', 10) RETURNING resource_id`,
        [lecturer, moduleId],
      )
    ).rows[0].resource_id;
    await expectConstraintFailure(
      `INSERT INTO resources (uploaded_by, module_id, group_id, title, resource_type, file_location, file_size_bytes) VALUES ($1, $2, $3, 'Bad scope', 'txt', 'bad.txt', 10)`,
      [lecturer, otherModule, groupId],
      'INV-08 resource scope',
    );
    await client.query('DELETE FROM resources WHERE resource_id = $1', [
      resourceId,
    ]);
    await client.query('DELETE FROM group_members WHERE group_id = $1', [
      groupId,
    ]);
    await client.query(
      'DELETE FROM enrollments WHERE student_id = $1 AND module_id = $2',
      [student, moduleId],
    );
    await client.query('DELETE FROM study_groups WHERE group_id = $1', [
      groupId,
    ]);
    await client.query('DELETE FROM modules WHERE module_id IN ($1, $2)', [
      moduleId,
      otherModule,
    ]);
    await client.query('DELETE FROM users WHERE user_id IN ($1, $2, $3)', [
      lecturer,
      student,
      otherStudent,
    ]);
  });

  it('allows only one correct option per question [INV-02]', async () => {
    const lecturer = (
      await client.query(
        `INSERT INTO users (email, password_hash, role, full_name) VALUES ('q-lecturer@example.com', 'hash', 'lecturer', 'Quiz Lecturer') RETURNING user_id`,
      )
    ).rows[0].user_id;
    const moduleId = (
      await client.query(
        `INSERT INTO modules (lecturer_id, module_code, module_name, join_code) VALUES ($1, 'CS201', 'Queries', 'JOINCODE22345') RETURNING module_id`,
        [lecturer],
      )
    ).rows[0].module_id;
    const quizId = (
      await client.query(
        `INSERT INTO quizzes (module_id, created_by, title, is_competitive, status) VALUES ($1, $2, 'Practice', false, 'published') RETURNING quiz_id`,
        [moduleId, lecturer],
      )
    ).rows[0].quiz_id;
    const questionId = (
      await client.query(
        `INSERT INTO questions (quiz_id, question_text, marks) VALUES ($1, 'Question?', 1) RETURNING question_id`,
        [quizId],
      )
    ).rows[0].question_id;
    await client.query(
      `INSERT INTO question_options (question_id, option_text, is_correct) VALUES ($1, 'A', true)`,
      [questionId],
    );
    await expect(
      client.query(
        `INSERT INTO question_options (question_id, option_text, is_correct) VALUES ($1, 'B', true)`,
        [questionId],
      ),
    ).rejects.toMatchObject({ code: '23505' });
  });

  it('allows one scored competitive attempt and rejects a second [INV-01]', async () => {
    const lecturer = (
      await client.query(
        `INSERT INTO users (email, password_hash, role, full_name) VALUES ('a-lecturer@example.com', 'hash', 'lecturer', 'Attempt Lecturer') RETURNING user_id`,
      )
    ).rows[0].user_id;
    const student = (
      await client.query(
        `INSERT INTO users (email, password_hash, role, full_name) VALUES ('a-student@example.com', 'hash', 'student', 'Attempt Student') RETURNING user_id`,
      )
    ).rows[0].user_id;
    const moduleId = (
      await client.query(
        `INSERT INTO modules (lecturer_id, module_code, module_name, join_code) VALUES ($1, 'CS301', 'Scoring', 'JOINCODE32345') RETURNING module_id`,
        [lecturer],
      )
    ).rows[0].module_id;
    const quizId = (
      await client.query(
        `INSERT INTO quizzes (module_id, created_by, title, is_competitive, max_scored_attempts, status) VALUES ($1, $2, 'Competitive', true, 1, 'published') RETURNING quiz_id`,
        [moduleId, lecturer],
      )
    ).rows[0].quiz_id;
    await client.query(
      `INSERT INTO quiz_attempts (quiz_id, student_id, score, completion_time, is_scored) VALUES ($1, $2, 1, now(), true)`,
      [quizId, student],
    );
    await expect(
      client.query(
        `INSERT INTO quiz_attempts (quiz_id, student_id, score, completion_time, is_scored) VALUES ($1, $2, 1, now(), true)`,
        [quizId, student],
      ),
    ).rejects.toMatchObject({ code: '23505' });
  });

  it('rejects answers whose option/question/attempt relationships do not match [INV-03]', async () => {
    const lecturer = (
      await client.query(
        `INSERT INTO users (email, password_hash, role, full_name) VALUES ('answer-lecturer@example.com', 'hash', 'lecturer', 'Answer Lecturer') RETURNING user_id`,
      )
    ).rows[0].user_id;
    const student = (
      await client.query(
        `INSERT INTO users (email, password_hash, role, full_name) VALUES ('answer-student@example.com', 'hash', 'student', 'Answer Student') RETURNING user_id`,
      )
    ).rows[0].user_id;
    const moduleId = (
      await client.query(
        `INSERT INTO modules (lecturer_id, module_code, module_name, join_code) VALUES ($1, 'CS401', 'Answers', 'JOINCODE42345') RETURNING module_id`,
        [lecturer],
      )
    ).rows[0].module_id;
    await client.query(
      `INSERT INTO enrollments (student_id, module_id) VALUES ($1, $2)`,
      [student, moduleId],
    );
    const quizId = (
      await client.query(
        `INSERT INTO quizzes (module_id, created_by, title, status) VALUES ($1, $2, 'Answer Quiz', 'published') RETURNING quiz_id`,
        [moduleId, lecturer],
      )
    ).rows[0].quiz_id;
    const otherQuizId = (
      await client.query(
        `INSERT INTO quizzes (module_id, created_by, title, status) VALUES ($1, $2, 'Other Quiz', 'published') RETURNING quiz_id`,
        [moduleId, lecturer],
      )
    ).rows[0].quiz_id;
    const q1 = (
      await client.query(
        `INSERT INTO questions (quiz_id, question_text, marks) VALUES ($1, 'One?', 1) RETURNING question_id`,
        [quizId],
      )
    ).rows[0].question_id;
    const q2 = (
      await client.query(
        `INSERT INTO questions (quiz_id, question_text, marks) VALUES ($1, 'Two?', 1) RETURNING question_id`,
        [otherQuizId],
      )
    ).rows[0].question_id;
    const option = (
      await client.query(
        `INSERT INTO question_options (question_id, option_text, is_correct) VALUES ($1, 'A', true) RETURNING option_id`,
        [q1],
      )
    ).rows[0].option_id;
    const wrongOption = (
      await client.query(
        `INSERT INTO question_options (question_id, option_text, is_correct) VALUES ($1, 'B', true) RETURNING option_id`,
        [q2],
      )
    ).rows[0].option_id;
    const attempt = (
      await client.query(
        `INSERT INTO quiz_attempts (quiz_id, student_id) VALUES ($1, $2) RETURNING attempt_id`,
        [quizId, student],
      )
    ).rows[0].attempt_id;
    await client.query(
      `INSERT INTO student_answers (attempt_id, question_id, option_id, is_correct) VALUES ($1, $2, $3, false)`,
      [attempt, q1, option],
    );
    await expectConstraintFailure(
      `INSERT INTO student_answers (attempt_id, question_id, option_id, is_correct) VALUES ($1, $2, $3, false)`,
      [attempt, q1, wrongOption],
      'INV-03 answer consistency',
    );
  });

  it('prevents games for competitive quizzes [game decision]', async () => {
    const lecturer = (
      await client.query(
        `INSERT INTO users (email, password_hash, role, full_name) VALUES ('game-lecturer@example.com', 'hash', 'lecturer', 'Game Lecturer') RETURNING user_id`,
      )
    ).rows[0].user_id;
    const moduleId = (
      await client.query(
        `INSERT INTO modules (lecturer_id, module_code, module_name, join_code) VALUES ($1, 'CS501', 'Games', 'JOINCODE52345') RETURNING module_id`,
        [lecturer],
      )
    ).rows[0].module_id;
    const quizId = (
      await client.query(
        `INSERT INTO quizzes (module_id, created_by, title, is_competitive, status) VALUES ($1, $2, 'Competitive Game', true, 'published') RETURNING quiz_id`,
        [moduleId, lecturer],
      )
    ).rows[0].quiz_id;
    await expectConstraintFailure(
      `INSERT INTO games (quiz_id, game_type) VALUES ($1, 'flashcards')`,
      [quizId],
      'games are practice-only',
    );
  });
});
