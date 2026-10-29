// @ts-nocheck
import 'dotenv/config';
import crypto from 'node:crypto';
import path from 'node:path';
import { mkdir, readFile, unlink } from 'node:fs/promises';
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
import { canAccessGame } from './games/access.js';
import { registerInfectedRoutes } from './games/infected/routes.js';
import { registerIslandEscapeRoutes } from './games/island_escape/routes.js';
import { registerMemoryMatchRoutes } from './games/memory_match/routes.js';
import { registerBossBattleRoutes } from './games/boss_battle/routes.js';
import { registerPixelRacerRoutes } from './games/pixel_racer/routes.js';
import { ISLAND_MIN_QUESTIONS } from './games/island_escape/config.js';
import { BOSS_MIN_QUESTIONS } from './games/boss_battle/config.js';
import { RACE_MIN_QUESTIONS } from './games/pixel_racer/config.js';

const app = express();
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
const allowedExtensions = new Set(['.pdf', '.docx', '.pptx', '.txt', '.md']);
const hasAllowedMagic = (extension, bytes) =>
  extension === '.pdf'
    ? bytes.subarray(0, 5).toString() === '%PDF-'
    : ['.docx', '.pptx'].includes(extension)
      ? bytes.subarray(0, 4).toString('hex') === '504b0304'
      : !bytes.subarray(0, 1024).includes(0);

