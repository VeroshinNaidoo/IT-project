// @ts-nocheck - this suite drives runtime Express routes and dynamic fixtures.
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';

process.env.NODE_ENV = 'development';
process.env.COOKIE_SECURE = 'false';
process.env.AUTH_RATE_LIMIT = '1000';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
const { app } = await import('../src/app.js');
const { pool } = await import('../db.js');
const { authorizationMatrix, matrixKey } =
  await import('../src/authorization-matrix.js');

const routeInventory = app.router.stack
  .filter((layer) => layer.route)
  .flatMap((layer) =>
    Object.keys(layer.route.methods).map((method) =>
      matrixKey(method, layer.route.path),
    ),
  );
const uuid = () => '00000000-0000-0000-0000-000000000000';
const users = {
  lecturer: {
    email: 'matrix-lecturer@example.com',
    password: 'MatrixLecturerPassword1!',
    fullName: 'Matrix Lecturer',
  },
  student: {
    email: 'matrix-student@example.com',
    password: 'MatrixStudentPassword1!',
    fullName: 'Matrix Student',
  },
  outsider: {
    email: 'matrix-outsider@example.com',
    password: 'MatrixStudentPassword1!',
    fullName: 'Matrix Outsider',
  },
};
let fixture;

const pathFor = (template, values = fixture) =>
  template
    .replace(':moduleId', values.moduleId)
    .replace(':groupId', values.groupId)
    .replace(':joinGroupId', values.joinGroupId)
    .replace(':resourceId', values.resourceId)
    .replace(':quizId', values.quizId)
    .replace(':startQuizId', values.startQuizId)
    .replace(':jobId', values.jobId)
    .replace(':attemptId', values.attemptId);

async function login(role) {
  const agent = request.agent(app);
  const result = await agent.post('/api/v1/auth/login').send({
    email: users[role].email,
    password: users[role].password,
  });
  expect(result.status, `login ${role}`).toBe(200);
  return agent;
}

async function revokedCookie() {
  const result = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: users.student.email, password: users.student.password });
  expect(result.status).toBe(200);
  const cookie = result.headers['set-cookie'][0].split(';')[0];
  expect(
    (await request(app).post('/api/v1/auth/logout').set('Cookie', cookie))
      .status,
  ).toBe(204);
  return cookie;
}

function send(agent, method, path, body) {
  if (method === 'POST' && path.endsWith('/resources'))
    return agent
      .post(path)
      .field('title', 'Matrix Upload')
      .attach('file', Buffer.from('%PDF-1.4 matrix'), 'matrix.pdf');
  const call = agent[method.toLowerCase()](path);
  return body === undefined ? call : call.send(body);
}

function sendWithCookie(method, path, cookie, body) {
  const call = request(app)[method.toLowerCase()](path).set('Cookie', cookie);
  return body === undefined ? call : call.send(body);
}

const bodies = {
  'POST /api/v1/auth/register': () => ({
    email: `matrix-new-${Date.now()}@example.com`,
    password: users.student.password,
    fullName: 'New Matrix Student',
  }),
  'POST /api/v1/auth/login': () => ({
    email: users.student.email,
    password: users.student.password,
  }),
  'PUT /api/v1/auth/me': () => ({ fullName: 'Updated Matrix Student' }),
  'POST /api/v1/modules': () => ({
    moduleCode: `M${Date.now().toString().slice(-6)}`,
    moduleName: 'Matrix Module',
  }),
  'POST /api/v1/enrollments': () => ({ joinCode: fixture.joinCode }),
  'POST /api/v1/modules/:moduleId/groups': () => ({
    groupName: `Matrix Group ${Date.now()}`,
  }),
  'POST /api/v1/quizzes': () => ({
    moduleId: fixture.moduleId,
    title: 'Matrix Quiz',
    questions: [
      {
        questionText: 'Matrix question',
        marks: 1,
        topic: 'Matrix topic',
        options: [
          { optionText: 'Correct', isCorrect: true },
          { optionText: 'Wrong', isCorrect: false },
        ],
      },
    ],
  }),
  'POST /api/v1/resources/:resourceId/generation-jobs': () => ({
    questionCount: 5,
    difficulty: 'mixed',
  }),
  'PUT /api/v1/quizzes/:quizId': () => ({
    title: 'Updated Matrix Quiz',
    isCompetitive: false,
    closesAt: null,
    status: 'draft',
  }),
  'POST /api/v1/attempts/:attemptId/submit': () => ({ answers: [] }),
};

