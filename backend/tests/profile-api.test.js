// @ts-nocheck
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';

process.env.NODE_ENV = 'development';
process.env.COOKIE_SECURE = 'false';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
const { app } = await import('../src/app.js');
const { pool } = await import('../db.js');

const email = `profile-${Date.now()}@example.com`;
const otherEmail = `profile-other-${Date.now()}@example.com`;
const password = 'ProfileCurrent9!';

async function login(address = email, secret = password) {
  const result = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: address, password: secret });
  expect(result.status).toBe(200);
  return result.headers['set-cookie'][0].split(';')[0];
}

describe('profile management API', () => {
  let userId;
  beforeAll(async () => {
    const hash = await bcrypt.hash(password, 12);
    const result = await pool.query(
      `INSERT INTO users(email,password_hash,role,full_name,first_name,last_name,student_type,email_verified_at)
       VALUES($1,$2,'student','Profile User','Profile','User','it',now()) RETURNING user_id`,
      [email, hash],
    );
    userId = result.rows[0].user_id;
    await pool.query(
      `INSERT INTO users(email,password_hash,role,full_name,first_name,email_verified_at) VALUES($1,$2,'student','Other User','Other',now())`,
      [otherEmail, hash],
    );
  });
  afterAll(async () => {
    await pool.query('DELETE FROM users WHERE email LIKE $1', [
      'profile-%@example.com',
    ]);
  });

  it('gets and updates the own profile, preferred languages, and student type', async () => {
    const agent = request.agent(app);
    expect(
      (await agent.post('/api/v1/auth/login').send({ email, password })).status,
    ).toBe(200);
    const before = await agent.get('/api/v1/me/profile');
    expect(before.status).toBe(200);
    expect(before.body.languages).toEqual(
      expect.arrayContaining(['JavaScript', 'Python', 'SQL']),
    );
    const saved = await agent.patch('/api/v1/me/profile').send({
      firstName: 'Updated',
      lastName: 'Learner',
      studentType: 'business',
      preferredLanguages: ['Python', 'SQL'],
    });
    expect(saved.status).toBe(200);
    expect(saved.body.profile).toMatchObject({
      first_name: 'Updated',
      last_name: 'Learner',
      student_type: 'business',
      preferred_languages: ['Python', 'SQL'],
    });
  });

  it('rejects profanity, invalid languages, unknown fields, and lecturer-only student type changes', async () => {
    const cookie = await login();
    expect(
      (
        await request(app)
          .patch('/api/v1/me/profile')
          .set('Cookie', cookie)
          .send({ role: 'lecturer' })
      ).status,
    ).toBe(422);
    expect(
      (
        await request(app)
          .patch('/api/v1/me/profile')
          .set('Cookie', cookie)
          .send({ firstName: 'fuck' })
      ).status,
    ).toBe(422);
    expect(
      (
        await request(app)
          .patch('/api/v1/me/profile')
          .set('Cookie', cookie)
          .send({ preferredLanguages: ['Cobol'] })
      ).status,
    ).toBe(422);
    const lecturer = await pool.query(
      `INSERT INTO users(email,password_hash,role,full_name,first_name) VALUES($1,$2,'lecturer','Profile Lecturer','Profile') RETURNING user_id`,
      [`${email}.lecturer`, await bcrypt.hash(password, 12)],
    );
    const lecturerCookie = await login(`${email}.lecturer`);
    expect(
      (
        await request(app)
          .patch('/api/v1/me/profile')
          .set('Cookie', lecturerCookie)
          .send({ studentType: 'it' })
      ).status,
    ).toBe(422);
    await pool.query('DELETE FROM users WHERE user_id=$1', [
      lecturer.rows[0].user_id,
    ]);
  });

  it('refuses unauthenticated access and another user cannot edit this profile', async () => {
    expect((await request(app).get('/api/v1/me/profile')).status).toBe(401);
    const otherCookie = await login(otherEmail);
    const own = await request(app)
      .get('/api/v1/me/profile')
      .set('Cookie', otherCookie);
    expect(own.status).toBe(200);
    expect(own.body.profile.user_id).not.toBe(userId);
    const edited = await request(app)
      .patch('/api/v1/me/profile')
      .set('Cookie', otherCookie)
      .send({ firstName: 'OtherUpdated' });
    expect(edited.status).toBe(200);
    const target = await pool.query(
      'SELECT first_name FROM users WHERE user_id=$1',
      [userId],
    );
    expect(target.rows[0].first_name).toBe('Updated');
  });

  it('changes password under the shared policy and revokes every other session only', async () => {
    const current = await login();
    const other = await login();
    const changed = await request(app)
      .post('/api/v1/me/password')
      .set('Cookie', current)
      .send({
        password,
        newPassword: 'ProfileNew9@',
        confirmPassword: 'ProfileNew9@',
      });
    expect(changed.status).toBe(200);
    expect(
      (await request(app).get('/api/v1/me/profile').set('Cookie', current))
        .status,
    ).toBe(200);
    expect(
      (await request(app).get('/api/v1/me/profile').set('Cookie', other))
        .status,
    ).toBe(401);
    expect(
      (
        await request(app)
          .post('/api/v1/auth/login')
          .send({ email, password: 'ProfileNew9@' })
      ).status,
    ).toBe(200);
  });

  it('requires the current password and confirmation for password changes', async () => {
    const cookie = await login(email, 'ProfileNew9@');
    expect(
      (
        await request(app)
          .post('/api/v1/me/password')
          .set('Cookie', cookie)
          .send({
            password: 'wrong',
            newPassword: 'AnotherNew9@',
            confirmPassword: 'AnotherNew9@',
          })
      ).status,
    ).toBe(401);
    expect(
      (
        await request(app)
          .post('/api/v1/me/password')
          .set('Cookie', cookie)
          .send({
            password: 'ProfileNew9@',
            newPassword: 'AnotherNew9@',
            confirmPassword: 'Mismatch9@',
          })
      ).status,
    ).toBe(422);
  });

  it('keeps the old email active until the new email is verified', async () => {
    const cookie = await login(email, 'ProfileNew9@');
    const changed = await request(app)
      .post('/api/v1/me/email')
      .set('Cookie', cookie)
      .send({
        password: 'ProfileNew9@',
        email: `profile-new-${Date.now()}@example.com`,
      });
    expect(changed.status).toBe(200);
    const row = await pool.query(
      'SELECT email,pending_email,email_verified_at FROM users WHERE user_id=$1',
      [userId],
    );
    expect(row.rows[0].email).toBe(email);
    expect(row.rows[0].pending_email).toBeTruthy();
    expect(changed.body).not.toHaveProperty('token');
  });

  it('never returns password hashes, MFA secrets, or tokens', async () => {
    const cookie = await login(email, 'ProfileNew9@');
    const result = await request(app)
      .get('/api/v1/me/profile')
      .set('Cookie', cookie);
    const body = JSON.stringify(result.body);
    expect(body).not.toMatch(
      /password_hash|encrypted_secret|token_hash|setupKey|recoveryCode/i,
    );
  });
});
