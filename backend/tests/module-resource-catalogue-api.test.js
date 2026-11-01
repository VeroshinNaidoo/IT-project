// @ts-nocheck
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

process.env.NODE_ENV = 'development';
process.env.COOKIE_SECURE = 'false';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
const { app } = await import('../src/app.js');
const { pool } = await import('../db.js');

describe('student module and resource catalogue API', () => {
  let lecturer;
  let otherLecturer;
  let firstYear;
  let secondYear;
  let ownModule;
  let otherModule;
  let lecturerAgent;
  let firstYearAgent;
  let secondYearAgent;

  beforeAll(async () => {
    const hash = await bcrypt.hash('CataloguePassword9!', 12);
    const users = await Promise.all([
      pool.query(
        `INSERT INTO users(email,password_hash,role,full_name,first_name,student_year)
         VALUES('catalogue-lecturer@example.com',$1,'lecturer','Catalogue Lecturer','Catalogue',NULL) RETURNING user_id`,
        [hash],
      ),
      pool.query(
        `INSERT INTO users(email,password_hash,role,full_name,first_name,student_type,student_year,email_verified_at)
         VALUES('catalogue-first@example.com',$1,'student','First Student','First','it',1,now()) RETURNING user_id`,
        [hash],
      ),
      pool.query(
        `INSERT INTO users(email,password_hash,role,full_name,first_name,student_type,student_year,email_verified_at)
         VALUES('catalogue-second@example.com',$1,'student','Second Student','Second','it',2,now()) RETURNING user_id`,
        [hash],
      ),
      pool.query(
        `INSERT INTO users(email,password_hash,role,full_name,first_name,student_year)
         VALUES('catalogue-other-lecturer@example.com',$1,'lecturer','Other Lecturer','Other',NULL) RETURNING user_id`,
        [hash],
      ),
    ]);
    lecturer = users[0].rows[0].user_id;
    firstYear = users[1].rows[0].user_id;
    secondYear = users[2].rows[0].user_id;
    otherLecturer = users[3].rows[0].user_id;
    ownModule = (
      await pool.query(
        `INSERT INTO modules(lecturer_id,module_code,module_name,description,year,programme,offering,join_code)
         VALUES($1,'CAT101','Catalogue Foundations','First-year foundations.',1,'it','Semester 1','CATJOIN10101') RETURNING *`,
        [lecturer],
      )
    ).rows[0];
    otherModule = (
      await pool.query(
        `INSERT INTO modules(lecturer_id,module_code,module_name,description,year,programme,offering,join_code)
         VALUES($1,'CAT201','Catalogue Networks','Second-year networking.',2,'it','Semester 2','CATJOIN20101') RETURNING *`,
        [otherLecturer],
      )
    ).rows[0];
    await pool.query(
      'INSERT INTO enrollments(student_id,module_id) VALUES($1,$2)',
      [firstYear, ownModule.module_id],
    );
    await pool.query(
      `INSERT INTO topics(module_id,name) VALUES($1,'Networking')`,
      [otherModule.module_id],
    );
    await pool.query(
      `INSERT INTO resources(uploaded_by,module_id,title,resource_type,file_location,file_size_bytes)
       VALUES($1,$2,'First resource','txt','/tmp/catalogue.txt',10)`,
      [lecturer, ownModule.module_id],
    );
    await pool.query(
      `INSERT INTO quizzes(module_id,created_by,title,status) VALUES($1,$2,'Published CAT Quiz','published')`,
      [ownModule.module_id, lecturer],
    );
    lecturerAgent = request.agent(app);
    firstYearAgent = request.agent(app);
    secondYearAgent = request.agent(app);
    await lecturerAgent.post('/api/v1/auth/login').send({
      email: 'catalogue-lecturer@example.com',
      password: 'CataloguePassword9!',
    });
    await firstYearAgent.post('/api/v1/auth/login').send({
      email: 'catalogue-first@example.com',
      password: 'CataloguePassword9!',
    });
    await secondYearAgent.post('/api/v1/auth/login').send({
      email: 'catalogue-second@example.com',
      password: 'CataloguePassword9!',
    });
  });

  afterAll(async () => {
    await pool.query(
      'DELETE FROM resources WHERE module_id = ANY($1::uuid[])',
      [[ownModule.module_id, otherModule.module_id]],
    );
    await pool.query('DELETE FROM quizzes WHERE module_id = ANY($1::uuid[])', [
      [ownModule.module_id, otherModule.module_id],
    ]);
    await pool.query('DELETE FROM topics WHERE module_id = ANY($1::uuid[])', [
      [ownModule.module_id, otherModule.module_id],
    ]);
    await pool.query(
      'DELETE FROM enrollments WHERE module_id = ANY($1::uuid[])',
      [[ownModule.module_id, otherModule.module_id]],
    );
    await pool.query('DELETE FROM modules WHERE module_id = ANY($1::uuid[])', [
      [ownModule.module_id, otherModule.module_id],
    ]);
    await pool.query(
      `DELETE FROM users WHERE email LIKE 'catalogue-%@example.com'`,
    );
  });

  it('returns all enrolled module cards with counts and lecturer details immediately', async () => {
    const result = await firstYearAgent.get('/api/v1/me/modules');
    expect(result.status).toBe(200);
    expect(result.body.data).toHaveLength(1);
    expect(result.body.data[0]).toMatchObject({
      module_code: 'CAT101',
      module_name: 'Catalogue Foundations',
      lecturer_name: 'Catalogue Lecturer',
      quizzes_available: 1,
      new_resources_count: 1,
    });
  });

  it('shows first-year look-ahead previews without enrolment data or answer-bearing data', async () => {
    const first = await firstYearAgent.get('/api/v1/me/modules/lookahead');
    expect(first.status).toBe(200);
    expect(first.body.preview).toBe(true);
    expect(first.body.data.every((module) => module.year === 2)).toBe(true);
    const serialised = JSON.stringify(first.body);
    expect(serialised).not.toContain('resources');
    expect(serialised).not.toContain('quizzes');
    expect(serialised).not.toContain('answers');

    const second = await secondYearAgent.get('/api/v1/me/modules/lookahead');
    expect(second.status).toBe(200);
    expect(second.body.data).toEqual([]);
    expect(second.body.preview).toBe(false);
  });

  it('returns resource tiles only for enrolled student modules and lecturer-owned modules', async () => {
    const studentTiles = await firstYearAgent.get('/api/v1/resources/modules');
    expect(studentTiles.status).toBe(200);
    expect(studentTiles.body.data.map((module) => module.module_code)).toEqual([
      'CAT101',
    ]);
    expect(studentTiles.body.data[0]).toMatchObject({
      resource_count: 1,
    });

    const lecturerTiles = await lecturerAgent.get('/api/v1/resources/modules');
    expect(lecturerTiles.status).toBe(200);
    expect(lecturerTiles.body.data.map((module) => module.module_code)).toEqual(
      ['CAT101'],
    );
    expect(
      (
        await firstYearAgent.get(
          `/api/v1/modules/${otherModule.module_id}/resources`,
        )
      ).status,
    ).toBe(403);
  });

  it('rejects unauthenticated and invalid catalogue requests with the standard shape', async () => {
    expect((await request(app).get('/api/v1/me/modules')).status).toBe(401);
    const invalid = await firstYearAgent.get('/api/v1/me/modules?unknown=true');
    expect(invalid.status).toBe(422);
    expect(invalid.body.error).toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});
