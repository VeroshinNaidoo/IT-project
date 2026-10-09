// @ts-nocheck
import 'dotenv/config';
import crypto from 'node:crypto';
import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import { z } from 'zod';
import { pool } from '../db.js';
import {
  noProfanity,
  profanityMessage,
  containsProfanity,
} from './profanity/index.js';
import {
  recordProfanityViolation,
  isProfanityCooldownActive,
} from './profanity/rate-limit.js';

const app = express();
const port = Number(process.env.PORT || 4000);
const cookieSecure =
  process.env.COOKIE_SECURE !== 'false' ||
  process.env.NODE_ENV !== 'development';
if (
  process.env.NODE_ENV === 'production' &&
  process.env.COOKIE_SECURE === 'false'
)
  throw new Error('COOKIE_SECURE=false is not allowed in production');
const uploadDir = path.resolve(process.env.UPLOAD_DIR || './uploads');
await mkdir(uploadDir, { recursive: true });
const upload = multer({
  dest: uploadDir,
  limits: {
    fileSize: Number(process.env.UPLOAD_MAX_BYTES || 20 * 1024 * 1024),
  },
});

app.use(helmet());
app.use(
  cors({
    origin: process.env.FRONTEND_ORIGIN || 'http://localhost:5173',
    credentials: true,
  }),
);
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(
  '/api/v1/auth',
  rateLimit({ windowMs: 10 * 60 * 1000, limit: 30, standardHeaders: true }),
);

const sessionHash = (token) =>
  crypto.createHash('sha256').update(token).digest('hex');
const error = (res, status, code, message, requestId) =>
  res.status(status).json({ error: { code, message, requestId } });
const requestId = (req) => req.id || crypto.randomUUID();
const visibleText = (field, req, res, value) => {
  if (!containsProfanity(value)) return true;
  if (req.user?.userId) recordProfanityViolation(req.user.userId);
  error(res, 422, 'TEXT_NOT_ALLOWED', profanityMessage, requestId(req));
  return false;
};
const parse = (schema, value, req, res) => {
  const result = schema.safeParse(value);
  if (!result.success) {
    error(
      res,
      400,
      'VALIDATION_ERROR',
      'Please check the submitted fields.',
      requestId(req),
    );
    return null;
  }
  return result.data;
};
const requireAuth = async (req, res, next) => {
  try {
    const token = req.cookies.eduquest_session;
    if (!token)
      return error(
        res,
        401,
        'UNAUTHENTICATED',
        'Please sign in to continue.',
        requestId(req),
      );
    const result = await pool.query(
      `SELECT u.user_id, u.role, u.full_name, u.email FROM sessions s JOIN users u ON u.user_id=s.user_id WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at > now()`,
      [sessionHash(token)],
    );
    if (!result.rowCount)
      return error(
        res,
        401,
        'UNAUTHENTICATED',
        'Please sign in to continue.',
        requestId(req),
      );
    req.user = {
      userId: result.rows[0].user_id,
      role: result.rows[0].role,
      fullName: result.rows[0].full_name,
      email: result.rows[0].email,
    };
    if (isProfanityCooldownActive(req.user.userId))
      return error(
        res,
        429,
        'TEXT_COOLDOWN',
        'Please wait before submitting more text.',
        requestId(req),
      );
    next();
  } catch (e) {
    next(e);
  }
};
const requireRole = (role) => (req, res, next) =>
  req.user?.role === role
    ? next()
    : error(
        res,
        403,
        'FORBIDDEN',
        'You do not have access to this function.',
        requestId(req),
      );
const issueSession = async (userId, res) => {
  const token = crypto.randomBytes(32).toString('base64url');
  await pool.query(
    `INSERT INTO sessions(user_id,token_hash,expires_at) VALUES($1,$2,now()+interval '8 hours')`,
    [userId, sessionHash(token)],
  );
  res.cookie('eduquest_session', token, {
    httpOnly: true,
    secure: cookieSecure,
    sameSite: 'strict',
    maxAge: 8 * 60 * 60 * 1000,
  });
};

const nameSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .refine(noProfanity(), { message: profanityMessage });
const registerSchema = z
  .object({
    email: z.string().email().max(254),
    password: z.string().min(8).max(200),
    fullName: nameSchema,
  })
  .strict();
const moduleSchema = z
  .object({
    moduleCode: z.string().trim().min(1).max(30),
    moduleName: nameSchema,
  })
  .strict();
const groupSchema = z.object({ groupName: nameSchema }).strict();
const titleSchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .refine(noProfanity(), { message: profanityMessage });