app.use(helmet());
app.use(
  cors({
    origin: 'http://localhost:5173',
    credentials: true,
  }),
);
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(
  ['/api/v1/auth/login', '/api/v1/auth/register'],
  rateLimit({
    windowMs: 10 * 60 * 1000,
    limit: Number(process.env.AUTH_RATE_LIMIT || 30),
    standardHeaders: true,
    message: {
      error: {
        code: 'RATE_LIMITED',
        message: 'Too many sign-in attempts. Please wait and try again.',
      },
    },
  }),
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
    const hasProfanity = result.error.issues.some(
      (issue) => issue.message === profanityMessage,
    );
    error(
      res,
      hasProfanity ? 422 : 400,
      hasProfanity ? 'TEXT_NOT_ALLOWED' : 'VALIDATION_ERROR',
      hasProfanity ? profanityMessage : 'Please check the submitted fields.',
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
    if (!parse(z.object({}).strict(), req.body || {}, req, res)) return;
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
app.put('/api/v1/auth/me', requireAuth, async (req, res, next) => {
  try {
    const data = parse(
      z.object({ fullName: nameSchema }).strict(),
      req.body,
      req,
      res,
    );
    if (!data || !visibleText('fullName', req, res, data.fullName)) return;
    const result = await pool.query(
      'UPDATE users SET full_name=$1 WHERE user_id=$2 RETURNING user_id,role,full_name,email',
      [data.fullName, req.user.userId],
    );
    res.json({ user: result.rows[0] });
  } catch (e) {
    next(e);
  }
});

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
  requireRole('student'),
  async (req, res, next) => {
    try {
      if (!parse(z.object({}).strict(), req.body || {}, req, res)) return;
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

app.get(
  '/api/v1/modules/:moduleId/resources',
  requireAuth,
  async (req, res, next) => {
    try {
      const lecturer = await pool.query(
        'SELECT 1 FROM modules WHERE module_id=$1 AND lecturer_id=$2',
        [req.params.moduleId, req.user.userId],
      );
      if (!lecturer.rowCount && req.user.role === 'lecturer')
        return error(
          res,
          403,
          'FORBIDDEN',
          'You do not manage this module.',
          requestId(req),
        );
      if (!lecturer.rowCount && req.user.role === 'student') {
        const enrolled = await pool.query(
          'SELECT 1 FROM enrollments WHERE module_id=$1 AND student_id=$2',
          [req.params.moduleId, req.user.userId],
        );
        if (!enrolled.rowCount)
          return error(
            res,
            403,
            'FORBIDDEN',
            'You are not enrolled in this module.',
            requestId(req),
          );
      }
      const result = await pool.query(
        `SELECT DISTINCT r.* FROM resources r LEFT JOIN group_members gm ON gm.group_id=r.group_id AND gm.student_id=$2 WHERE r.module_id=$1 AND (r.group_id IS NULL OR gm.student_id IS NOT NULL OR EXISTS (SELECT 1 FROM modules m WHERE m.module_id=r.module_id AND m.lecturer_id=$2)) ORDER BY r.created_date DESC`,
        [req.params.moduleId, req.user.userId],
      );
      res.json({ data: result.rows });
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
      const extension = path.extname(req.file.originalname).toLowerCase();
      const bytes = await readFile(req.file.path);
      if (
        !allowedExtensions.has(extension) ||
        !hasAllowedMagic(extension, bytes)
      ) {
        await unlink(req.file.path).catch(() => {});
        return error(
          res,
          422,
          'FILE_TYPE_NOT_ALLOWED',
          'That file type is not allowed.',
          requestId(req),
        );
      }
      const title = String(req.body.title || '').trim();
      if (!title || !visibleText('resourceTitle', req, res, title)) return;
      const owner = await pool.query(
        'SELECT 1 FROM modules WHERE module_id=$1 AND lecturer_id=$2',
        [req.params.moduleId, req.user.userId],
      );
      if (!owner.rowCount) {
        await unlink(req.file.path).catch(() => {});
        return error(
          res,
          403,
          'FORBIDDEN',
          'You do not manage this module.',
          requestId(req),
        );
      }
      const groupId = req.body.groupId || null;
      const result = await pool.query(
        `INSERT INTO resources(uploaded_by,module_id,group_id,title,resource_type,file_location,file_size_bytes) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [
          req.user.userId,
          req.params.moduleId,
          groupId,
          title,
          extension.slice(1),
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
                  difficultyLevel: z.number().int().min(1).max(5),
                  explanation: z
                    .string()
                    .trim()
                    .min(1)
                    .max(300)
                    .refine(noProfanity(), { message: profanityMessage })
                    .nullable()
                    .optional(),
                  topicId: z.string().uuid().nullable().optional(),
                  topic: z
                    .string()
                    .min(1)
                    .max(200)
                    .refine(noProfanity(), { message: profanityMessage })
                    .optional(),
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
      const ownedModule = await pool.query(
        'SELECT 1 FROM modules WHERE module_id=$1 AND lecturer_id=$2',
        [data.moduleId, req.user.userId],
      );
      if (!ownedModule.rowCount)
        return error(
          res,
          403,
          'FORBIDDEN',
          'You do not manage this module.',
          requestId(req),
        );
      for (const question of data.questions) {
        if (!visibleText('questionText', req, res, question.questionText))
          return;
        if (
          question.topic &&
          !visibleText('topicName', req, res, question.topic)
        )
          return;
        for (const option of question.options)
          if (!visibleText('optionText', req, res, option.optionText)) return;
        if (
          question.explanation &&
          !visibleText('explanation', req, res, question.explanation)
        )
          return;
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
          let topicId = question.topicId || null;
          if (question.topic) {
            topicId = (
              await tx.query(
                `INSERT INTO topics(module_id,name) VALUES($1,$2) ON CONFLICT(module_id,name) DO UPDATE SET name=EXCLUDED.name RETURNING topic_id`,
                [data.moduleId, question.topic],
              )
            ).rows[0].topic_id;
          }
          const q = await tx.query(
            `INSERT INTO questions(quiz_id,topic_id,question_text,marks,difficulty_level,explanation) VALUES($1,$2,$3,$4,$5,$6) RETURNING question_id`,
            [
              quiz.rows[0].quiz_id,
              topicId,
              question.questionText,
              question.marks,
              question.difficultyLevel,
              question.explanation || null,
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

app.get(
  '/api/v1/modules/:moduleId/quizzes',
  requireAuth,
  async (req, res, next) => {
    try {
      const owner = await pool.query(
        'SELECT 1 FROM modules WHERE module_id=$1 AND lecturer_id=$2',
        [req.params.moduleId, req.user.userId],
      );
      if (!owner.rowCount && req.user.role === 'lecturer')
        return error(
          res,
          403,
          'FORBIDDEN',
          'You do not manage this module.',
          requestId(req),
        );
      if (!owner.rowCount && req.user.role === 'student') {
        const enrolled = await pool.query(
          'SELECT 1 FROM enrollments WHERE module_id=$1 AND student_id=$2',
          [req.params.moduleId, req.user.userId],
        );
        if (!enrolled.rowCount)
          return error(
            res,
            403,
            'FORBIDDEN',
            'You are not enrolled in this module.',
            requestId(req),
          );
      }
      const result = await pool.query(
        "SELECT quiz_id,title,is_competitive,closes_at,status FROM quizzes WHERE module_id=$1 AND status='published' ORDER BY title",
        [req.params.moduleId],
      );
      res.json({ data: result.rows });
    } catch (e) {
      next(e);
    }
  },
);

app.post(
  '/api/v1/resources/:resourceId/generation-jobs',
  requireAuth,
  requireRole('lecturer'),
  async (req, res, next) => {
    try {
      const resource = await pool.query(
        'SELECT resource_id FROM resources r JOIN modules m ON m.module_id=r.module_id WHERE r.resource_id=$1 AND m.lecturer_id=$2',
        [req.params.resourceId, req.user.userId],
      );
      if (!resource.rowCount)
        return error(
          res,
          404,
          'NOT_FOUND',
          'Resource not found.',
          requestId(req),
        );
      const options = parse(
        z
          .object({
            questionCount: z.number().int().min(1).max(50).default(5),
            difficulty: z.string().trim().min(1).max(40).default('mixed'),
          })
          .strict(),
        req.body || {},
        req,
        res,
      );
      if (!options) return;
      const job = await pool.query(
        `INSERT INTO ai_generation_jobs(requested_by,resource_id,question_count,difficulty) VALUES($1,$2,$3,$4) RETURNING *`,
        [
          req.user.userId,
          req.params.resourceId,
          options.questionCount,
          options.difficulty,
        ],
      );
      res.status(202).json({ job: job.rows[0] });
    } catch (e) {
      next(e);
    }
  },
);

app.get(
  '/api/v1/quizzes/:quizId',
  requireAuth,
  requireRole('lecturer'),
  async (req, res, next) => {
    try {
      const result = await pool.query(
        `SELECT z.*, json_agg(json_build_object('questionId',q.question_id,'questionText',q.question_text,'marks',q.marks,'difficultyLevel',q.difficulty_level,'explanation',q.explanation,'topic',t.name,'options',(SELECT json_agg(json_build_object('optionId',o.option_id,'optionText',o.option_text)) FROM question_options o WHERE o.question_id=q.question_id))) FILTER (WHERE q.question_id IS NOT NULL) AS questions FROM quizzes z LEFT JOIN questions q ON q.quiz_id=z.quiz_id LEFT JOIN topics t ON t.topic_id=q.topic_id JOIN modules m ON m.module_id=z.module_id WHERE z.quiz_id=$1 AND m.lecturer_id=$2 GROUP BY z.quiz_id`,
        [req.params.quizId, req.user.userId],
      );
      if (!result.rowCount)
        return error(res, 404, 'NOT_FOUND', 'Quiz not found.', requestId(req));
      res.json({ quiz: result.rows[0] });
    } catch (e) {
      next(e);
    }
  },
);

app.put(
  '/api/v1/quizzes/:quizId',
  requireAuth,
  requireRole('lecturer'),
  async (req, res, next) => {
    try {
      const schema = z
        .object({
          title: titleSchema,
          isCompetitive: z.boolean(),
          closesAt: z.string().datetime().nullable().optional(),
          status: z.enum(['draft', 'published']),
          questions: z
            .array(
              z
                .object({
                  questionId: z.string().uuid(),
                  difficultyLevel: z.number().int().min(1).max(5),
                  explanation: z
                    .string()
                    .trim()
                    .min(1)
                    .max(300)
                    .refine(noProfanity(), { message: profanityMessage }),
                })
                .strict(),
            )
            .optional(),
        })
        .strict();
      const data = parse(schema, req.body, req, res);
      if (!data) return;
      if (!visibleText('quizTitle', req, res, data.title)) return;
      for (const question of data.questions || [])
        if (!visibleText('explanation', req, res, question.explanation)) return;
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await client.query(
          `UPDATE quizzes z SET title=$1,is_competitive=$2,closes_at=$3,status=$4 FROM modules m WHERE z.quiz_id=$5 AND m.module_id=z.module_id AND m.lecturer_id=$6 RETURNING z.*`,
          [
            data.title,
            data.isCompetitive,
            data.closesAt || null,
            data.status,
            req.params.quizId,
            req.user.userId,
          ],
        );
        if (!result.rowCount) {
          await client.query('ROLLBACK');
          return error(
            res,
            404,
            'NOT_FOUND',
            'Quiz not found.',
            requestId(req),
          );
        }
        for (const question of data.questions || []) {
          const updated = await client.query(
            `UPDATE questions SET difficulty_level=$1,explanation=$2
             WHERE question_id=$3 AND quiz_id=$4 RETURNING question_id`,
            [
              question.difficultyLevel,
              question.explanation,
              question.questionId,
              req.params.quizId,
            ],
          );
          if (!updated.rowCount) throw new Error('QUIZ_QUESTION_NOT_FOUND');
        }
        await client.query('COMMIT');
        res.json({ quiz: result.rows[0] });
      } catch (caught) {
        await client.query('ROLLBACK').catch(() => {});
        throw caught;
      } finally {
        client.release();
      }
    } catch (e) {
      next(e);
    }
  },
);

app.get(
  '/api/v1/ai-generation-jobs/:jobId',
  requireAuth,
  async (req, res, next) => {
    try {
      const result = await pool.query(
        'SELECT * FROM ai_generation_jobs WHERE job_id=$1 AND requested_by=$2',
        [req.params.jobId, req.user.userId],
      );
      if (!result.rowCount)
        return error(
          res,
          404,
          'NOT_FOUND',
          'Generation job not found.',
          requestId(req),
        );
      res.json({ job: result.rows[0] });
    } catch (e) {
      next(e);
    }
  },
);

app.post(
  '/api/v1/quizzes/:quizId/attempts',
  requireAuth,
  async (req, res, next) => {
    const requestData = parse(z.object({}).strict(), req.body || {}, req, res);
    if (!requestData) return;
    const tx = await pool.connect();
    try {
      await tx.query('BEGIN');
      await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        `${req.params.quizId}:${req.user.userId}`,
      ]);
      const quiz = await tx.query(
        "SELECT * FROM quizzes WHERE quiz_id=$1 AND status='published' FOR SHARE",
        [req.params.quizId],
      );
      if (!quiz.rowCount) {
        await tx.query('ROLLBACK');
        return error(res, 404, 'NOT_FOUND', 'Quiz not found.', requestId(req));
      }
      if (
        quiz.rows[0].closes_at &&
        new Date(quiz.rows[0].closes_at) < new Date()
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
      if (req.user.role !== 'student') {
        await tx.query('ROLLBACK');
        return error(res, 403, 'FORBIDDEN', 'Students only.', requestId(req));
      }
      const enrolled = await tx.query(
        'SELECT 1 FROM enrollments WHERE student_id=$1 AND module_id=$2',
        [req.user.userId, quiz.rows[0].module_id],
      );
      if (!enrolled.rowCount) {
        await tx.query('ROLLBACK');
        return error(
          res,
          403,
          'FORBIDDEN',
          'You are not enrolled in this module.',
          requestId(req),
        );
      }
      const existing = await tx.query(
        'SELECT * FROM quiz_attempts WHERE quiz_id=$1 AND student_id=$2 AND ((is_scored) OR completion_time IS NULL) ORDER BY start_time LIMIT 1',
        [req.params.quizId, req.user.userId],
      );
      if (existing.rowCount) {
        await tx.query('ROLLBACK');
        return res.status(409).json({
          error: {
            code: 'ATTEMPT_EXISTS',
            message: 'You already have an attempt for this quiz.',
            requestId: requestId(req),
          },
          attempt: existing.rows[0],
        });
      }
      const attempt = await tx.query(
        'INSERT INTO quiz_attempts(quiz_id,student_id) VALUES($1,$2) RETURNING attempt_id,start_time',
        [req.params.quizId, req.user.userId],
      );
      const questions = await tx.query(
        "SELECT q.question_id,q.question_text,q.marks,q.topic_id,json_agg(json_build_object('optionId',o.option_id,'optionText',o.option_text)) options FROM questions q JOIN question_options o ON o.question_id=q.question_id WHERE q.quiz_id=$1 GROUP BY q.question_id ORDER BY q.question_id",
        [req.params.quizId],
      );
      await tx.query('COMMIT');
      res.status(201).json({
        attempt: attempt.rows[0],
        quiz: quiz.rows[0],
        questions: questions.rows,
      });
    } catch (e) {
      await tx.query('ROLLBACK').catch(() => {});
      next(e);
    } finally {
      tx.release();
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
      const ownership = await pool.query(
        'SELECT 1 FROM modules WHERE module_id=$1 AND lecturer_id=$2',
        [req.params.moduleId, req.user.userId],
      );
      if (req.user.role === 'lecturer' && !ownership.rowCount)
        return error(
          res,
          403,
          'FORBIDDEN',
          'You do not manage this module.',
          requestId(req),
        );
      if (req.user.role === 'student') {
        const enrolled = await pool.query(
          'SELECT 1 FROM enrollments WHERE module_id=$1 AND student_id=$2',
          [req.params.moduleId, req.user.userId],
        );
        if (!enrolled.rowCount)
          return error(
            res,
            403,
            'FORBIDDEN',
            'You are not enrolled in this module.',
            requestId(req),
          );
      }
      const groupId = req.query.groupId || null;
      if (groupId) {
        const group = await pool.query(
          'SELECT 1 FROM study_groups WHERE group_id=$1 AND module_id=$2',
          [groupId, req.params.moduleId],
        );
        if (!group.rowCount)
          return error(
            res,
            400,
            'VALIDATION_ERROR',
            'Please check the submitted fields.',
            requestId(req),
          );
        if (req.user.role === 'student') {
          const member = await pool.query(
            'SELECT 1 FROM group_members WHERE group_id=$1 AND student_id=$2',
            [groupId, req.user.userId],
          );
          if (!member.rowCount)
            return error(
              res,
              403,
              'FORBIDDEN',
              'You are not in this study group.',
              requestId(req),
            );
        }
      }
      const result = await pool.query(
        `SELECT a.student_id,u.full_name,a.score,a.completion_time,rank() over(order by a.score desc,a.completion_time asc) AS rank FROM quiz_attempts a JOIN quizzes q ON q.quiz_id=a.quiz_id JOIN users u ON u.user_id=a.student_id ${groupId ? 'JOIN group_members gm ON gm.student_id=a.student_id AND gm.group_id=$2' : ''} WHERE q.module_id=$1 AND a.is_scored=true AND a.completion_time IS NOT NULL ORDER BY rank,a.completion_time`,
        groupId ? [req.params.moduleId, groupId] : [req.params.moduleId],
      );
      res.json({ data: result.rows });
    } catch (e) {
      next(e);
    }
  },
);

app.get(
  '/api/v1/me/analytics',
  requireAuth,
  requireRole('student'),
  async (req, res, next) => {
    try {
      const result = await pool.query(
        `SELECT t.topic_id,t.name,CASE WHEN count(sa.answer_id)=0 THEN NULL ELSE round(100.0*sum(CASE WHEN sa.is_correct THEN 1 ELSE 0 END)/count(sa.answer_id),2) END AS correctness_percentage FROM topics t LEFT JOIN questions q ON q.topic_id=t.topic_id LEFT JOIN quizzes z ON z.quiz_id=q.quiz_id LEFT JOIN quiz_attempts a ON a.quiz_id=z.quiz_id AND a.student_id=$1 AND a.is_scored=true AND a.completion_time IS NOT NULL LEFT JOIN student_answers sa ON sa.question_id=q.question_id AND sa.attempt_id=a.attempt_id GROUP BY t.topic_id,t.name ORDER BY t.name`,
        [req.user.userId],
      );
      res.json({ data: result.rows });
    } catch (e) {
      next(e);
    }
  },
);

app.get(
  '/api/v1/modules/:moduleId/groups/:groupId/analytics',
  requireAuth,
  requireRole('lecturer'),
  async (req, res, next) => {
    try {
      const owned = await pool.query(
        'SELECT 1 FROM study_groups g JOIN modules m ON m.module_id=g.module_id WHERE g.group_id=$1 AND g.module_id=$2 AND m.lecturer_id=$3',
        [req.params.groupId, req.params.moduleId, req.user.userId],
      );
      if (!owned.rowCount)
        return error(
          res,
          403,
          'FORBIDDEN',
          'You do not manage this group.',
          requestId(req),
        );
      const result = await pool.query(
        `SELECT round(avg(a.score),2) AS average_score,count(DISTINCT a.student_id)::int AS students FROM quiz_attempts a JOIN quizzes q ON q.quiz_id=a.quiz_id JOIN group_members gm ON gm.student_id=a.student_id AND gm.group_id=$1 WHERE q.module_id=$2 AND a.is_scored=true AND a.completion_time IS NOT NULL`,
        [req.params.groupId, req.params.moduleId],
      );
      res.json({ data: result.rows[0] });
    } catch (e) {
      next(e);
    }
  },
);

app.get(
  '/api/v1/quizzes/:quizId/games',
  requireAuth,
  async (req, res, next) => {
    try {
      const quiz = await pool.query('SELECT * FROM quizzes WHERE quiz_id=$1', [
        req.params.quizId,
      ]);
      if (!quiz.rowCount)
        return error(res, 404, 'NOT_FOUND', 'Quiz not found.', requestId(req));
      const owner = await pool.query(
        'SELECT 1 FROM modules WHERE module_id=$1 AND lecturer_id=$2',
        [quiz.rows[0].module_id, req.user.userId],
      );
      let scoredAttemptCompleted = false;
      if (req.user.role === 'student') {
        const enrolled = await pool.query(
          'SELECT 1 FROM enrollments WHERE module_id=$1 AND student_id=$2',
          [quiz.rows[0].module_id, req.user.userId],
        );
        if (!enrolled.rowCount)
          return error(
            res,
            403,
            'FORBIDDEN',
            'You are not enrolled in this module.',
            requestId(req),
          );
        const scored = await pool.query(
          'SELECT 1 FROM quiz_attempts WHERE quiz_id=$1 AND student_id=$2 AND is_scored=true AND completion_time IS NOT NULL',
          [req.params.quizId, req.user.userId],
        );
        scoredAttemptCompleted = Boolean(scored.rowCount);
      } else if (!owner.rowCount) {
        return error(
          res,
          403,
          'FORBIDDEN',
          'You do not manage this quiz.',
          requestId(req),
        );
      }
      const accessAllowed = canAccessGame(req.user, quiz.rows[0], {
        scoredAttemptCompleted,
      });
      const games = await pool.query(
        `SELECT g.game_id,gt.key,gt.display_name,
                count(q.question_id)::int AS question_count,
                count(q.question_id) FILTER (
                  WHERE EXISTS (
                    SELECT 1 FROM question_options correct
                    WHERE correct.question_id=q.question_id
                      AND correct.is_correct=true
                  )
                  AND (SELECT count(*) FROM question_options options
                       WHERE options.question_id=q.question_id) >= 2
                )::int AS eligible_question_count
         FROM games g JOIN game_types gt ON gt.game_type_id=g.game_type_id
         LEFT JOIN questions q ON q.quiz_id=g.quiz_id
         WHERE g.quiz_id=$1 AND gt.is_enabled=true
         GROUP BY g.game_id,gt.key,gt.display_name
         ORDER BY CASE gt.key
           WHEN 'infected' THEN 1
           WHEN 'island_escape' THEN 2
           WHEN 'memory_match' THEN 3
           WHEN 'boss_battle' THEN 4
           ELSE 100
         END, gt.key`,
        [req.params.quizId],
      );
      res.json({
        data: games.rows.map((game) => {
          const minimum =
            game.key === 'island_escape'
              ? ISLAND_MIN_QUESTIONS
              : game.key === 'boss_battle'
                ? BOSS_MIN_QUESTIONS
                : game.key === 'pixel_racer'
                  ? RACE_MIN_QUESTIONS
                  : Number(process.env.GAME_MIN_QUESTIONS || 6);
          const availableQuestionCount =
            game.key === 'boss_battle' || game.key === 'pixel_racer'
              ? game.eligible_question_count
              : game.question_count;
          const enoughQuestions = availableQuestionCount >= minimum;
          return {
            ...game,
            available: accessAllowed && enoughQuestions,
            reason: !accessAllowed
              ? 'Complete your scored attempt to unlock this game.'
              : !enoughQuestions
                ? game.key === 'island_escape'
                  ? `Needs a quiz with at least ${minimum} questions.`
                  : game.key === 'boss_battle'
                    ? `Boss Battle needs at least ${minimum} eligible questions.`
                    : game.key === 'pixel_racer'
                      ? `Pixel Car Racer needs at least ${minimum} eligible questions.`
                      : `Not enough questions for this game yet. At least ${minimum} are required.`
                : null,
          };
        }),
      });
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

app.get(
  '/api/v1/modules/:moduleId/games/activity',
  requireAuth,
  requireRole('lecturer'),
  async (req, res, next) => {
    try {
      const valid = parse(z.object({}).strict(), req.body || {}, req, res);
      if (!valid) return;
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
      const activity = await pool.query(
        `SELECT gt.key,gt.display_name,
                count(p.play_id)::int AS plays,
                count(p.play_id) FILTER (WHERE p.status<>'in_progress')::int AS completions
         FROM game_types gt
         LEFT JOIN game_plays p ON p.game_type_id=gt.game_type_id
           AND p.quiz_id IN (SELECT quiz_id FROM quizzes WHERE module_id=$1)
         WHERE gt.key<>'infected'
         GROUP BY gt.game_type_id,gt.key,gt.display_name
         ORDER BY gt.key`,
        [req.params.moduleId],
      );
      res.json({ data: activity.rows });
    } catch (caught) {
      next(caught);
    }
  },
);

registerInfectedRoutes({
  app,
  pool,
  requireAuth,
  requireRole,
  error,
  requestId,
});

registerIslandEscapeRoutes({
  app,
  pool,
  requireAuth,
  error,
  requestId,
});

registerMemoryMatchRoutes({ app, pool, requireAuth, error, requestId });
registerBossBattleRoutes({ app, pool, requireAuth, error, requestId });
registerPixelRacerRoutes({ app, pool, requireAuth, error, requestId });

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
