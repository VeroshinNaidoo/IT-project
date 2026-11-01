// @ts-nocheck - this suite drives runtime Express routes and dynamic fixtures.
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
const verificationToken = 'matrix-verification-token-1234567890';

const pathFor = (template, values = fixture) =>
  template
    .replace(':moduleId', values.moduleId)
    .replace(':labId', values.labId)
    .replace(':deleteLabId', values.deleteLabId || values.labId)
    .replace(':groupId', values.groupId)
    .replace(':joinGroupId', values.joinGroupId)
    .replace(':resourceId', values.resourceId)
    .replace(':quizId', values.quizId)
    .replace(':startQuizId', values.startQuizId)
    .replace(':jobId', values.jobId)
    .replace(':attemptId', values.attemptId)
    .replace(':studentId', values.studentId)
    .replace(':updateId', values.updateId)
    .replace(
      ':id',
      template.includes('island-escape')
        ? values.islandPlayId
        : template.includes('boss-battle')
          ? values.bossPlayId
          : template.includes('pixel-racer')
            ? values.pixelPlayId
            : template.includes('timer-trivia')
              ? values.timerPlayId
              : template.includes('memory-match')
                ? values.memoryPlayId
                : values.infectedSessionId,
    );

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
  'POST /api/v1/auth/login/mfa': () => ({
    challengeId: '00000000-0000-0000-0000-000000000000',
    code: '000000',
  }),
  'POST /api/v1/mfa/enrol': () => ({}),
  'POST /api/v1/mfa/confirm': () => ({ code: '000000' }),
  'POST /api/v1/mfa/disable': () => ({
    password: users.lecturer.password,
    code: '000000',
  }),
  'POST /api/v1/mfa/recovery-codes/regenerate': () => ({
    password: users.lecturer.password,
    code: '000000',
  }),
  'PUT /api/v1/auth/me': () => ({ fullName: 'Updated Matrix Student' }),
  'PATCH /api/v1/me/profile': () => ({ role: 'lecturer' }),
  'POST /api/v1/me/password': () => ({
    password: 'wrong',
    newPassword: 'NewPassword9!',
    confirmPassword: 'NewPassword9!',
  }),
  'POST /api/v1/me/email': () => ({
    password: 'wrong',
    email: 'matrix-new@example.com',
  }),
  'POST /api/v1/modules': () => ({
    moduleCode: `M${Date.now().toString().slice(-6)}`,
    moduleName: 'Matrix Module',
  }),
  'POST /api/v1/enrollments': () => ({ joinCode: fixture.joinCode }),
  'POST /api/v1/modules/:moduleId/groups': () => ({
    groupName: `Matrix Group ${Date.now()}`,
  }),
  'POST /api/v1/groups': () => ({
    moduleId: fixture.moduleId,
    groupName: `Matrix Direct Group ${Date.now()}`,
  }),
  'PATCH /api/v1/groups/:groupId': () => ({
    groupName: 'Updated Matrix Group',
  }),
  'POST /api/v1/groups/:groupId/leaders': () => ({
    studentId: fixture.studentId,
  }),
  'DELETE /api/v1/groups/:groupId/leaders/:studentId': () => ({}),
  'POST /api/v1/groups/:groupId/updates': () => ({
    kind: 'doing_now',
    text: 'Reviewing the module notes',
  }),
  'DELETE /api/v1/groups/:groupId/updates/:updateId': () => ({}),
  'POST /api/v1/groups/:groupId/leave': () => ({}),
  'POST /api/v1/quizzes': () => ({
    moduleId: fixture.moduleId,
    title: 'Matrix Quiz',
    questions: [
      {
        questionText: 'Matrix question',
        marks: 1,
        difficultyLevel: 3,
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
    quizMode: 'practice',
  }),
  'PUT /api/v1/quizzes/:quizId': () => ({
    title: 'Updated Matrix Quiz',
    isCompetitive: false,
    closesAt: null,
    status: 'draft',
  }),
  'POST /api/v1/attempts/:attemptId/submit': () => ({ answers: [] }),
  'POST /api/v1/games/infected/sessions': () => ({
    quizId: fixture.startQuizId,
  }),
  'POST /api/v1/games/infected/sessions/:id/choose': () => ({
    cardId: fixture.infectedCardId,
  }),
  'POST /api/v1/games/infected/sessions/:id/answer': () => ({
    optionId: fixture.infectedOptionId,
  }),
  'POST /api/v1/games/island-escape/plays': () => ({
    quizId: fixture.startQuizId,
  }),
  'POST /api/v1/games/island-escape/plays/:id/answer': () => ({
    optionId: fixture.infectedOptionId,
  }),
  'POST /api/v1/games/memory-match/plays': () => ({
    quizId: fixture.quizId,
  }),
  'POST /api/v1/games/memory-match/plays/:id/flip': () => ({
    cardId: fixture.memoryCardId,
  }),
  'POST /api/v1/games/boss-battle/plays': () => ({
    quizId: fixture.startQuizId,
  }),
  'POST /api/v1/games/boss-battle/plays/:id/answer': () => ({
    optionId: fixture.bossOptionId,
  }),
  'POST /api/v1/games/pixel-racer/plays': () => ({
    quizId: fixture.startQuizId,
  }),
  'POST /api/v1/games/pixel-racer/plays/:id/answer': () => ({
    optionId: fixture.pixelOptionId,
  }),
  'POST /api/v1/games/timer-trivia/plays': () => ({
    quizId: fixture.startQuizId,
  }),
  'POST /api/v1/games/timer-trivia/plays/:id/choose': () => ({
    cellId: fixture.timerCellId,
  }),
  'POST /api/v1/games/timer-trivia/plays/:id/answer': () => ({
    optionId: fixture.timerOptionId,
  }),
  'POST /api/v1/labs': () => ({
    moduleId: fixture.moduleId,
    kind: 'code',
    title: `Matrix Lab ${Date.now()}`,
    instructions: 'Build a heading.',
    difficulty: 1,
    config: {
      starterHtml: '<h1>Start</h1>',
      starterCss: '',
      starterJs: '',
      checks: [],
    },
  }),
  'PATCH /api/v1/labs/:labId': () => ({ title: 'Updated Matrix Lab' }),
  'PUT /api/v1/labs/:labId/attempt': () => ({
    submission: { html: '<h1>Start</h1>', css: '', js: '' },
    checksPassed: 0,
    checksTotal: 0,
    completed: true,
  }),
};

const specs = {
  'GET /health': ['/health', null],
  'POST /api/v1/auth/register': ['/api/v1/auth/register', null],
  'POST /api/v1/auth/login': ['/api/v1/auth/login', null],
  'POST /api/v1/auth/login/mfa': ['/api/v1/auth/login/mfa', null],
  'POST /api/v1/mfa/enrol': ['/api/v1/mfa/enrol', 'lecturer'],
  'POST /api/v1/mfa/confirm': ['/api/v1/mfa/confirm', 'lecturer'],
  'POST /api/v1/mfa/disable': ['/api/v1/mfa/disable', 'lecturer'],
  'POST /api/v1/mfa/recovery-codes/regenerate': [
    '/api/v1/mfa/recovery-codes/regenerate',
    'lecturer',
  ],
  'GET /api/v1/auth/verify-email': [
    `/api/v1/auth/verify-email?token=${verificationToken}`,
    null,
  ],
  'POST /api/v1/auth/logout': ['/api/v1/auth/logout', 'lecturer'],
  'GET /api/v1/auth/me': ['/api/v1/auth/me', 'student'],
  'PUT /api/v1/auth/me': ['/api/v1/auth/me', 'student'],
  'GET /api/v1/me/profile': ['/api/v1/me/profile', 'student'],
  'PATCH /api/v1/me/profile': ['/api/v1/me/profile', 'student'],
  'POST /api/v1/me/password': ['/api/v1/me/password', 'student'],
  'POST /api/v1/me/email': ['/api/v1/me/email', 'student'],
  'GET /api/v1/modules': ['/api/v1/modules', 'lecturer'],
  'GET /api/v1/me/modules': ['/api/v1/me/modules', 'student'],
  'GET /api/v1/me/modules/lookahead': [
    '/api/v1/me/modules/lookahead',
    'student',
  ],
  'GET /api/v1/resources/modules': ['/api/v1/resources/modules', 'student'],
  'POST /api/v1/modules': ['/api/v1/modules', 'lecturer'],
  'POST /api/v1/enrollments': ['/api/v1/enrollments', 'student'],
  'POST /api/v1/modules/:moduleId/groups': [
    '/api/v1/modules/:moduleId/groups',
    'lecturer',
  ],
  'GET /api/v1/groups': ['/api/v1/groups', 'student'],
  'POST /api/v1/groups': ['/api/v1/groups', 'student'],
  'PATCH /api/v1/groups/:groupId': ['/api/v1/groups/:groupId', 'student'],
  'POST /api/v1/groups/:groupId/leaders': [
    '/api/v1/groups/:groupId/leaders',
    'student',
  ],
  'DELETE /api/v1/groups/:groupId/leaders/:studentId': [
    '/api/v1/groups/:groupId/leaders/:studentId',
    'student',
  ],
  'POST /api/v1/groups/:groupId/updates': [
    '/api/v1/groups/:groupId/updates',
    'student',
  ],
  'DELETE /api/v1/groups/:groupId/updates/:updateId': [
    '/api/v1/groups/:groupId/updates/:updateId',
    'student',
  ],
  'POST /api/v1/groups/:groupId/leave': [
    '/api/v1/groups/:groupId/leave',
    'outsider',
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
  'GET /api/v1/ai-status': ['/api/v1/ai-status', 'lecturer'],
  'POST /api/v1/ai-generation-jobs/:jobId/cancel': [
    '/api/v1/ai-generation-jobs/:jobId/cancel',
    'lecturer',
  ],
  'POST /api/v1/ai-generation-jobs/:jobId/retry': [
    '/api/v1/ai-generation-jobs/:jobId/retry',
    'lecturer',
  ],
  'GET /api/v1/labs': ['/api/v1/labs', 'student'],
  'POST /api/v1/labs': ['/api/v1/labs', 'lecturer'],
  'GET /api/v1/labs/:labId': ['/api/v1/labs/:labId', 'student'],
  'PATCH /api/v1/labs/:labId': ['/api/v1/labs/:labId', 'lecturer'],
  'POST /api/v1/labs/:labId/duplicate': [
    '/api/v1/labs/:labId/duplicate',
    'lecturer',
  ],
  'DELETE /api/v1/labs/:labId': ['/api/v1/labs/:deleteLabId', 'lecturer'],
  'GET /api/v1/labs/:labId/attempt': ['/api/v1/labs/:labId/attempt', 'student'],
  'PUT /api/v1/labs/:labId/attempt': ['/api/v1/labs/:labId/attempt', 'student'],
  'GET /api/v1/modules/:moduleId/labs/activity': [
    '/api/v1/modules/:moduleId/labs/activity',
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
  'GET /api/v1/games/catalogue': ['/api/v1/games/catalogue', 'student'],
  'GET /api/v1/games/availability/:quizId': [
    '/api/v1/games/availability/:quizId',
    'student',
  ],
  'GET /api/v1/games/in-progress': ['/api/v1/games/in-progress', 'student'],
  'GET /api/v1/games/quiz-picker': ['/api/v1/games/quiz-picker', 'student'],
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
  'POST /api/v1/games/infected/sessions': [
    '/api/v1/games/infected/sessions',
    'student',
  ],
  'POST /api/v1/games/infected/sessions/:id/choose': [
    '/api/v1/games/infected/sessions/:id/choose',
    'student',
  ],
  'POST /api/v1/games/infected/sessions/:id/answer': [
    '/api/v1/games/infected/sessions/:id/answer',
    'student',
  ],
  'GET /api/v1/games/infected/sessions/:id': [
    '/api/v1/games/infected/sessions/:id',
    'student',
  ],
  'GET /api/v1/modules/:moduleId/games/infected/activity': [
    '/api/v1/modules/:moduleId/games/infected/activity',
    'lecturer',
  ],
  'GET /api/v1/modules/:moduleId/games/activity': [
    '/api/v1/modules/:moduleId/games/activity',
    'lecturer',
  ],
  'POST /api/v1/games/island-escape/plays': [
    '/api/v1/games/island-escape/plays',
    'student',
  ],
  'POST /api/v1/games/island-escape/plays/:id/answer': [
    '/api/v1/games/island-escape/plays/:id/answer',
    'student',
  ],
  'GET /api/v1/games/island-escape/plays/:id': [
    '/api/v1/games/island-escape/plays/:id',
    'student',
  ],
  'POST /api/v1/games/memory-match/plays': [
    '/api/v1/games/memory-match/plays',
    'student',
  ],
  'GET /api/v1/games/memory-match/plays/:id': [
    '/api/v1/games/memory-match/plays/:id',
    'student',
  ],
  'POST /api/v1/games/memory-match/plays/:id/flip': [
    '/api/v1/games/memory-match/plays/:id/flip',
    'student',
  ],
  'POST /api/v1/games/boss-battle/plays': [
    '/api/v1/games/boss-battle/plays',
    'student',
  ],
  'GET /api/v1/games/boss-battle/plays/:id': [
    '/api/v1/games/boss-battle/plays/:id',
    'student',
  ],
  'POST /api/v1/games/boss-battle/plays/:id/answer': [
    '/api/v1/games/boss-battle/plays/:id/answer',
    'student',
  ],
  'POST /api/v1/games/pixel-racer/plays': [
    '/api/v1/games/pixel-racer/plays',
    'student',
  ],
  'GET /api/v1/games/pixel-racer/plays/:id': [
    '/api/v1/games/pixel-racer/plays/:id',
    'student',
  ],
  'POST /api/v1/games/pixel-racer/plays/:id/answer': [
    '/api/v1/games/pixel-racer/plays/:id/answer',
    'student',
  ],
  'POST /api/v1/games/timer-trivia/plays': [
    '/api/v1/games/timer-trivia/plays',
    'student',
  ],
  'GET /api/v1/games/timer-trivia/plays/:id': [
    '/api/v1/games/timer-trivia/plays/:id',
    'student',
  ],
  'POST /api/v1/games/timer-trivia/plays/:id/choose': [
    '/api/v1/games/timer-trivia/plays/:id/choose',
    'student',
  ],
  'POST /api/v1/games/timer-trivia/plays/:id/answer': [
    '/api/v1/games/timer-trivia/plays/:id/answer',
    'student',
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
  await pool.query(
    'UPDATE users SET email_verified_at=now() WHERE email=ANY($1)',
    [[users.lecturer.email, users.student.email, users.outsider.email]],
  );
  const result = await pool.query(
    'SELECT email,user_id FROM users WHERE email=ANY($1)',
    [[users.lecturer.email, users.student.email, users.outsider.email]],
  );
  const ids = Object.fromEntries(
    result.rows.map((row) => [row.email, row.user_id]),
  );
  await pool.query(
    `INSERT INTO email_verification_tokens(user_id,token_hash,expires_at) VALUES($1,$2,now()+interval '1 hour')`,
    [
      ids[users.lecturer.email],
      crypto.createHash('sha256').update(verificationToken).digest('hex'),
    ],
  );
  const moduleRow = (
    await pool.query(
      "INSERT INTO modules(lecturer_id,module_code,module_name,join_code) VALUES($1,'MATRIX101','Matrix Module','MATRIXJOIN2026') ON CONFLICT(module_code) DO UPDATE SET lecturer_id=excluded.lecturer_id RETURNING *",
      [ids[users.lecturer.email]],
    )
  ).rows[0];
  const labRow = (
    await pool.query(
      `INSERT INTO labs(module_id,kind,title,instructions,difficulty,status,created_by,config) VALUES($1,'code','Matrix Lab','Build a heading.',1,'published',$2,$3) RETURNING lab_id`,
      [
        moduleRow.module_id,
        ids[users.lecturer.email],
        {
          starterHtml: '<h1>Start</h1>',
          starterCss: '',
          starterJs: '',
          checks: [],
        },
      ],
    )
  ).rows[0];
  const deleteLabRow = (
    await pool.query(
      `INSERT INTO labs(module_id,kind,title,instructions,difficulty,status,created_by,config) VALUES($1,'code','Matrix Delete Lab','Build a heading.',1,'published',$2,$3) RETURNING lab_id`,
      [
        moduleRow.module_id,
        ids[users.lecturer.email],
        {
          starterHtml: '<h1>Start</h1>',
          starterCss: '',
          starterJs: '',
          checks: [],
        },
      ],
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
  await pool.query(
    `INSERT INTO group_leaders(group_id,student_id,role) VALUES($1,$2,'leader') ON CONFLICT DO NOTHING`,
    [group.group_id, ids[users.student.email]],
  );
  await pool.query(
    'INSERT INTO group_members(group_id,student_id) VALUES($1,$2) ON CONFLICT DO NOTHING',
    [group.group_id, ids[users.outsider.email]],
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
  await pool.query(
    "UPDATE game_types SET is_enabled=true WHERE key='memory_match'",
  );
  await pool.query(
    "UPDATE game_types SET is_enabled=true WHERE key='boss_battle'",
  );
  await pool.query(
    "UPDATE game_types SET is_enabled=true WHERE key='pixel_racer'",
  );
  await pool.query(
    "UPDATE game_types SET is_enabled=true WHERE key='timer_trivia'",
  );
  for (let index = 0; index < 6; index += 1) {
    const memoryQuestion = (
      await pool.query(
        `INSERT INTO questions(quiz_id,question_text,marks,difficulty_level,explanation)
       VALUES($1,$2,1,3,$3) RETURNING question_id`,
        [
          quiz.quiz_id,
          `Memory question ${index + 1}`,
          `Memory explanation ${index + 1}.`,
        ],
      )
    ).rows[0];
    await pool.query(
      `INSERT INTO question_options(question_id,option_text,is_correct)
       VALUES($1,$2,true),($1,$3,false)`,
      [
        memoryQuestion.question_id,
        `Memory answer ${index + 1}`,
        `Memory distractor ${index + 1}`,
      ],
    );
  }
  let infectedCardId;
  let infectedOptionId;
  const islandQuestionIds = [];
  const timerTopics = [];
  for (const name of ['Matrix Timer Alpha', 'Matrix Timer Beta'])
    timerTopics.push(
      (
        await pool.query(
          `INSERT INTO topics(module_id,name) VALUES($1,$2)
           ON CONFLICT(module_id,name) DO UPDATE SET name=excluded.name
           RETURNING topic_id`,
          [moduleRow.module_id, name],
        )
      ).rows[0].topic_id,
    );
  for (let index = 0; index < 30; index += 1) {
    const infectedQuestion = (
      await pool.query(
        `INSERT INTO questions(quiz_id,topic_id,question_text,marks,difficulty_level,explanation)
         VALUES($1,$2,$3,1,$4,$5) RETURNING question_id`,
        [
          startQuiz.quiz_id,
          timerTopics[Math.floor(index / 5) % 2],
          `Matrix infected question ${index + 1}?`,
          (index % 5) + 1,
          `Matrix explanation ${index + 1}.`,
        ],
      )
    ).rows[0];
    const option = (
      await pool.query(
        `INSERT INTO question_options(question_id,option_text,is_correct)
         VALUES($1,$2,true) RETURNING option_id`,
        [infectedQuestion.question_id, `Matrix infected correct ${index + 1}`],
      )
    ).rows[0];
    await pool.query(
      `INSERT INTO question_options(question_id,option_text,is_correct)
       VALUES($1,$2,false)`,
      [infectedQuestion.question_id, `Matrix infected wrong ${index + 1}`],
    );
    if (index === 0) {
      infectedCardId = infectedQuestion.question_id;
      infectedOptionId = option.option_id;
    }
    islandQuestionIds.push(infectedQuestion.question_id);
  }
  const infectedGame = (
    await pool.query(
      `SELECT g.game_id FROM games g JOIN game_types gt ON gt.game_type_id=g.game_type_id
       WHERE g.quiz_id=$1 AND gt.key='infected'`,
      [startQuiz.quiz_id],
    )
  ).rows[0];
  const infectedSession = (
    await pool.query(
      `INSERT INTO game_sessions(game_id,student_id) VALUES($1,$2) RETURNING session_id`,
      [infectedGame.game_id, ids[users.student.email]],
    )
  ).rows[0];
  const infectedTurn = (
    await pool.query(
      `INSERT INTO game_turns(session_id,turn_number,cure_before,hearts_before)
       VALUES($1,1,0,3) RETURNING turn_id`,
      [infectedSession.session_id],
    )
  ).rows[0];
  await pool.query(
    `INSERT INTO game_turn_cards(turn_id,session_id,card_index,question_id,difficulty_level)
     SELECT $1,$2,0,question_id,difficulty_level FROM questions WHERE question_id=$3`,
    [infectedTurn.turn_id, infectedSession.session_id, infectedCardId],
  );
  const islandType = (
    await pool.query(
      `SELECT game_type_id FROM game_types WHERE key='island_escape'`,
    )
  ).rows[0];
  const islandState = {
    version: 1,
    phase: 1,
    phaseAttempt: 1,
    phaseQuestionNumber: 0,
    wrongInPhase: 0,
    streak: 0,
    doubleActive: false,
    setbacks: 0,
    score: 0,
    materials: [],
    boatParts: [],
    sailProgress: 0,
    askedQuestionIds: [infectedCardId],
    phaseQuestionIds: islandQuestionIds.slice(0, 10),
    currentQuestionId: infectedCardId,
    status: 'in_progress',
    lastEvent: 'started',
    pointsEarned: 0,
  };
  const islandPlay = (
    await pool.query(
      `INSERT INTO game_plays(game_type_id,student_id,quiz_id,state,score)
       VALUES($1,$2,$3,$4::jsonb,0) RETURNING play_id`,
      [
        islandType.game_type_id,
        ids[users.student.email],
        startQuiz.quiz_id,
        JSON.stringify(islandState),
      ],
    )
  ).rows[0];
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
  const memoryAgent = await login('student');
  const memoryStart = await memoryAgent
    .post('/api/v1/games/memory-match/plays')
    .send({ quizId: quiz.quiz_id });
  expect(memoryStart.status).toBe(200);
  const bossStart = await memoryAgent
    .post('/api/v1/games/boss-battle/plays')
    .send({ quizId: startQuiz.quiz_id });
  expect([200, 201]).toContain(bossStart.status);
  const bossOption = (
    await pool.query(
      `SELECT option_id FROM question_options
       WHERE question_id=$1 AND is_correct=true`,
      [bossStart.body.data.question.questionId],
    )
  ).rows[0];
  const pixelStart = await memoryAgent
    .post('/api/v1/games/pixel-racer/plays')
    .send({ quizId: startQuiz.quiz_id });
  expect([200, 201]).toContain(pixelStart.status);
  const pixelOption = (
    await pool.query(
      `SELECT option_id FROM question_options
       WHERE question_id=$1 AND is_correct=true`,
      [pixelStart.body.data.question.questionId],
    )
  ).rows[0];
  const timerStart = await memoryAgent
    .post('/api/v1/games/timer-trivia/plays')
    .send({ quizId: startQuiz.quiz_id });
  expect([200, 201]).toContain(timerStart.status);
  const timerCellId = timerStart.body.data.play.board.find(
    (cell) => !cell.disabled,
  ).cellId;
  const timerChoose = await memoryAgent
    .post(
      `/api/v1/games/timer-trivia/plays/${timerStart.body.data.play.playId}/choose`,
    )
    .send({ cellId: timerCellId });
  expect(timerChoose.status).toBe(200);
  const timerOption = (
    await pool.query(
      `SELECT option_id FROM question_options
       WHERE question_id=$1 AND is_correct=true`,
      [timerChoose.body.data.question.questionId],
    )
  ).rows[0];
  const groupUpdate = (
    await pool.query(
      `INSERT INTO group_updates(group_id,author_id,kind,text) VALUES($1,$2,'doing_now','Matrix update') RETURNING update_id`,
      [group.group_id, ids[users.student.email]],
    )
  ).rows[0];
  fixture = {
    studentId: ids[users.outsider.email],
    updateId: groupUpdate.update_id,
    moduleId: moduleRow.module_id,
    labId: labRow.lab_id,
    deleteLabId: deleteLabRow.lab_id,
    joinCode: moduleRow.join_code,
    groupId: group.group_id,
    joinGroupId: joinGroup.group_id,
    resourceId: resource.resource_id,
    quizId: quiz.quiz_id,
    startQuizId: startQuiz.quiz_id,
    jobId: job.job_id,
    attemptId: attempt.attempt_id,
    infectedSessionId: infectedSession.session_id,
    infectedCardId,
    infectedOptionId,
    islandPlayId: islandPlay.play_id,
    memoryPlayId: memoryStart.body.data.playId,
    memoryCardId: memoryStart.body.data.cards[0].cardId,
    bossPlayId: bossStart.body.data.play.playId,
    bossOptionId: bossOption.option_id,
    pixelPlayId: pixelStart.body.data.play.playId,
    pixelOptionId: pixelOption.option_id,
    timerPlayId: timerStart.body.data.play.playId,
    timerCellId,
    timerOptionId: timerOption.option_id,
  };
}

async function assertNoSensitive(result, route) {
  expect(JSON.stringify(result.body)).not.toContain('password_hash');
  if (
    ![
      'POST /api/v1/games/infected/sessions/:id/answer',
      'POST /api/v1/games/island-escape/plays/:id/answer',
      'POST /api/v1/games/boss-battle/plays/:id/answer',
      'POST /api/v1/games/pixel-racer/plays/:id/answer',
      'POST /api/v1/games/timer-trivia/plays/:id/answer',
    ].includes(route)
  )
    expect(JSON.stringify(result.body)).not.toMatch(
      /is_correct|isCorrect|correctOption/,
    );
  if (route === 'GET /api/v1/modules/:moduleId/games/activity') {
    expect(JSON.stringify(result.body)).not.toMatch(
      /student|question|option|state/i,
    );
    for (const row of result.body.data)
      expect(Object.keys(row).sort()).toEqual(
        ['completions', 'display_name', 'key', 'plays'].sort(),
      );
  }
}

async function assertRoute(route, [template, successRole]) {
  const [method] = route.split(' ');
  const verb = method.toLowerCase();
  const path = pathFor(template);
  const body = bodies[route]?.() ?? {};
  const isPublic = authorizationMatrix[route].auth === 'public';
  if (
    route.startsWith('GET /api/v1/me/profile') ||
    route.startsWith('PATCH /api/v1/me/profile') ||
    route.startsWith('POST /api/v1/me/')
  ) {
    const unauthenticated = await send(request(app), method, path, body);
    expect(unauthenticated.status, `${route} unauthenticated`).toBe(401);
    if (method === 'GET') {
      const success = await send(await login(successRole), method, path);
      expect(success.status, `${route} success`).toBe(200);
      expect(success.body.profile).toBeTruthy();
      return;
    }
    const invalid = await send(await login(successRole), method, path, {
      unknownField: true,
    });
    expect([401, 422], `${route} validation`).toContain(invalid.status);
    expect(JSON.stringify(invalid.body)).not.toMatch(
      /password_hash|encrypted_secret|token_hash/i,
    );
    return;
  }
  if (
    route === 'POST /api/v1/auth/login/mfa' ||
    route.startsWith('POST /api/v1/mfa/')
  ) {
    const unauthenticated = await send(request(app), method, path, body);
    expect([401, 422], `${route} unauthenticated`).toContain(
      unauthenticated.status,
    );
    const wrongShape = await send(
      successRole ? await login(successRole) : request(app),
      method,
      path,
      { unknownField: true },
    );
    expect([400, 401, 409, 422], `${route} invalid`).toContain(
      wrongShape.status,
    );
    expect(JSON.stringify(wrongShape.body)).not.toMatch(
      /secret|recovery|token|hash/i,
    );
    return;
  }
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
    if (
      template.includes(':') ||
      route === 'POST /api/v1/quizzes' ||
      route === 'POST /api/v1/games/infected/sessions' ||
      route === 'POST /api/v1/games/island-escape/plays' ||
      route === 'POST /api/v1/games/boss-battle/plays' ||
      route === 'POST /api/v1/games/pixel-racer/plays' ||
      route === 'POST /api/v1/games/timer-trivia/plays'
    ) {
      const ownerPath = pathFor(template, {
        ...fixture,
        moduleId: uuid(),
        labId: uuid(),
        deleteLabId: uuid(),
        groupId: uuid(),
        joinGroupId: uuid(),
        resourceId: uuid(),
        quizId: uuid(),
        startQuizId: uuid(),
        jobId: uuid(),
        attemptId: uuid(),
        infectedSessionId: uuid(),
        islandPlayId: uuid(),
        memoryPlayId: uuid(),
        bossPlayId: uuid(),
        pixelPlayId: uuid(),
        timerPlayId: uuid(),
      });
      const ownerBody =
        route === 'POST /api/v1/quizzes'
          ? { ...body, moduleId: uuid() }
          : route === 'POST /api/v1/games/infected/sessions' ||
              route === 'POST /api/v1/games/island-escape/plays' ||
              route === 'POST /api/v1/games/boss-battle/plays' ||
              route === 'POST /api/v1/games/pixel-racer/plays' ||
              route === 'POST /api/v1/games/timer-trivia/plays'
            ? { quizId: uuid() }
            : body;
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
  const invalid = [
    'GET /api/v1/games/catalogue',
    'GET /api/v1/games/availability/:quizId',
    'GET /api/v1/games/in-progress',
    'GET /api/v1/games/quiz-picker',
  ].includes(route)
    ? await invalidAgent.get(path).query({ unknownField: 'true' })
    : route === 'GET /api/v1/auth/verify-email'
      ? await invalidAgent
          .get('/api/v1/auth/verify-email')
          .query({ token: verificationToken, unknownField: 'true' })
      : route === 'POST /api/v1/groups/:groupId/join'
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
  if (
    method === 'GET' &&
    !route.startsWith('GET /api/v1/games/infected') &&
    !route.includes('/games/')
  )
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
  await assertNoSensitive(success, route);
}

describe('executable route authorization matrix', () => {
  beforeAll(createFixture);
  it('derives every route and requires a concrete assertion body', () => {
    expect(routeInventory.length).toBe(85);
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
