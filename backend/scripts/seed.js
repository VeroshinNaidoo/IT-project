import 'dotenv/config';
import { pool } from '../db.js';

const {
  SEED_LECTURER_EMAIL: email,
  SEED_LECTURER_NAME: fullName,
  SEED_LECTURER_PASSWORD_HASH: passwordHash,
} = process.env;
if (!email || !fullName || !passwordHash)
  throw new Error(
    'Seed requires lecturer email, name, and a precomputed password hash',
  );
await pool.query(
  `INSERT INTO users (email, password_hash, role, full_name)
   VALUES ($1, $2, 'lecturer', $3)
   ON CONFLICT (email) DO UPDATE SET full_name = EXCLUDED.full_name, password_hash = EXCLUDED.password_hash`,
  [email.toLowerCase(), passwordHash, fullName],
);
console.log(`Seeded lecturer ${email.toLowerCase()}`);
await pool.end();
