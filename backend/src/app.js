// @ts-nocheck
import 'dotenv/config';
import crypto from 'node:crypto';
import path from 'node:path';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import QRCode from 'qrcode';
import { z } from 'zod';
import {
  emailSchema,
  normalizePersonName,
  passwordIsAllowed,
  passwordSchema,
  personNameSchema,
  splitLegacyName,
} from './validation/identity.js';
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
import { getGameAvailability } from './games/availability.js';
import { registerInfectedRoutes } from './games/infected/routes.js';
import { registerIslandEscapeRoutes } from './games/island_escape/routes.js';
import { registerMemoryMatchRoutes } from './games/memory_match/routes.js';
import { registerBossBattleRoutes } from './games/boss_battle/routes.js';
import { registerPixelRacerRoutes } from './games/pixel_racer/routes.js';
import { registerTimerTriviaRoutes } from './games/timer_trivia/routes.js';
import {
  codesMatch,
  decryptSecret,
  encryptSecret,
  hashSecret,
  randomRecoveryCode,
  randomTotpSecret,
  totpAt,
  validTotp,
} from './mfa.js';

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
const parse = (schema, value, req, res, validationStatus = 400) => {
  const result = schema.safeParse(value);
  if (!result.success) {
    const hasProfanity = result.error.issues.some(
      (issue) => issue.message === profanityMessage,
    );
    error(
      res,
      hasProfanity ? 422 : validationStatus,
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
      `SELECT u.user_id, u.role, u.full_name, u.first_name, u.last_name, u.student_type, u.student_year, u.email, u.email_verified_at FROM sessions s JOIN users u ON u.user_id=s.user_id WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at > now()`,
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
      firstName: result.rows[0].first_name,
      lastName: result.rows[0].last_name,
      studentType: result.rows[0].student_type,
      studentYear: result.rows[0].student_year,
      emailVerifiedAt: result.rows[0].email_verified_at,
      needsEmailVerification: !result.rows[0].email_verified_at,
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
const issueVerificationMail = async (userId, email, targetEmail = null) => {
  const token = crypto.randomBytes(32).toString('base64url');
  await pool.query(
    `INSERT INTO email_verification_tokens(user_id,token_hash,target_email,expires_at) VALUES($1,$2,$3,now()+interval '24 hours')`,
    [userId, sessionHash(token), targetEmail],
  );
  const mailDir = path.resolve('docs/dev-mail');
  await mkdir(mailDir, { recursive: true });
  await writeFile(
    path.join(mailDir, `${userId}.txt`),
    `To: ${email}\nVerify your EduQuest email: http://localhost:5173/verify-email?token=${token}\n`,
    'utf8',
  );
};

const nameSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .refine(noProfanity(), { message: profanityMessage });
const registerSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string().max(200).optional(),
    firstName: personNameSchema.optional(),
    lastName: personNameSchema.optional().nullable(),
    studentType: z.enum(['it', 'business']).optional(),
    studentYear: z.number().int().min(1).max(3).optional(),
    // Kept temporarily so existing users and offline fixtures can migrate safely.
    fullName: z.string().trim().max(101).optional(),
  })
  .strict()
  .refine((data) => data.firstName || data.fullName, {
    message: 'First name is required.',
    path: ['firstName'],
  })
  .refine(
    (data) => !data.confirmPassword || data.password === data.confirmPassword,
    {
      message: 'Passwords do not match.',
      path: ['confirmPassword'],
    },
  )
  .refine((data) => data.fullName || data.studentType, {
    message: 'Student type is required.',
    path: ['studentType'],
  });
const moduleSchema = z
  .object({
    moduleCode: z.string().trim().min(1).max(30),
    moduleName: nameSchema,
    description: z
      .string()
      .trim()
      .max(1000)
      .refine(noProfanity(), { message: profanityMessage })
      .optional(),
    year: z.number().int().min(1).max(3).optional(),
    programme: z.enum(['it', 'business', 'both']).optional(),
    offering: z.string().trim().min(1).max(80).optional(),
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
    const data = parse(registerSchema, req.body, req, res, 422);
    if (!data) return;
    const identity = data.firstName
      ? {
          firstName: normalizePersonName(data.firstName),
          lastName: data.lastName ? normalizePersonName(data.lastName) : null,
        }
      : splitLegacyName(data.fullName);
    if (!visibleText('firstName', req, res, identity.firstName)) return;
    if (
      identity.lastName &&
      !visibleText('lastName', req, res, identity.lastName)
    )
      return;
    if (!passwordIsAllowed(data.password, data.email, identity.firstName))
      return error(
        res,
        422,
        'VALIDATION_ERROR',
        'Choose a less common password that does not contain your email or first name.',
        requestId(req),
      );
    const hash = await bcrypt.hash(data.password, 12);
    const fullName = [identity.firstName, identity.lastName]
      .filter(Boolean)
      .join(' ');
    const result = await pool.query(
      `INSERT INTO users(email,password_hash,role,full_name,first_name,last_name,student_type,student_year) VALUES($1,$2,'student',$3,$4,$5,$6,$7) RETURNING user_id,role,full_name,first_name,last_name,student_type,student_year,email,email_verified_at`,
      [
        data.email,
        hash,
        fullName,
        identity.firstName,
        identity.lastName,
        data.studentType || 'it',
        data.studentYear || 1,
      ],
    );
    await issueVerificationMail(result.rows[0].user_id, data.email);
    await issueSession(result.rows[0].user_id, res);
    res.status(201).json({
      user: { ...result.rows[0], needs_email_verification: true },
    });
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
app.get('/api/v1/auth/verify-email', async (req, res, next) => {
  try {
    const data = parse(
      z.object({ token: z.string().min(20).max(200) }).strict(),
      req.query,
      req,
      res,
    );
    if (!data) return;
    const result = await pool.query(
      `UPDATE email_verification_tokens SET used_at=now() WHERE token_hash=$1 AND used_at IS NULL AND expires_at>now() RETURNING user_id,target_email`,
      [sessionHash(data.token)],
    );
    if (!result.rowCount)
      return error(
        res,
        422,
        'INVALID_VERIFICATION_TOKEN',
        'This verification link is invalid or expired.',
        requestId(req),
      );
    await pool.query(
      `UPDATE users SET email=COALESCE($2,email),pending_email=NULL,email_verified_at=now() WHERE user_id=$1`,
      [result.rows[0].user_id, result.rows[0].target_email],
    );
    res.json({ verified: true });
  } catch (e) {
    next(e);
  }
});

const mfaCodeSchema = z.string().regex(/^\d{6}$/);
const mfaFactorSchema = z
  .object({
    code: mfaCodeSchema.optional(),
    recoveryCode: z.string().trim().min(8).max(32).optional(),
  })
  .strict()
  .refine(
    (value) => Boolean(value.code || value.recoveryCode),
    'A code is required.',
  );
const mfaFailures = new Map();
const mfaFailureWindow = 15 * 60 * 1000;
const recordMfaFailure = (userId) => {
  const now = Date.now();
  const current = (mfaFailures.get(userId) || []).filter(
    (time) => now - time < mfaFailureWindow,
  );
  current.push(now);
  mfaFailures.set(userId, current);
  return current.length >= 10;
};
const mfaLocked = (userId) => {
  const now = Date.now();
  const current = (mfaFailures.get(userId) || []).filter(
    (time) => now - time < mfaFailureWindow,
  );
  mfaFailures.set(userId, current);
  return (
    current.length >= 10 && now - current[current.length - 10] < 15 * 60 * 1000
  );
};
const friendlyMfaError = (res, req) =>
  error(
    res,
    401,
    'MFA_FAILED',
    'The verification code is invalid or expired.',
    requestId(req),
  );
const verifyMfaFactor = async (userId, factor) => {
  const credential = await pool.query(
    'SELECT encrypted_secret,last_used_totp_step FROM mfa_credentials WHERE user_id=$1 AND enabled=true',
    [userId],
  );
  if (!credential.rowCount) return false;
  if (factor.code) {
    const secret = decryptSecret(credential.rows[0].encrypted_secret);
    const now = Date.now();
    const currentStep = Math.floor(now / 30_000);
    const matchedStep = [-1, 0, 1].find((offset) =>
      codesMatch(factor.code, totpAt(secret, now + offset * 30_000)),
    );
    if (matchedStep === undefined) return false;
    const step = currentStep + matchedStep;
    const accepted = await pool.query(
      'UPDATE mfa_credentials SET last_used_totp_step=$1 WHERE user_id=$2 AND (last_used_totp_step IS NULL OR last_used_totp_step<$1) RETURNING user_id',
      [step, userId],
    );
    return accepted.rowCount === 1;
  }
  const used = await pool.query(
    'UPDATE mfa_recovery_codes SET used_at=now() WHERE user_id=$1 AND code_hash=$2 AND used_at IS NULL RETURNING recovery_code_id',
    [userId, hashSecret(factor.recoveryCode)],
  );
  return used.rowCount === 1;
};
const generateRecoveryCodes = async (userId) => {
  const codes = Array.from({ length: 10 }, randomRecoveryCode);
  await pool.query('DELETE FROM mfa_recovery_codes WHERE user_id=$1', [userId]);
  for (const code of codes)
    await pool.query(
      'INSERT INTO mfa_recovery_codes(user_id,code_hash) VALUES($1,$2)',
      [userId, hashSecret(code)],
    );
  return codes;
};

app.post('/api/v1/mfa/enrol', requireAuth, async (req, res, next) => {
  try {
    if (!req.user.emailVerifiedAt)
      return error(
        res,
        403,
        'EMAIL_NOT_VERIFIED',
        'Verify your email before enabling MFA.',
        requestId(req),
      );
    if (!parse(z.object({}).strict(), req.body || {}, req, res)) return;
    const existing = await pool.query(
      'SELECT enabled,confirmed_at FROM mfa_credentials WHERE user_id=$1',
      [req.user.userId],
    );
    if (
      existing.rowCount &&
      (existing.rows[0].enabled || !existing.rows[0].confirmed_at)
    )
      return error(
        res,
        409,
        'MFA_EXISTS',
        'MFA enrolment already exists.',
        requestId(req),
      );
    const secret = randomTotpSecret();
    if (existing.rowCount)
      await pool.query(
        'UPDATE mfa_credentials SET encrypted_secret=$2,enabled=false,confirmed_at=NULL,last_used_totp_step=NULL WHERE user_id=$1',
        [req.user.userId, encryptSecret(secret)],
      );
    else
      await pool.query(
        'INSERT INTO mfa_credentials(user_id,encrypted_secret) VALUES($1,$2)',
        [req.user.userId, encryptSecret(secret)],
      );
    const uri = `otpauth://totp/EduQuest:${encodeURIComponent(req.user.email)}?secret=${secret}&issuer=EduQuest&algorithm=SHA1&digits=6&period=30`;
    const qrCode = await QRCode.toDataURL(uri, { errorCorrectionLevel: 'M' });
    res.json({ otpauthUri: uri, qrCode, setupKey: secret });
  } catch (e) {
    next(e);
  }
});
app.post('/api/v1/mfa/confirm', requireAuth, async (req, res, next) => {
  try {
    const data = parse(
      z.object({ code: mfaCodeSchema }).strict(),
      req.body,
      req,
      res,
      422,
    );
    if (!data) return;
    const row = await pool.query(
      'SELECT encrypted_secret,enabled FROM mfa_credentials WHERE user_id=$1',
      [req.user.userId],
    );
    if (!row.rowCount || row.rows[0].enabled)
      return error(
        res,
        409,
        'MFA_NOT_PENDING',
        'MFA enrolment is not pending.',
        requestId(req),
      );
    if (!validTotp(decryptSecret(row.rows[0].encrypted_secret), data.code))
      return friendlyMfaError(res, req);
    await pool.query(
      'UPDATE mfa_credentials SET enabled=true,confirmed_at=now() WHERE user_id=$1',
      [req.user.userId],
    );
    res.json({
      enabled: true,
      recoveryCodes: await generateRecoveryCodes(req.user.userId),
    });
  } catch (e) {
    next(e);
  }
});
app.post('/api/v1/mfa/disable', requireAuth, async (req, res, next) => {
  try {
    const data = parse(
      z
        .object({ password: z.string().min(1), ...mfaFactorSchema.shape })
        .strict(),
      req.body,
      req,
      res,
      422,
    );
    if (!data) return;
    const user = (
      await pool.query('SELECT password_hash FROM users WHERE user_id=$1', [
        req.user.userId,
      ])
    ).rows[0];
    if (
      !(await bcrypt.compare(data.password, user.password_hash)) ||
      !(await verifyMfaFactor(req.user.userId, data))
    )
      return friendlyMfaError(res, req);
    await pool.query(
      'UPDATE mfa_credentials SET enabled=false WHERE user_id=$1',
      [req.user.userId],
    );
    res.json({ enabled: false });
  } catch (e) {
    next(e);
  }
});
app.post(
  '/api/v1/mfa/recovery-codes/regenerate',
  requireAuth,
  async (req, res, next) => {
    try {
      const data = parse(
        z
          .object({ password: z.string().min(1), ...mfaFactorSchema.shape })
          .strict(),
        req.body,
        req,
        res,
        422,
      );
      if (!data) return;
      const user = (
        await pool.query('SELECT password_hash FROM users WHERE user_id=$1', [
          req.user.userId,
        ])
      ).rows[0];
      if (
        !(await bcrypt.compare(data.password, user.password_hash)) ||
        !(await verifyMfaFactor(req.user.userId, data))
      )
        return friendlyMfaError(res, req);
      res.json({ recoveryCodes: await generateRecoveryCodes(req.user.userId) });
    } catch (e) {
      next(e);
    }
  },
);
app.post('/api/v1/auth/login', async (req, res, next) => {
  try {
    const data = parse(
      z.object({ email: emailSchema, password: z.string() }).strict(),
      req.body,
      req,
      res,
    );
    if (!data) return;
    const result = await pool.query('SELECT * FROM users WHERE email=$1', [
      data.email,
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
    if (
      await pool
        .query(
          'SELECT 1 FROM mfa_credentials WHERE user_id=$1 AND enabled=true',
          [result.rows[0].user_id],
        )
        .then((value) => value.rowCount)
    ) {
      if (mfaLocked(result.rows[0].user_id))
        return error(
          res,
          429,
          'MFA_LOCKED',
          'MFA verification is temporarily locked. Please try again later.',
          requestId(req),
        );
      const challenge = crypto.randomUUID();
      const challengeRow = await pool.query(
        `INSERT INTO mfa_login_challenges(challenge_id,user_id,token_hash,expires_at) VALUES($1,$2,$3,now()+interval '5 minutes') RETURNING challenge_id`,
        [challenge, result.rows[0].user_id, hashSecret(challenge)],
      );
      return res.status(202).json({
        mfaRequired: true,
        challengeId: challengeRow.rows[0].challenge_id,
      });
    }
    await issueSession(result.rows[0].user_id, res);
    res.json({
      user: {
        user_id: result.rows[0].user_id,
        role: result.rows[0].role,
        full_name: result.rows[0].full_name,
        first_name: result.rows[0].first_name,
        last_name: result.rows[0].last_name,
        student_type: result.rows[0].student_type,
        email_verified_at: result.rows[0].email_verified_at,
        needs_email_verification: !result.rows[0].email_verified_at,
        email: result.rows[0].email,
      },
    });
  } catch (e) {
    next(e);
  }
});
app.post('/api/v1/auth/login/mfa', async (req, res, next) => {
  try {
    const data = parse(
      z
        .object({ challengeId: z.string().uuid(), ...mfaFactorSchema.shape })
        .strict(),
      req.body,
      req,
      res,
      422,
    );
    if (!data) return;
    const challenge = await pool.query(
      `SELECT challenge_id,user_id,attempts FROM mfa_login_challenges WHERE challenge_id=$1 AND token_hash=$2 AND used_at IS NULL AND expires_at>now()`,
      [data.challengeId, hashSecret(data.challengeId)],
    );
    // The challenge ID is intentionally not the bearer token; the server accepts only its stored hash.
    if (!challenge.rowCount) return friendlyMfaError(res, req);
    const userId = challenge.rows[0].user_id;
    if (challenge.rows[0].attempts >= 5 || mfaLocked(userId))
      return error(
        res,
        429,
        'MFA_LOCKED',
        'MFA verification is temporarily locked. Please try again later.',
        requestId(req),
      );
    const valid = await verifyMfaFactor(userId, data);
    if (!valid) {
      await pool.query(
        'UPDATE mfa_login_challenges SET attempts=attempts+1 WHERE challenge_id=$1',
        [data.challengeId],
      );
      const locked = recordMfaFailure(userId);
      return locked || challenge.rows[0].attempts + 1 >= 5
        ? error(
            res,
            429,
            'MFA_LOCKED',
            'MFA verification is temporarily locked. Please try again later.',
            requestId(req),
          )
        : friendlyMfaError(res, req);
    }
    await pool.query(
      'UPDATE mfa_login_challenges SET used_at=now() WHERE challenge_id=$1',
      [data.challengeId],
    );
    await issueSession(userId, res);
    const user = (
      await pool.query(
        'SELECT user_id,role,full_name,first_name,last_name,student_type,email,email_verified_at FROM users WHERE user_id=$1',
        [userId],
      )
    ).rows[0];
    res.json({ user });
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
      z
        .object({
          firstName: personNameSchema.optional(),
          lastName: personNameSchema.optional().nullable(),
          fullName: z.string().trim().max(101).optional(),
        })
        .strict()
        .refine((value) => value.firstName || value.fullName, {
          message: 'First name is required.',
          path: ['firstName'],
        }),
      req.body,
      req,
      res,
    );
    if (!data) return;
    const identity = data.firstName
      ? {
          firstName: normalizePersonName(data.firstName),
          lastName: data.lastName ? normalizePersonName(data.lastName) : null,
        }
      : splitLegacyName(data.fullName);
    if (!visibleText('firstName', req, res, identity.firstName)) return;
    const result = await pool.query(
      'UPDATE users SET first_name=$1,last_name=$2,full_name=$3 WHERE user_id=$4 RETURNING user_id,role,full_name,first_name,last_name,student_type,email,email_verified_at',
      [
        identity.firstName,
        identity.lastName,
        [identity.firstName, identity.lastName].filter(Boolean).join(' '),
        req.user.userId,
      ],
    );
    res.json({ user: result.rows[0] });
  } catch (e) {
    next(e);
  }
});

const profileSchema = z
  .object({
    firstName: personNameSchema.optional(),
    lastName: personNameSchema.optional().nullable(),
    studentType: z.enum(['it', 'business']).optional(),
    studentYear: z.number().int().min(1).max(3).optional(),
    preferredLanguages: z
      .array(z.string().trim().min(1).max(40))
      .max(10)
      .optional(),
  })
  .strict();
const currentPasswordSchema = z
  .object({ password: z.string().min(1) })
  .strict();

const profileUser = async (userId) => {
  const result = await pool.query(
    `SELECT u.user_id,u.role,u.full_name,u.first_name,u.last_name,u.student_type,u.student_year,
            u.email,u.email_verified_at,u.pending_email,
            COALESCE(json_agg(pl.name ORDER BY pl.name) FILTER (WHERE pl.name IS NOT NULL), '[]') AS preferred_languages,
            EXISTS(SELECT 1 FROM mfa_credentials mc WHERE mc.user_id=u.user_id AND mc.enabled) AS mfa_enabled
       FROM users u
       LEFT JOIN user_preferred_languages upl ON upl.user_id=u.user_id
       LEFT JOIN programming_languages pl ON pl.language_id=upl.language_id
      WHERE u.user_id=$1
      GROUP BY u.user_id`,
    [userId],
  );
  return result.rows[0];
};

app.get('/api/v1/me/profile', requireAuth, async (req, res, next) => {
  try {
    const [profile, languages] = await Promise.all([
      profileUser(req.user.userId),
      pool.query('SELECT name FROM programming_languages ORDER BY name'),
    ]);
    res.json({ profile, languages: languages.rows.map((row) => row.name) });
  } catch (e) {
    next(e);
  }
});

app.patch('/api/v1/me/profile', requireAuth, async (req, res, next) => {
  try {
    const data = parse(profileSchema, req.body, req, res, 422);
    if (!data) return;
    if (req.user.role !== 'student' && data.studentType !== undefined)
      return error(
        res,
        422,
        'VALIDATION_ERROR',
        'Student type is only available for students.',
        requestId(req),
      );
    if (
      data.firstName !== undefined &&
      !visibleText('firstName', req, res, data.firstName)
    )
      return;
    if (data.lastName && !visibleText('lastName', req, res, data.lastName))
      return;
    const identity = {
      firstName: data.firstName
        ? normalizePersonName(data.firstName)
        : req.user.firstName,
      lastName:
        data.lastName === undefined
          ? req.user.lastName
          : data.lastName
            ? normalizePersonName(data.lastName)
            : null,
    };
    await pool.query(
      `UPDATE users SET first_name=$1,last_name=$2,full_name=$3,student_type=CASE WHEN role='student' THEN COALESCE($4,student_type) ELSE NULL END,student_year=CASE WHEN role='student' THEN COALESCE($5,student_year) ELSE NULL END WHERE user_id=$6`,
      [
        identity.firstName,
        identity.lastName,
        [identity.firstName, identity.lastName].filter(Boolean).join(' '),
        data.studentType ?? null,
        data.studentYear ?? null,
        req.user.userId,
      ],
    );
    if (data.preferredLanguages !== undefined) {
      const languages = await pool.query(
        'SELECT language_id,name FROM programming_languages WHERE name=ANY($1)',
        [data.preferredLanguages],
      );
      if (languages.rowCount !== data.preferredLanguages.length)
        return error(
          res,
          422,
          'VALIDATION_ERROR',
          'Choose languages from the available list.',
          requestId(req),
        );
      await pool.query(
        'DELETE FROM user_preferred_languages WHERE user_id=$1',
        [req.user.userId],
      );
      for (const language of languages.rows)
        await pool.query(
          'INSERT INTO user_preferred_languages(user_id,language_id) VALUES($1,$2)',
          [req.user.userId, language.language_id],
        );
    }
    res.json({
      profile: await profileUser(req.user.userId),
      message: 'Profile saved.',
    });
  } catch (e) {
    next(e);
  }
});

app.post('/api/v1/me/password', requireAuth, async (req, res, next) => {
  try {
    const data = parse(
      currentPasswordSchema
        .extend({
          newPassword: passwordSchema,
          confirmPassword: z.string().max(200),
        })
        .strict(),
      req.body,
      req,
      res,
      422,
    );
    if (!data) return;
    if (data.newPassword !== data.confirmPassword)
      return error(
        res,
        422,
        'VALIDATION_ERROR',
        'Passwords do not match.',
        requestId(req),
      );
    const current = await pool.query(
      'SELECT password_hash,first_name,email FROM users WHERE user_id=$1',
      [req.user.userId],
    );
    if (
      !current.rowCount ||
      !(await bcrypt.compare(data.password, current.rows[0].password_hash))
    )
      return error(
        res,
        401,
        'INVALID_PASSWORD',
        'The current password is incorrect.',
        requestId(req),
      );
    if (
      !passwordIsAllowed(
        data.newPassword,
        current.rows[0].email,
        current.rows[0].first_name,
      )
    )
      return error(
        res,
        422,
        'VALIDATION_ERROR',
        'Choose a less common password that does not contain your email or first name.',
        requestId(req),
      );
    await pool.query('BEGIN');
    try {
      await pool.query('UPDATE users SET password_hash=$1 WHERE user_id=$2', [
        await bcrypt.hash(data.newPassword, 12),
        req.user.userId,
      ]);
      await pool.query(
        'UPDATE sessions SET revoked_at=now() WHERE user_id=$1 AND token_hash<>$2 AND revoked_at IS NULL',
        [req.user.userId, sessionHash(req.cookies.eduquest_session)],
      );
      await pool.query('COMMIT');
    } catch (e) {
      await pool.query('ROLLBACK');
      throw e;
    }
    res.json({ message: 'Password changed. Other sessions were signed out.' });
  } catch (e) {
    next(e);
  }
});

app.post('/api/v1/me/email', requireAuth, async (req, res, next) => {
  try {
    const data = parse(
      currentPasswordSchema.extend({ email: emailSchema }).strict(),
      req.body,
      req,
      res,
      422,
    );
    if (!data) return;
    const current = await pool.query(
      'SELECT password_hash,email FROM users WHERE user_id=$1',
      [req.user.userId],
    );
    if (
      !current.rowCount ||
      !(await bcrypt.compare(data.password, current.rows[0].password_hash))
    )
      return error(
        res,
        401,
        'INVALID_PASSWORD',
        'The current password is incorrect.',
        requestId(req),
      );
    if (data.email === current.rows[0].email)
      return error(
        res,
        422,
        'VALIDATION_ERROR',
        'Choose a different email address.',
        requestId(req),
      );
    const duplicate = await pool.query(
      'SELECT 1 FROM users WHERE lower(email)=lower($1) OR lower(pending_email)=lower($1)',
      [data.email],
    );
    if (duplicate.rowCount)
      return error(
        res,
        409,
        'EMAIL_EXISTS',
        'An account with that email already exists.',
        requestId(req),
      );
    await pool.query('UPDATE users SET pending_email=$1 WHERE user_id=$2', [
      data.email,
      req.user.userId,
    ]);
    await issueVerificationMail(req.user.userId, data.email, data.email);
    res.json({ message: 'Check your new email to verify the change.' });
  } catch (e) {
    next(e);
  }
});

const catalogueQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(20),
    search: z.string().trim().max(100).default(''),
    sort: z.enum(['code', 'name', 'newest']).default('code'),
  })
  .strict();

const paged = (page, pageSize, total) => ({
  page,
  pageSize,
  total,
  pageCount: Math.max(1, Math.ceil(total / pageSize)),
});

app.get('/api/v1/me/modules', requireAuth, async (req, res, next) => {
  try {
    const query = parse(catalogueQuerySchema, req.query, req, res, 422);
    if (!query) return;
    const offset = (query.page - 1) * query.pageSize;
    const ownership =
      req.user.role === 'lecturer'
        ? 'm.lecturer_id=$1'
        : 'EXISTS (SELECT 1 FROM enrollments me WHERE me.module_id=m.module_id AND me.student_id=$1)';
    const filter = query.search
      ? ` AND (m.module_code ILIKE $2 OR m.module_name ILIKE $2)`
      : '';
    const values = query.search
      ? [req.user.userId, `%${query.search}%`]
      : [req.user.userId];
    const count = await pool.query(
      `SELECT count(*)::int AS total FROM modules m WHERE ${ownership}${filter}`,
      values,
    );
    const order =
      query.sort === 'name'
        ? 'm.module_name ASC, m.module_code ASC'
        : query.sort === 'newest'
          ? 'm.created_date DESC, m.module_code ASC'
          : 'm.module_code ASC';
    const pageValues = [...values, query.pageSize, offset];
    const result = await pool.query(
      `SELECT m.module_id,m.module_code,m.module_name,m.description,m.year,m.programme,m.offering,
              u.full_name AS lecturer_name,
              (SELECT count(*)::int FROM quizzes q WHERE q.module_id=m.module_id AND q.status='published') AS quizzes_available,
              (SELECT count(*)::int FROM resources r WHERE r.module_id=m.module_id AND r.created_date >= now()-interval '14 days') AS new_resources_count,
              false AS has_in_progress_game
         FROM modules m JOIN users u ON u.user_id=m.lecturer_id
        WHERE ${ownership}${filter}
        ORDER BY ${order}
        LIMIT $${pageValues.length - 1} OFFSET $${pageValues.length}`,
      pageValues,
    );
    // Generic and game-specific plays are checked separately so this card never
    // exposes another student's play state.
    if (req.user.role === 'student' && result.rows.length) {
      const ids = result.rows.map((row) => row.module_id);
      const plays = await pool.query(
        `SELECT DISTINCT q.module_id FROM game_plays gp JOIN quizzes q ON q.quiz_id=gp.quiz_id WHERE gp.student_id=$1 AND gp.status='in_progress' AND q.module_id=ANY($2::uuid[])
         UNION
         SELECT DISTINCT q.module_id FROM game_sessions gs JOIN games g ON g.game_id=gs.game_id JOIN quizzes q ON q.quiz_id=g.quiz_id WHERE gs.student_id=$1 AND gs.status='in_progress' AND q.module_id=ANY($2::uuid[])`,
        [req.user.userId, ids],
      );
      const active = new Set(plays.rows.map((row) => row.module_id));
      for (const row of result.rows)
        row.has_in_progress_game = active.has(row.module_id);
    }
    res.json({
      data: result.rows,
      pagination: paged(query.page, query.pageSize, count.rows[0].total),
    });
  } catch (e) {
    next(e);
  }
});

app.get('/api/v1/me/modules/lookahead', requireAuth, async (req, res, next) => {
  try {
    if (req.user.role !== 'student')
      return error(res, 403, 'FORBIDDEN', 'Students only.', requestId(req));
    if (req.user.studentYear !== 1)
      return res.json({ data: [], preview: false });
    const result = await pool.query(
      `SELECT m.module_id,m.module_code,m.module_name,m.description,m.year,m.programme,m.offering,
              COALESCE(json_agg(DISTINCT t.name) FILTER (WHERE t.name IS NOT NULL), '[]') AS topics,
              ARRAY[]::text[] AS prerequisite_hints
         FROM modules m LEFT JOIN topics t ON t.module_id=m.module_id
        WHERE m.year=2 AND (m.programme=$1 OR m.programme='both')
        GROUP BY m.module_id ORDER BY m.module_code`,
      [req.user.studentType],
    );
    res.json({ data: result.rows, preview: true });
  } catch (e) {
    next(e);
  }
});

app.get('/api/v1/resources/modules', requireAuth, async (req, res, next) => {
  try {
    const query = parse(catalogueQuerySchema, req.query, req, res, 422);
    if (!query) return;
    const offset = (query.page - 1) * query.pageSize;
    const ownership =
      req.user.role === 'lecturer'
        ? 'm.lecturer_id=$1'
        : 'EXISTS (SELECT 1 FROM enrollments e WHERE e.module_id=m.module_id AND e.student_id=$1)';
    const result = await pool.query(
      `SELECT m.module_id,m.module_code,m.module_name,count(r.resource_id)::int AS resource_count,
              max(r.created_date) AS last_updated
         FROM modules m LEFT JOIN resources r ON r.module_id=m.module_id
        WHERE ${ownership}
        GROUP BY m.module_id ORDER BY m.module_code
        LIMIT $2 OFFSET $3`,
      [req.user.userId, query.pageSize, offset],
    );
    const count = await pool.query(
      `SELECT count(*)::int AS total FROM modules m WHERE ${ownership}`,
      [req.user.userId],
    );
    res.json({
      data: result.rows,
      pagination: paged(query.page, query.pageSize, count.rows[0].total),
    });
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
      if (
        data.description &&
        !visibleText('moduleDescription', req, res, data.description)
      )
        return;
      const joinCode = crypto.randomBytes(12).toString('base64url');
      const result = await pool.query(
        `INSERT INTO modules(lecturer_id,module_code,module_name,description,year,programme,offering,join_code) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [
          req.user.userId,
          data.moduleCode,
          data.moduleName,
          data.description || '',
          data.year || 1,
          data.programme || 'both',
          data.offering || 'Semester 1',
          joinCode,
        ],
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
      const query = parse(catalogueQuerySchema, req.query, req, res, 422);
      if (!query) return;
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
      const search = query.search ? ' AND r.title ILIKE $3' : '';
      const baseValues = query.search
        ? [req.params.moduleId, req.user.userId, `%${query.search}%`]
        : [req.params.moduleId, req.user.userId];
      const count = await pool.query(
        `SELECT count(DISTINCT r.resource_id)::int AS total
           FROM resources r LEFT JOIN group_members gm ON gm.group_id=r.group_id AND gm.student_id=$2
          WHERE r.module_id=$1
            AND (r.group_id IS NULL OR gm.student_id IS NOT NULL OR EXISTS (SELECT 1 FROM modules m WHERE m.module_id=r.module_id AND m.lecturer_id=$2))${search}`,
        baseValues,
      );
      const result = await pool.query(
        `SELECT DISTINCT r.* FROM resources r LEFT JOIN group_members gm ON gm.group_id=r.group_id AND gm.student_id=$2
          WHERE r.module_id=$1
            AND (r.group_id IS NULL OR gm.student_id IS NOT NULL OR EXISTS (SELECT 1 FROM modules m WHERE m.module_id=r.module_id AND m.lecturer_id=$2))${search}
          ORDER BY r.created_date DESC LIMIT $${baseValues.length + 1} OFFSET $${baseValues.length + 2}`,
        [...baseValues, query.pageSize, (query.page - 1) * query.pageSize],
      );
      res.json({
        data: result.rows,
        pagination: paged(query.page, query.pageSize, count.rows[0].total),
      });
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
      const page = Math.max(
        1,
        Math.min(10000, Number.parseInt(req.query.page || '1', 10) || 1),
      );
      const pageSize = Math.max(
        1,
        Math.min(100, Number.parseInt(req.query.pageSize || '20', 10) || 20),
      );
      const search = String(req.query.search || '').trim();
      const result = await pool.query(
        `SELECT quiz_id,title,is_competitive,closes_at,status
         FROM quizzes
         WHERE module_id=$1 AND status='published'
           AND ($2='' OR title ILIKE '%' || $2 || '%')
         ORDER BY created_at DESC, quiz_id DESC
         LIMIT $3 OFFSET $4`,
        [req.params.moduleId, search, pageSize, (page - 1) * pageSize],
      );
      const total = await pool.query(
        `SELECT count(*)::int AS count FROM quizzes
         WHERE module_id=$1 AND status='published'
           AND ($2='' OR title ILIKE '%' || $2 || '%')`,
        [req.params.moduleId, search],
      );
      res.json({
        data: result.rows,
        pagination: {
          page,
          pageSize,
          total: total.rows[0].count,
          pages: Math.max(1, Math.ceil(total.rows[0].count / pageSize)),
        },
      });
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

app.get('/api/v1/games/catalogue', requireAuth, async (req, res, next) => {
  try {
    const valid = parse(z.object({}).strict(), req.query, req, res);
    if (!valid) return;
    const result = await pool.query(
      `SELECT game_type_id,key,display_name,description,minimum_questions
         FROM game_types WHERE is_enabled=true
         ORDER BY CASE key WHEN 'infected' THEN 1 WHEN 'island_escape' THEN 2
           WHEN 'memory_match' THEN 3 WHEN 'boss_battle' THEN 4
           WHEN 'pixel_racer' THEN 5 WHEN 'timer_trivia' THEN 6 ELSE 100 END,key`,
    );
    res.json({ data: result.rows });
  } catch (e) {
    next(e);
  }
});

async function gameAvailabilityForQuiz(user, quiz) {
  const catalogue = await pool.query(
    `SELECT game_type_id,key,display_name,description,minimum_questions
     FROM game_types WHERE is_enabled=true
     ORDER BY CASE key WHEN 'infected' THEN 1 WHEN 'island_escape' THEN 2
       WHEN 'memory_match' THEN 3 WHEN 'boss_battle' THEN 4
       WHEN 'pixel_racer' THEN 5 WHEN 'timer_trivia' THEN 6 ELSE 100 END,key`,
  );
  const counts = (
    await pool.query(
      `SELECT count(q.question_id)::int AS question_count,
        count(q.question_id) FILTER (WHERE length(q.question_text)<=140 AND EXISTS (
          SELECT 1 FROM question_options correct
          WHERE correct.question_id=q.question_id AND correct.is_correct=true
            AND length(correct.option_text)<=60
        ))::int AS memory_eligible,
        count(q.question_id) FILTER (WHERE EXISTS (
          SELECT 1 FROM question_options correct
          WHERE correct.question_id=q.question_id AND correct.is_correct=true
        ) AND (SELECT count(*) FROM question_options options
          WHERE options.question_id=q.question_id)>=2)::int AS answerable
       FROM questions q WHERE q.quiz_id=$1`,
      [quiz.quiz_id],
    )
  ).rows[0];
  const enrolled =
    user.role === 'lecturer' ||
    Boolean(
      (
        await pool.query(
          'SELECT 1 FROM enrollments WHERE module_id=$1 AND student_id=$2',
          [quiz.module_id, user.userId],
        )
      ).rowCount,
    );
  const scoredAttemptCompleted = Boolean(
    (
      await pool.query(
        'SELECT 1 FROM quiz_attempts WHERE quiz_id=$1 AND student_id=$2 AND is_scored=true AND completion_time IS NOT NULL',
        [quiz.quiz_id, user.userId],
      )
    ).rowCount,
  );
  const plays = await pool.query(
    `SELECT p.play_id,gt.key FROM game_plays p
     JOIN game_types gt ON gt.game_type_id=p.game_type_id
     WHERE p.quiz_id=$1 AND p.student_id=$2 AND p.status='in_progress'`,
    [quiz.quiz_id, user.userId],
  );
  const playByKey = new Map(plays.rows.map((row) => [row.key, row.play_id]));
  return catalogue.rows.map((game) => {
    const result = getGameAvailability({
      game,
      user,
      quiz,
      counts,
      enrolled,
      scoredAttemptCompleted,
      hasInProgressPlay: playByKey.has(game.key),
    });
    return {
      ...result,
      playId: playByKey.get(game.key) || null,
    };
  });
}

app.get(
  '/api/v1/games/availability/:quizId',
  requireAuth,
  async (req, res, next) => {
    try {
      const valid = parse(z.object({}).strict(), req.query, req, res);
      if (!valid) return;
      const quiz = await pool.query('SELECT * FROM quizzes WHERE quiz_id=$1', [
        req.params.quizId,
      ]);
      if (!quiz.rowCount)
        return error(res, 404, 'NOT_FOUND', 'Quiz not found.', requestId(req));
      if (req.user.role === 'lecturer') {
        const owner = await pool.query(
          'SELECT 1 FROM modules WHERE module_id=$1 AND lecturer_id=$2',
          [quiz.rows[0].module_id, req.user.userId],
        );
        if (!owner.rowCount)
          return error(
            res,
            403,
            'FORBIDDEN',
            'You do not manage this quiz.',
            requestId(req),
          );
      } else {
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
      }
      res.json({ data: await gameAvailabilityForQuiz(req.user, quiz.rows[0]) });
    } catch (e) {
      next(e);
    }
  },
);

app.get('/api/v1/games/in-progress', requireAuth, async (req, res, next) => {
  try {
    const valid = parse(z.object({}).strict(), req.query, req, res);
    if (!valid) return;
    if (req.user.role === 'lecturer') return res.json({ data: [] });
    const result = await pool.query(
      `SELECT p.play_id,gt.key AS game_key,gt.display_name,q.quiz_id,q.title,m.module_id,m.module_name
         FROM game_plays p JOIN game_types gt ON gt.game_type_id=p.game_type_id
         JOIN quizzes q ON q.quiz_id=p.quiz_id JOIN modules m ON m.module_id=q.module_id
         WHERE p.student_id=$1 AND p.status='in_progress' ORDER BY p.updated_at DESC`,
      [req.user.userId],
    );
    res.json({ data: result.rows });
  } catch (e) {
    next(e);
  }
});

app.get('/api/v1/games/quiz-picker', requireAuth, async (req, res, next) => {
  try {
    const query = parse(
      z
        .object({
          page: z.coerce.number().int().min(1).max(10000).default(1),
          pageSize: z.coerce.number().int().min(1).max(100).default(20),
          search: z.string().max(100).default(''),
        })
        .strict(),
      req.query,
      req,
      res,
    );
    if (!query) return;
    const scope =
      req.user.role === 'lecturer'
        ? 'm.lecturer_id=$1'
        : 'EXISTS (SELECT 1 FROM enrollments e WHERE e.module_id=m.module_id AND e.student_id=$1)';
    const params = [req.user.userId, `%${query.search.trim()}%`];
    const base = `FROM quizzes q JOIN modules m ON m.module_id=q.module_id
        WHERE ${scope} AND q.title ILIKE $2`;
    const total = await pool.query(
      `SELECT count(*)::int AS count ${base}`,
      params,
    );
    const quizzes = await pool.query(
      `SELECT q.quiz_id,q.title,q.is_competitive,q.status,q.closes_at,q.created_at,
                m.module_id,m.module_name
         ${base} ORDER BY q.created_at DESC,q.quiz_id DESC LIMIT $3 OFFSET $4`,
      [...params, query.pageSize, (query.page - 1) * query.pageSize],
    );
    const data = await Promise.all(
      quizzes.rows.map(async (quiz) => ({
        ...quiz,
        games: await gameAvailabilityForQuiz(req.user, quiz),
      })),
    );
    res.json({
      data,
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total: total.rows[0].count,
        pages: Math.max(1, Math.ceil(total.rows[0].count / query.pageSize)),
      },
    });
  } catch (e) {
    next(e);
  }
});

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
      res.json({
        data: await gameAvailabilityForQuiz(req.user, quiz.rows[0]),
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
registerTimerTriviaRoutes({ app, pool, requireAuth, error, requestId });

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