app.get('/health', async (_req, res) => {
  const result = await pool.query('SELECT 1 AS ok');
  res.json({ ok: result.rows[0].ok === 1 });
});
app.post('/api/v1/auth/register', async (req, res, next) => {
  try {
    const data = parse(registerSchema, req.body, req, res);
    if (!data) return;
    if (!visibleText('fullName', req, res, data.fullName)) return;
    const hash = await bcrypt.hash(data.password, 12);
    const result = await pool.query(
      `INSERT INTO users(email,password_hash,role,full_name) VALUES($1,$2,'student',$3) RETURNING user_id,role,full_name,email`,
      [data.email.toLowerCase(), hash, data.fullName],
    );
    await issueSession(result.rows[0].user_id, res);
    res.status(201).json({ user: result.rows[0] });
  } catch (e) {
    if (e.code === '23505')
      return error(
        res,
        409,
        'EMAIL_EXISTS',
        'An account with that email already exists.',
        requestId(req),
      );
    next(e);
  }
});
app.post('/api/v1/auth/login', async (req, res, next) => {
  try {
    const data = parse(
      z.object({ email: z.string().email(), password: z.string() }).strict(),
      req.body,
      req,
      res,
    );
    if (!data) return;
    const result = await pool.query('SELECT * FROM users WHERE email=$1', [
      data.email.toLowerCase(),
    ]);
    if (
      !result.rowCount ||
      !(await bcrypt.compare(data.password, result.rows[0].password_hash))
    )
      return error(
        res,
        401,
        'INVALID_LOGIN',
        'Email or password is incorrect.',
        requestId(req),
      );
    await issueSession(result.rows[0].user_id, res);
    res.json({
      user: {
        user_id: result.rows[0].user_id,
        role: result.rows[0].role,
        full_name: result.rows[0].full_name,
        email: result.rows[0].email,
      },
    });
  } catch (e) {
    next(e);
  }
});
app.post('/api/v1/auth/logout', requireAuth, async (req, res, next) => {
  try {
    await pool.query(
      'UPDATE sessions SET revoked_at=now() WHERE token_hash=$1',
      [sessionHash(req.cookies.eduquest_session)],
    );
    res.clearCookie('eduquest_session');
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});
app.get('/api/v1/auth/me', requireAuth, (req, res) =>
  res.json({ user: req.user }),
);

app.get('/api/v1/modules', requireAuth, async (req, res, next) => {
  try {
    const result =
      req.user.role === 'lecturer'
        ? await pool.query(
            'SELECT * FROM modules WHERE lecturer_id=$1 ORDER BY module_code',
            [req.user.userId],
          )
        : await pool.query(
            'SELECT m.* FROM modules m JOIN enrollments e ON e.module_id=m.module_id WHERE e.student_id=$1 ORDER BY m.module_code',
            [req.user.userId],
          );
    res.json({ data: result.rows });
  } catch (e) {
    next(e);
  }
});
app.post(
  '/api/v1/modules',
  requireAuth,
  requireRole('lecturer'),
  async (req, res, next) => {
    try {
      const data = parse(moduleSchema, req.body, req, res);
      if (!data || !visibleText('moduleName', req, res, data.moduleName))
        return;
      const joinCode = crypto.randomBytes(12).toString('base64url');
      const result = await pool.query(
        `INSERT INTO modules(lecturer_id,module_code,module_name,join_code) VALUES($1,$2,$3,$4) RETURNING *`,
        [req.user.userId, data.moduleCode, data.moduleName, joinCode],
      );
      res.status(201).json({ module: result.rows[0] });
    } catch (e) {
      next(e);
    }
  },
);
app.post('/api/v1/enrollments', requireAuth, async (req, res, next) => {
  try {
    if (req.user.role !== 'student')
      return error(res, 403, 'FORBIDDEN', 'Students only.', requestId(req));
    const data = parse(
      z.object({ joinCode: z.string().min(12) }).strict(),
      req.body,
      req,
      res,
    );
    if (!data) return;
    const module = await pool.query(
      'SELECT module_id FROM modules WHERE join_code=$1',
      [data.joinCode],
    );
    if (!module.rowCount)
      return error(res, 404, 'NOT_FOUND', 'Module not found.', requestId(req));
    await pool.query(
      'INSERT INTO enrollments(student_id,module_id) VALUES($1,$2) ON CONFLICT DO NOTHING',
      [req.user.userId, module.rows[0].module_id],
    );
    res.status(201).json({ enrolled: true });
  } catch (e) {
    next(e);
  }
});
app.post(
  '/api/v1/modules/:moduleId/groups',
  requireAuth,
  async (req, res, next) => {
    try {
      const data = parse(groupSchema, req.body, req, res);
      if (!data || !visibleText('groupName', req, res, data.groupName)) return;
      const mod = await pool.query(
        'SELECT module_id FROM modules WHERE module_id=$1',
        [req.params.moduleId],
      );
      if (!mod.rowCount)
        return error(
          res,
          404,
          'NOT_FOUND',
          'Module not found.',
          requestId(req),
        );
      if (req.user.role !== 'lecturer')
        await pool.query(
          'INSERT INTO enrollments(student_id,module_id) VALUES($1,$2) ON CONFLICT DO NOTHING',
          [req.user.userId, req.params.moduleId],
        );
      const group = await pool.query(
        'INSERT INTO study_groups(module_id,created_by,group_name) VALUES($1,$2,$3) RETURNING *',
        [req.params.moduleId, req.user.userId, data.groupName],
      );
      if (req.user.role === 'student')
        await pool.query(
          'INSERT INTO group_members(group_id,student_id) VALUES($1,$2)',
          [group.rows[0].group_id, req.user.userId],
        );
      res.status(201).json({ group: group.rows[0] });
    } catch (e) {
      next(e);
    }
  },
);
app.post(
  '/api/v1/groups/:groupId/join',
  requireAuth,
  async (req, res, next) => {
    try {
      const group = await pool.query(
        'SELECT module_id FROM study_groups WHERE group_id=$1',
        [req.params.groupId],
      );
      if (!group.rowCount)
        return error(
          res,
          404,
          'NOT_FOUND',
          'Study group not found.',
          requestId(req),
        );
      await pool.query(
        'INSERT INTO group_members(group_id,student_id) VALUES($1,$2)',
        [req.params.groupId, req.user.userId],
      );
      res.status(201).json({ joined: true });
    } catch (e) {
      next(e);
    }
  },
);

app.post(
  '/api/v1/modules/:moduleId/resources',
  requireAuth,
  requireRole('lecturer'),
  upload.single('file'),
  async (req, res, next) => {
    try {
      if (!req.file)
        return error(
          res,
          400,
          'FILE_REQUIRED',
          'Please choose a file.',
          requestId(req),
        );
      const title = String(req.body.title || '').trim();
      if (!title || !visibleText('resourceTitle', req, res, title)) return;
      const result = await pool.query(
        `INSERT INTO resources(uploaded_by,module_id,title,resource_type,file_location,file_size_bytes) VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,
        [
          req.user.userId,
          req.params.moduleId,
          title,
          req.file.mimetype,
          req.file.path,
          req.file.size,
        ],
      );
      res.status(201).json({ resource: result.rows[0] });
    } catch (e) {
      next(e);
    }
  },
);

app.post(
  '/api/v1/quizzes',
  requireAuth,
  requireRole('lecturer'),
  async (req, res, next) => {
    try {
      const schema = z
        .object({
          moduleId: z.string().uuid(),
          title: titleSchema,
          isCompetitive: z.boolean().default(false),
          closesAt: z.string().datetime().nullable().optional(),
          questions: z
            .array(
              z
                .object({
                  questionText: z
                    .string()
                    .min(1)
                    .refine(noProfanity(), { message: profanityMessage }),
                  marks: z.number().positive(),
                  topicId: z.string().uuid().nullable().optional(),
                  options: z
                    .array(
                      z
                        .object({
                          optionText: z.string().min(1).refine(noProfanity(), {
                            message: profanityMessage,
                          }),
                          isCorrect: z.boolean(),
                        })
                        .strict(),
                    )
                    .min(2)
                    .max(6),
                })
                .strict(),
            )
            .min(1),
        })
        .strict();
      const data = parse(schema, req.body, req, res);
      if (!data || !visibleText('quizTitle', req, res, data.title)) return;
      for (const question of data.questions) {
        if (!visibleText('questionText', req, res, question.questionText))
          return;
        for (const option of question.options)
          if (!visibleText('optionText', req, res, option.optionText)) return;
      }
      const tx = await pool.connect();
      try {
        await tx.query('BEGIN');
        const quiz = await tx.query(
          `INSERT INTO quizzes(module_id,created_by,title,is_competitive,max_scored_attempts,status,closes_at) VALUES($1,$2,$3,$4,$5,'published',$6) RETURNING *`,
          [
            data.moduleId,
            req.user.userId,
            data.title,
            data.isCompetitive,
            data.isCompetitive ? 1 : 1,
            data.closesAt || null,
          ],
        );
        for (const question of data.questions) {
          const q = await tx.query(
            `INSERT INTO questions(quiz_id,topic_id,question_text,marks) VALUES($1,$2,$3,$4) RETURNING question_id`,
            [
              quiz.rows[0].quiz_id,
              question.topicId || null,
              question.questionText,
              question.marks,
            ],
          );
          for (const option of question.options)
            await tx.query(
              `INSERT INTO question_options(question_id,option_text,is_correct) VALUES($1,$2,$3)`,
              [q.rows[0].question_id, option.optionText, option.isCorrect],
            );
        }
        await tx.query('COMMIT');
        res.status(201).json({ quiz: quiz.rows[0] });
      } catch (e) {
        await tx.query('ROLLBACK');
        throw e;
      } finally {
        tx.release();
      }
    } catch (e) {
      next(e);
    }
  },
);

app.post(
  '/api/v1/quizzes/:quizId/attempts',
  requireAuth,
  async (req, res, next) => {
    try {
      const quiz = await pool.query(
        "SELECT * FROM quizzes WHERE quiz_id=$1 AND status='published'",
        [req.params.quizId],
      );
      if (!quiz.rowCount)
        return error(res, 404, 'NOT_FOUND', 'Quiz not found.', requestId(req));
      if (
        quiz.rows[0].closes_at &&
        new Date(quiz.rows[0].closes_at) < new Date()
      )
        return error(
          res,
          409,
          'QUIZ_CLOSED',
          'This quiz is closed.',
          requestId(req),
        );
      if (req.user.role !== 'student')
        return error(res, 403, 'FORBIDDEN', 'Students only.', requestId(req));
      const enrolled = await pool.query(
        'SELECT 1 FROM enrollments WHERE student_id=$1 AND module_id=$2',
        [req.user.userId, quiz.rows[0].module_id],
      );
      if (!enrolled.rowCount)
        return error(
          res,
          403,
          'FORBIDDEN',
          'You are not enrolled in this module.',
          requestId(req),
        );
      const existing = await pool.query(
        'SELECT * FROM quiz_attempts WHERE quiz_id=$1 AND student_id=$2 AND ((is_scored) OR completion_time IS NULL) ORDER BY start_time LIMIT 1',
        [req.params.quizId, req.user.userId],
      );
      if (existing.rowCount)
        return res.status(409).json({
          error: {
            code: 'ATTEMPT_EXISTS',
            message: 'You already have an attempt for this quiz.',
            requestId: requestId(req),
          },
          attempt: existing.rows[0],
        });
      const attempt = await pool.query(
        'INSERT INTO quiz_attempts(quiz_id,student_id) VALUES($1,$2) RETURNING attempt_id,start_time',
        [req.params.quizId, req.user.userId],
      );
      const questions = await pool.query(
        "SELECT q.question_id,q.question_text,q.marks,q.topic_id,json_agg(json_build_object('optionId',o.option_id,'optionText',o.option_text)) options FROM questions q JOIN question_options o ON o.question_id=q.question_id WHERE q.quiz_id=$1 GROUP BY q.question_id ORDER BY q.question_id",
        [req.params.quizId],
      );
      res.status(201).json({
        attempt: attempt.rows[0],
        quiz: quiz.rows[0],
        questions: questions.rows,
      });
    } catch (e) {
      next(e);
    }
  },
);

app.post(
  '/api/v1/attempts/:attemptId/submit',
  requireAuth,
  async (req, res, next) => {
    const tx = await pool.connect();
    try {
      await tx.query('BEGIN');
      const attempt = await tx.query(
        `SELECT a.*,q.is_competitive,q.closes_at FROM quiz_attempts a JOIN quizzes q ON q.quiz_id=a.quiz_id WHERE a.attempt_id=$1 AND a.student_id=$2 FOR UPDATE`,
        [req.params.attemptId, req.user.userId],
      );
      if (!attempt.rowCount) {
        await tx.query('ROLLBACK');
        return error(
          res,
          404,
          'NOT_FOUND',
          'Attempt not found.',
          requestId(req),
        );
      }
      if (attempt.rows[0].completion_time) {
        await tx.query('ROLLBACK');
        return res.json({
          score: attempt.rows[0].score,
          alreadySubmitted: true,
        });
      }
      if (
        attempt.rows[0].closes_at &&
        new Date(attempt.rows[0].closes_at) < new Date()
      ) {
        await tx.query('ROLLBACK');
        return error(
          res,
          409,
          'QUIZ_CLOSED',
          'This quiz is closed.',
          requestId(req),
        );
      }
      const data = parse(
        z
          .object({
            answers: z.array(
              z
                .object({
                  questionId: z.string().uuid(),
                  optionId: z.string().uuid(),
                })
                .strict(),
            ),
          })
          .strict(),
        req.body,
        req,
        res,
      );
      if (!data) {
        await tx.query('ROLLBACK');
        return;
      }
      const answers = new Set();
      let score = 0;
      for (const answer of data.answers) {
        if (answers.has(answer.questionId)) {
          await tx.query('ROLLBACK');
          return error(
            res,
            400,
            'DUPLICATE_ANSWER',
            'Each question may be answered once.',
            requestId(req),
          );
        }
        answers.add(answer.questionId);
        const row = await tx.query(
          `SELECT q.question_id,q.marks,o.option_id,o.is_correct FROM questions q JOIN question_options o ON o.question_id=q.question_id WHERE q.quiz_id=$1 AND q.question_id=$2 AND o.option_id=$3`,
          [attempt.rows[0].quiz_id, answer.questionId, answer.optionId],
        );
        if (!row.rowCount) {
          await tx.query('ROLLBACK');
          return error(
            res,
            400,
            'INVALID_ANSWER',
            'One or more answers are invalid.',
            requestId(req),
          );
        }
        if (row.rows[0].is_correct) score += Number(row.rows[0].marks);
        await tx.query(
          'INSERT INTO student_answers(attempt_id,question_id,option_id,is_correct) VALUES($1,$2,$3,$4)',
          [
            req.params.attemptId,
            answer.questionId,
            answer.optionId,
            row.rows[0].is_correct,
          ],
        );
      }
      const count = await tx.query(
        'SELECT count(*)::int AS total FROM questions WHERE quiz_id=$1',
        [attempt.rows[0].quiz_id],
      );
      const completed = await tx.query(
        'UPDATE quiz_attempts SET score=$1,completion_time=now(),is_scored=$2 WHERE attempt_id=$3 RETURNING *',
        [score, attempt.rows[0].is_competitive, req.params.attemptId],
      );
      await tx.query('COMMIT');
      res.json({
        result: completed.rows[0],
        unansweredCount: count.rows[0].total - answers.size,
      });
    } catch (e) {
      await tx.query('ROLLBACK');
      next(e);
    } finally {
      tx.release();
    }
  },
);

app.get(
  '/api/v1/modules/:moduleId/leaderboard',
  requireAuth,
  async (req, res, next) => {
    try {
      const result = await pool.query(
        `SELECT a.student_id,u.full_name,a.score,a.completion_time,rank() over(order by a.score desc,a.completion_time asc) AS rank FROM quiz_attempts a JOIN quizzes q ON q.quiz_id=a.quiz_id JOIN users u ON u.user_id=a.student_id WHERE q.module_id=$1 AND a.is_scored=true AND a.completion_time IS NOT NULL ORDER BY rank,a.completion_time`,
        [req.params.moduleId],
      );
      res.json({ data: result.rows });
    } catch (e) {
      next(e);
    }
  },
);
app.get(
  '/api/v1/modules/:moduleId/analytics',
  requireAuth,
  requireRole('lecturer'),
  async (req, res, next) => {
    try {
      const owned = await pool.query(
        'SELECT 1 FROM modules WHERE module_id=$1 AND lecturer_id=$2',
        [req.params.moduleId, req.user.userId],
      );
      if (!owned.rowCount)
        return error(
          res,
          403,
          'FORBIDDEN',
          'You do not manage this module.',
          requestId(req),
        );
      const topics = await pool.query(
        `SELECT t.topic_id,t.name,CASE WHEN count(sa.answer_id)=0 THEN NULL ELSE round(100.0*sum(CASE WHEN sa.is_correct THEN 1 ELSE 0 END)/count(sa.answer_id),2) END AS correctness_percentage FROM topics t LEFT JOIN questions q ON q.topic_id=t.topic_id LEFT JOIN student_answers sa ON sa.question_id=q.question_id JOIN quizzes z ON z.quiz_id=q.quiz_id AND z.module_id=t.module_id WHERE t.module_id=$1 GROUP BY t.topic_id,t.name ORDER BY correctness_percentage NULLS FIRST`,
        [req.params.moduleId],
      );
      res.json({ weakTopics: topics.rows });
    } catch (e) {
      next(e);
    }
  },
);

app.use((err, req, res, _next) => {
  console.error(
    JSON.stringify({
      requestId: requestId(req),
      userId: req.user?.userId,
      code: err.code || 'INTERNAL_ERROR',
    }),
  );
  if (!res.headersSent)
    error(
      res,
      500,
      'INTERNAL_ERROR',
      'Something went wrong. Please try again.',
      requestId(req),
    );
});

export { app };
if (process.env.NODE_ENV !== 'test')
  app.listen(port, () => console.log(`EduQuest API listening on ${port}`));
