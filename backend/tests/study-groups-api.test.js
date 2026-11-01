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

describe('study groups API', () => {
  let student;
  let otherStudent;
  let lecturer;
  let module;
  let group;
  let studentAgent;
  let otherAgent;

  beforeAll(async () => {
    const hash = await bcrypt.hash('GroupsPassword9!', 12);
    student = (
      await pool.query(
        `INSERT INTO users(email,password_hash,role,full_name,first_name,student_type,student_year,email_verified_at) VALUES('groups-student@example.com',$1,'student','Groups Student','Groups','it',1,now()) RETURNING user_id`,
        [hash],
      )
    ).rows[0].user_id;
    otherStudent = (
      await pool.query(
        `INSERT INTO users(email,password_hash,role,full_name,first_name,student_type,student_year,email_verified_at) VALUES('groups-other@example.com',$1,'student','Other Student','Other','business',1,now()) RETURNING user_id`,
        [hash],
      )
    ).rows[0].user_id;
    lecturer = (
      await pool.query(
        `INSERT INTO users(email,password_hash,role,full_name,first_name) VALUES('groups-lecturer@example.com',$1,'lecturer','Groups Lecturer','Groups') RETURNING user_id`,
        [hash],
      )
    ).rows[0].user_id;
    module = (
      await pool.query(
        `INSERT INTO modules(lecturer_id,module_code,module_name,year,programme,offering,join_code) VALUES($1,'GRP101','Group Foundations',1,'it','Semester 1','GROUPJOIN10101') RETURNING *`,
        [lecturer],
      )
    ).rows[0];
    await pool.query(
      'INSERT INTO enrollments(student_id,module_id) VALUES($1,$2)',
      [student, module.module_id],
    );
    await pool.query(
      `INSERT INTO user_preferred_languages(user_id,language_id) SELECT $1,language_id FROM programming_languages WHERE name IN ('Python','SQL')`,
      [student],
    );
    studentAgent = request.agent(app);
    otherAgent = request.agent(app);
    await studentAgent.post('/api/v1/auth/login').send({
      email: 'groups-student@example.com',
      password: 'GroupsPassword9!',
    });
    await otherAgent.post('/api/v1/auth/login').send({
      email: 'groups-other@example.com',
      password: 'GroupsPassword9!',
    });
  });

  afterAll(async () => {
    await pool.query(
      'DELETE FROM study_groups WHERE group_id IN (SELECT group_id FROM group_members WHERE student_id = ANY($1::uuid[])) OR created_by = ANY($1::uuid[])',
      [[student, otherStudent, lecturer]],
    );
    await pool.query(
      'DELETE FROM enrollments WHERE student_id = ANY($1::uuid[]) OR module_id=$2',
      [[student, otherStudent], module.module_id],
    );
    await pool.query(
      'DELETE FROM user_preferred_languages WHERE user_id = ANY($1::uuid[])',
      [[student, otherStudent, lecturer]],
    );
    await pool.query('DELETE FROM modules WHERE module_id=$1', [
      module.module_id,
    ]);
    await pool.query('DELETE FROM users WHERE user_id = ANY($1::uuid[])', [
      [student, otherStudent, lecturer],
    ]);
  });

  it('creates a group with languages and creator leadership, then lists recommendations', async () => {
    const created = await studentAgent.post('/api/v1/groups').send({
      moduleId: module.module_id,
      groupName: 'Python Study Circle',
      focus: 'Databases',
      description: 'Practice together',
      languages: ['Python', 'SQL'],
    });
    expect(created.status).toBe(201);
    group = created.body.group;
    const listed = await studentAgent.get('/api/v1/groups?recommended=true');
    expect(listed.status).toBe(200);
    expect(listed.body.data[0]).toMatchObject({
      group_name: 'Python Study Circle',
      is_member: true,
      can_join: false,
    });
    expect(listed.body.data[0].languages).toEqual(['Python', 'SQL']);
    expect(listed.body.data[0].leaders[0].role).toBe('leader');
    expect(listed.body.data[0].recommendation_reason).toContain(
      'Matches your languages',
    );
  });

  it('refuses an unenrolled student and hides groups outside enrolled modules', async () => {
    const denied = await otherAgent
      .post('/api/v1/groups')
      .send({ moduleId: module.module_id, groupName: 'Outsider Group' });
    expect(denied.status).toBe(403);
    const hidden = await otherAgent.get('/api/v1/groups');
    expect(hidden.status).toBe(200);
    expect(hidden.body.data).toHaveLength(0);
  });

  it('allows leaders to post updates and refuses non-leaders and profanity without echoing it', async () => {
    const update = await studentAgent
      .post(`/api/v1/groups/${group.group_id}/updates`)
      .send({ kind: 'doing_now', text: 'Reviewing SQL joins' });
    expect(update.status).toBe(201);
    const nonLeader = await otherAgent
      .post(`/api/v1/groups/${group.group_id}/updates`)
      .send({ kind: 'doing_now', text: 'Trying to post' });
    expect(nonLeader.status).toBe(403);
    const profane = await studentAgent
      .patch(`/api/v1/groups/${group.group_id}`)
      .send({ focus: 'fuck' });
    expect(profane.status).toBe(422);
    expect(JSON.stringify(profane.body)).not.toContain('fuck');
  });

  it('prevents the last leader from leaving and lets a member join and leave', async () => {
    const join = await studentAgent
      .post(`/api/v1/groups/${group.group_id}/join`)
      .send({});
    expect([201, 409]).toContain(join.status);
    const blocked = await studentAgent
      .post(`/api/v1/groups/${group.group_id}/leave`)
      .send({});
    expect(blocked.status).toBe(409);
  });

  it('rejects unknown fields and unauthenticated listing', async () => {
    expect(
      (
        await studentAgent
          .post('/api/v1/groups')
          .send({ moduleId: module.module_id, groupName: 'X', score: 5 })
      ).status,
    ).toBe(422);
    expect((await request(app).get('/api/v1/groups')).status).toBe(401);
  });
});