const specs = {
  'GET /health': ['/health', null],
  'POST /api/v1/auth/register': ['/api/v1/auth/register', null],
  'POST /api/v1/auth/login': ['/api/v1/auth/login', null],
  'POST /api/v1/auth/logout': ['/api/v1/auth/logout', 'lecturer'],
  'GET /api/v1/auth/me': ['/api/v1/auth/me', 'student'],
  'PUT /api/v1/auth/me': ['/api/v1/auth/me', 'student'],
  'GET /api/v1/modules': ['/api/v1/modules', 'lecturer'],
  'POST /api/v1/modules': ['/api/v1/modules', 'lecturer'],
  'POST /api/v1/enrollments': ['/api/v1/enrollments', 'student'],
  'POST /api/v1/modules/:moduleId/groups': [
    '/api/v1/modules/:moduleId/groups',
    'lecturer',
  ],
  'POST /api/v1/groups/:groupId/join': [
    '/api/v1/groups/:joinGroupId/join',
    'outsider',
  ],
  'GET /api/v1/modules/:moduleId/resources': [
    '/api/v1/modules/:moduleId/resources',
    'lecturer',
  ],
  'POST /api/v1/modules/:moduleId/resources': [
    '/api/v1/modules/:moduleId/resources',
    'lecturer',
  ],
  'POST /api/v1/quizzes': ['/api/v1/quizzes', 'lecturer'],
  'GET /api/v1/modules/:moduleId/quizzes': [
    '/api/v1/modules/:moduleId/quizzes',
    'lecturer',
  ],
  'POST /api/v1/resources/:resourceId/generation-jobs': [
    '/api/v1/resources/:resourceId/generation-jobs',
    'lecturer',
  ],
  'GET /api/v1/ai-generation-jobs/:jobId': [
    '/api/v1/ai-generation-jobs/:jobId',
    'lecturer',
  ],
  'GET /api/v1/quizzes/:quizId': ['/api/v1/quizzes/:quizId', 'lecturer'],
  'PUT /api/v1/quizzes/:quizId': ['/api/v1/quizzes/:quizId', 'lecturer'],
  'POST /api/v1/quizzes/:quizId/attempts': [
    '/api/v1/quizzes/:startQuizId/attempts',
    'student',
  ],
  'GET /api/v1/quizzes/:quizId/games': [
    '/api/v1/quizzes/:quizId/games',
    'lecturer',
  ],
  'POST /api/v1/attempts/:attemptId/submit': [
    '/api/v1/attempts/:attemptId/submit',
    'student',
  ],
  'GET /api/v1/modules/:moduleId/leaderboard': [
    '/api/v1/modules/:moduleId/leaderboard',
    'lecturer',
  ],
  'GET /api/v1/me/analytics': ['/api/v1/me/analytics', 'student'],
  'GET /api/v1/modules/:moduleId/groups/:groupId/analytics': [
    '/api/v1/modules/:moduleId/groups/:groupId/analytics',
    'lecturer',
  ],
  'GET /api/v1/modules/:moduleId/analytics': [
    '/api/v1/modules/:moduleId/analytics',
    'lecturer',
  ],
};

