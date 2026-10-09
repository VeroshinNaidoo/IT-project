// @ts-nocheck - Supertest agents and dynamic API fixtures are runtime values.
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';

process.env.NODE_ENV = 'development';
process.env.COOKIE_SECURE = 'false';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
const { app } = await import('../src/app.js');
const { pool } = await import('../db.js');

describe('Milestones 2–5 API authorization and profanity boundary', () => {
  let lecturerAgent;
  let studentAgent;
  let studentTwoAgent;
  let studentThreeAgent;
  let moduleRecord;
  let resourceRecord;
  let groupRecord;

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash('StrongLecturerPassword1!', 12);
    await pool.query(
      `INSERT INTO users(email,password_hash,role,full_name) VALUES ('api-lecturer@example.com',$1,'lecturer','API Lecturer') ON CONFLICT DO NOTHING`,
      [passwordHash],
    );
    lecturerAgent = request.agent(app);
    studentAgent = request.agent(app);
    studentTwoAgent = request.agent(app);
    studentThreeAgent = request.agent(app);
    await lecturerAgent.post('/api/v1/auth/login').send({
      email: 'api-lecturer@example.com',
      password: 'StrongLecturerPassword1!',
    });
    await studentAgent.post('/api/v1/auth/register').send({
      email: 'api-student@example.com',
      password: 'StrongStudentPassword1!',
      fullName: 'API Student',
    });
    await studentTwoAgent.post('/api/v1/auth/register').send({
      email: 'api-student-two@example.com',
      password: 'StrongStudentPassword1!',
      fullName: 'API Student Two',
    });
    await studentThreeAgent.post('/api/v1/auth/register').send({
      email: 'api-student-three@example.com',
      password: 'StrongStudentPassword1!',
      fullName: 'API Student Three',
    });
  });

  it('rejects unauthenticated protected access with 401', async () => {
    expect((await request(app).get('/api/v1/modules')).status).toBe(401);
  });

  it('rejects wrong-role module creation with 403', async () => {
    expect(
      (
        await studentAgent
          .post('/api/v1/modules')
          .send({ moduleCode: 'API101', moduleName: 'API Databases' })
      ).status,
    ).toBe(403);
  });

  it('rejects profanity directly at the backend boundary with generic 422', async () => {
    const result = await request(app).post('/api/v1/auth/register').send({
      email: 'bad-text@example.com',
      password: 'StrongStudentPassword1!',
      fullName: 'fuck',
    });
    expect(result.status).toBe(422);
    expect(JSON.stringify(result.body)).not.toContain('fuck');
  });

  it('creates a lecturer-owned module with a join code', async () => {
    const result = await lecturerAgent
      .post('/api/v1/modules')
      .send({ moduleCode: 'API101', moduleName: 'API Databases' });
    expect(result.status).toBe(201);
    expect(result.body.module.join_code).toHaveLength(16);
    moduleRecord = result.body.module;
  });

  it('enrols a student using the join code and lists the module', async () => {
    expect(
      (
        await studentAgent
          .post('/api/v1/enrollments')
          .send({ joinCode: moduleRecord.join_code })
      ).status,
    ).toBe(201);
    const result = await studentAgent.get('/api/v1/modules');
    expect(result.status).toBe(200);
    expect(
      result.body.data.some(
        (module) => module.module_id === moduleRecord.module_id,
      ),
    ).toBe(true);
  });

  it('creates and joins a study group as an enrolled student', async () => {
    const created = await studentAgent
      .post(`/api/v1/modules/${moduleRecord.module_id}/groups`)
      .send({ groupName: 'API Study Group' });
    expect(created.status).toBe(201);
    groupRecord = created.body.group;
    expect(
      (
        await studentTwoAgent
          .post('/api/v1/enrollments')
          .send({ joinCode: moduleRecord.join_code })
      ).status,
    ).toBe(201);
    expect(
      (
        await studentTwoAgent.post(
          `/api/v1/groups/${created.body.group.group_id}/join`,
        )
      ).status,
    ).toBe(201);
  });

  it('requires lecturer ownership for resource upload', async () => {
    const response = await studentAgent
      .post(`/api/v1/modules/${moduleRecord.module_id}/resources`)
      .field('title', 'Notes')
      .attach('file', Buffer.from('%PDF-1.4'), 'notes.pdf');
    expect(response.status).toBe(403);
  });

  it('accepts a lecturer resource within the configured size limit', async () => {
    const response = await lecturerAgent
      .post(`/api/v1/modules/${moduleRecord.module_id}/resources`)
      .field('title', 'Revision Notes')
      .attach('file', Buffer.from('%PDF-1.4'), 'notes.pdf');
    expect(response.status).toBe(201);
    resourceRecord = response.body.resource;
  });

  it('rejects a spoofed file whose extension does not match its magic bytes', async () => {
    const response = await lecturerAgent
      .post(`/api/v1/modules/${moduleRecord.module_id}/resources`)
      .field('title', 'Spoofed Notes')
      .attach('file', Buffer.from('not a PDF'), 'spoof.pdf');
    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('FILE_TYPE_NOT_ALLOWED');
  });

  it('enforces group-scoped resource visibility', async () => {
    const groupResource = await lecturerAgent
      .post(`/api/v1/modules/${moduleRecord.module_id}/resources`)
      .field('title', 'Group Notes')
      .field('groupId', groupRecord.group_id)
      .attach('file', Buffer.from('group notes'), 'group.txt');
    expect(groupResource.status).toBe(201);
    await studentThreeAgent
      .post('/api/v1/enrollments')
      .send({ joinCode: moduleRecord.join_code });
    const outsider = await studentThreeAgent.get(
      `/api/v1/modules/${moduleRecord.module_id}/resources`,
    );
    expect(outsider.status).toBe(200);
    expect(
      outsider.body.data.some(
        (item) => item.resource_id === groupResource.body.resource.resource_id,
      ),
    ).toBe(false);
  });

  it('queues an AI job and restricts polling to its requester', async () => {
    const queued = await lecturerAgent.post(
      `/api/v1/resources/${resourceRecord.resource_id}/generation-jobs`,
    );
    expect(queued.status).toBe(202);
    expect(queued.body.job.status).toBe('queued');
    const status = await lecturerAgent.get(
      `/api/v1/ai-generation-jobs/${queued.body.job.job_id}`,
    );
    expect(status.status).toBe(200);
    expect(status.body.job.status).toBe('queued');
    expect(
      (
        await studentAgent.get(
          `/api/v1/ai-generation-jobs/${queued.body.job.job_id}`,
        )
      ).status,
    ).toBe(404);
  });

  it('revokes the server-side session on logout', async () => {
    expect((await lecturerAgent.post('/api/v1/auth/logout')).status).toBe(204);
    expect((await lecturerAgent.get('/api/v1/modules')).status).toBe(401);
    await lecturerAgent.post('/api/v1/auth/login').send({
      email: 'api-lecturer@example.com',
      password: 'StrongLecturerPassword1!',
    });
  });

  it('rejects invalid login without revealing account state', async () => {
    const response = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'api-lecturer@example.com', password: 'wrong-password' });
    expect(response.status).toBe(401);
    expect(response.body.error.message).toBe('Email or password is incorrect.');
  });
});