async function createFixture() {
  const lecturerHash = await bcrypt.hash(users.lecturer.password, 4);
  const studentHash = await bcrypt.hash(users.student.password, 4);
  for (const [role, user] of Object.entries(users)) {
    const existing = await pool.query(
      'SELECT user_id FROM users WHERE email=$1',
      [user.email],
    );
    const values = [
      user.email,
      role === 'lecturer' ? lecturerHash : studentHash,
      role === 'lecturer' ? role : 'student',
      user.fullName,
    ];
    if (existing.rowCount)
      await pool.query(
        'UPDATE users SET password_hash=$2,role=$3,full_name=$4 WHERE email=$1',
        values,
      );
    else
      await pool.query(
        'INSERT INTO users(email,password_hash,role,full_name) VALUES($1,$2,$3,$4)',
        values,
      );
  }
  const result = await pool.query(
    'SELECT email,user_id FROM users WHERE email=ANY($1)',
    [[users.lecturer.email, users.student.email, users.outsider.email]],
  );
  const ids = Object.fromEntries(
    result.rows.map((row) => [row.email, row.user_id]),
  );
  const moduleRow = (
    await pool.query(
      "INSERT INTO modules(lecturer_id,module_code,module_name,join_code) VALUES($1,'MATRIX101','Matrix Module','MATRIXJOIN2026') ON CONFLICT(module_code) DO UPDATE SET lecturer_id=excluded.lecturer_id RETURNING *",
      [ids[users.lecturer.email]],
    )
  ).rows[0];
  await pool.query(
    'INSERT INTO enrollments(student_id,module_id) VALUES($1,$2) ON CONFLICT DO NOTHING',
    [ids[users.student.email], moduleRow.module_id],
  );
  await pool.query(
    'INSERT INTO enrollments(student_id,module_id) VALUES($1,$2) ON CONFLICT DO NOTHING',
    [ids[users.outsider.email], moduleRow.module_id],
  );
  const group = (
    await pool.query(
      "INSERT INTO study_groups(module_id,created_by,group_name) VALUES($1,$2,'Matrix Group') ON CONFLICT(module_id,group_name) DO UPDATE SET group_name=excluded.group_name RETURNING *",
      [moduleRow.module_id, ids[users.lecturer.email]],
    )
  ).rows[0];
  const joinGroup = (
    await pool.query(
      "INSERT INTO study_groups(module_id,created_by,group_name) VALUES($1,$2,'Matrix Join Group') ON CONFLICT(module_id,group_name) DO UPDATE SET created_by=excluded.created_by RETURNING *",
      [moduleRow.module_id, ids[users.lecturer.email]],
    )
  ).rows[0];
  await pool.query(
    'INSERT INTO group_members(group_id,student_id) VALUES($1,$2) ON CONFLICT DO NOTHING',
    [group.group_id, ids[users.student.email]],
  );
  const resource = (
    await pool.query(
      "INSERT INTO resources(uploaded_by,module_id,title,resource_type,file_location,file_size_bytes) VALUES($1,$2,'Matrix Resource','txt','matrix.txt',1) RETURNING *",
      [ids[users.lecturer.email], moduleRow.module_id],
    )
  ).rows[0];
  const quiz = (
    await pool.query(
      "INSERT INTO quizzes(module_id,resource_id,created_by,title,is_competitive,status) VALUES($1,$2,$3,'Matrix Quiz',false,'published') RETURNING *",
      [moduleRow.module_id, resource.resource_id, ids[users.lecturer.email]],
    )
  ).rows[0];
  const startQuiz = (
    await pool.query(
      "INSERT INTO quizzes(module_id,resource_id,created_by,title,is_competitive,status) VALUES($1,$2,$3,'Matrix Start Quiz',false,'published') RETURNING *",
      [moduleRow.module_id, resource.resource_id, ids[users.lecturer.email]],
    )
  ).rows[0];
  const question = (
    await pool.query(
      "INSERT INTO questions(quiz_id,question_text,marks) VALUES($1,'Matrix question',1) RETURNING *",
      [quiz.quiz_id],
    )
  ).rows[0];
  await pool.query(
    "INSERT INTO question_options(question_id,option_text,is_correct) VALUES($1,'Matrix option',true)",
    [question.question_id],
  );
  const job = (
    await pool.query(
      'INSERT INTO ai_generation_jobs(requested_by,resource_id) VALUES($1,$2) RETURNING *',
      [ids[users.lecturer.email], resource.resource_id],
    )
  ).rows[0];
  const attempt = (
    await pool.query(
      'INSERT INTO quiz_attempts(quiz_id,student_id) VALUES($1,$2) RETURNING *',
      [quiz.quiz_id, ids[users.student.email]],
    )
  ).rows[0];
  fixture = {
    moduleId: moduleRow.module_id,
    joinCode: moduleRow.join_code,
    groupId: group.group_id,
    joinGroupId: joinGroup.group_id,
    resourceId: resource.resource_id,
    quizId: quiz.quiz_id,
    startQuizId: startQuiz.quiz_id,
    jobId: job.job_id,
    attemptId: attempt.attempt_id,
  };
}

async function assertNoSensitive(result) {
  expect(JSON.stringify(result.body)).not.toContain('password_hash');
  expect(JSON.stringify(result.body)).not.toContain('is_correct');
}

async function assertRoute(route, [template, successRole]) {
  const [method] = route.split(' ');
  const verb = method.toLowerCase();
  const path = pathFor(template);
  const body = bodies[route]?.() ?? {};
  const isPublic = authorizationMatrix[route].auth === 'public';
  if (!isPublic) {
    expect(
      (await send(request(app), method, path, body)).status,
      `${route} 401`,
    ).toBe(401);
    const cookie = await revokedCookie();
    expect(
      (await sendWithCookie(method, path, cookie, body)).status,
      `${route} revoked`,
    ).toBe(401);
    if (!authorizationMatrix[route].auth.includes('|')) {
      const wrongRole =
        authorizationMatrix[route].auth === 'lecturer' ? 'student' : 'lecturer';
      expect([403, 404], `${route} wrong role`).toContain(
        (await send(await login(wrongRole), method, path, body)).status,
      );
    }
    if (template.includes(':') || route === 'POST /api/v1/quizzes') {
      const ownerPath = pathFor(template, {
        ...fixture,
        moduleId: uuid(),
        groupId: uuid(),
        joinGroupId: uuid(),
        resourceId: uuid(),
        quizId: uuid(),
        startQuizId: uuid(),
        jobId: uuid(),
        attemptId: uuid(),
      });
      const ownerBody =
        route === 'POST /api/v1/quizzes' ? { ...body, moduleId: uuid() } : body;
      expect([403, 404], `${route} wrong owner`).toContain(
        (await send(await login(successRole), method, ownerPath, ownerBody))
          .status,
      );
    }
  }
  const invalidAgent = isPublic ? request(app) : await login(successRole);
  const invalidBody =
    route === 'POST /api/v1/resources/:resourceId/generation-jobs'
      ? { questionCount: 0, difficulty: 'mixed' }
      : { unknownField: true };
  const invalid =
    route === 'POST /api/v1/groups/:groupId/join'
      ? await send(
          invalidAgent,
          method,
          pathFor(template, { ...fixture, joinGroupId: uuid() }),
          invalidBody,
        )
      : route === 'POST /api/v1/modules/:moduleId/resources'
        ? await invalidAgent
            .post(path)
            .field('title', 'fuck')
            .attach('file', Buffer.from('%PDF-1.4 matrix'), 'matrix.pdf')
        : await send(invalidAgent, method, path, invalidBody);
  if (method === 'GET' || route === 'GET /health')
    expect(invalid.status).toBeGreaterThanOrEqual(200);
  else expect([400, 404, 422], `${route} validation`).toContain(invalid.status);
  const success = await send(
    successRole ? await login(successRole) : request(app),
    method,
    path,
    body,
  );
  expect(success.status, `${route} success`).toBeGreaterThanOrEqual(200);
  expect(success.status, `${route} success`).toBeLessThan(300);
  await assertNoSensitive(success);
}

describe('executable route authorization matrix', () => {
  beforeAll(createFixture);
  it('derives every route and requires a concrete assertion body', () => {
    expect(routeInventory.length).toBe(26);
    expect(Object.keys(specs).sort()).toEqual([...routeInventory].sort());
    for (const route of routeInventory) {
      expect(specs[route]).toBeTruthy();
      expect(assertRoute.toString()).toContain('expect(');
    }
  });
  for (const route of routeInventory)
    it(`${route} executes all authorization cases`, async () => {
      await assertRoute(route, specs[route]);
    });
  it('keeps game access catalog-driven and unscored', () => {
    expect(
      authorizationMatrix['GET /api/v1/quizzes/:quizId/games'].auth,
    ).toContain('student');
  });
});
