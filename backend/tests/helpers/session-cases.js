// @ts-nocheck
import crypto from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import request from 'supertest';
import { expect } from 'vitest';
export const sessionRouteSpecs = Object.fromEntries(
  [
    'GET /api/v1/me/sessions',
    'GET /api/v1/groups/:groupId/sessions',
    'POST /api/v1/groups/:groupId/sessions',
    'PATCH /api/v1/groups/:groupId/sessions/:sessionId',
    'POST /api/v1/groups/:groupId/sessions/:sessionId/cancel',
    'POST /api/v1/groups/:groupId/sessions/:sessionId/duplicate',
    'GET /api/v1/groups/:groupId/sessions/calendar.ics',
    'GET /api/v1/groups/:groupId/sessions/preparation-options',
    'GET /api/v1/groups/:groupId/sessions/:sessionId/resources/:resourceId',
    'GET /api/v1/groups/:groupId/sessions/:sessionId/calendar.ics',
    'GET /api/v1/groups/:groupId/sessions/:sessionId',
    'PUT /api/v1/groups/:groupId/sessions/:sessionId/rsvp',
    'GET /api/v1/me/notifications',
    'POST /api/v1/me/notifications/:notificationId/read',
  ].map((r) => [r, [r.slice(r.indexOf(' ') + 1), 'student']]),
);
export const validSession = () => ({
  title: 'Database revision',
  topic: 'Normalisation',
  description: 'Practise together',
  preparationNotes: 'Read the notes',
  startsAt: new Date(Date.now() + 86400000).toISOString(),
  endsAt: new Date(Date.now() + 90000000).toISOString(),
  mode: 'in_person',
  location: 'Room A',
  resourceIds: [],
});
export async function sessionFixture(pool) {
  const tag = crypto.randomUUID();
  const f = {};
  for (const role of ['leader', 'member', 'outsider', 'lecturer', 'coLeader']) {
    const user = (
      await pool.query(
        "INSERT INTO users(email,password_hash,role,full_name,first_name,student_type,student_year) VALUES($1,'test-hash',$2,$3,'Study',$4,$5) RETURNING user_id",
        [
          `${role.toLowerCase()}-${tag}@example.com`,
          role === 'lecturer' ? 'lecturer' : 'student',
          `Study ${role}`,
          role === 'lecturer' ? null : 'it',
          role === 'lecturer' ? null : 1,
        ],
      )
    ).rows[0].user_id;
    const token = crypto.randomUUID();
    await pool.query(
      "INSERT INTO sessions(user_id,token_hash,expires_at) VALUES($1,$2,now()+interval '1 day')",
      [user, crypto.createHash('sha256').update(token).digest('hex')],
    );
    f[role] = { id: user, cookie: `eduquest_session=${token}` };
  }
  f.moduleId = (
    await pool.query(
      "INSERT INTO modules(lecturer_id,module_code,module_name,join_code) VALUES($1,$2,'Session module',$3) RETURNING module_id",
      [f.lecturer.id, tag.slice(0, 8), tag],
    )
  ).rows[0].module_id;
  for (const role of ['leader', 'member', 'coLeader'])
    await pool.query(
      'INSERT INTO enrollments(student_id,module_id) VALUES($1,$2)',
      [f[role].id, f.moduleId],
    );
  f.groupId = (
    await pool.query(
      "INSERT INTO study_groups(module_id,created_by,group_name) VALUES($1,$2,'Session group') RETURNING group_id",
      [f.moduleId, f.leader.id],
    )
  ).rows[0].group_id;
  for (const role of ['leader', 'member', 'coLeader'])
    await pool.query(
      'INSERT INTO group_members(group_id,student_id) VALUES($1,$2)',
      [f.groupId, f[role].id],
    );
  await pool.query(
    "INSERT INTO group_leaders VALUES($1,$2,'leader'),($1,$3,'co-leader')",
    [f.groupId, f.leader.id, f.coLeader.id],
  );
  const file = path.resolve(
    process.env.UPLOAD_DIR || 'uploads',
    `session-${tag}.txt`,
  );
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, 'Study preparation fixture');
  f.resourceId = (
    await pool.query(
      "INSERT INTO resources(uploaded_by,module_id,title,resource_type,file_location,file_size_bytes) VALUES($1,$2,'Preparation','txt',$3,25) RETURNING resource_id",
      [f.lecturer.id, f.moduleId, file],
    )
  ).rows[0].resource_id;
  f.base = `/api/v1/groups/${f.groupId}/sessions`;
  return f;
}
export async function assertSessionRoute(route, app, pool) {
  const f = await sessionFixture(pool);
  const send = (role, method, url, body) => {
    let r = request(app)[method](url);
    if (role) r = r.set('Cookie', f[role]?.cookie || role);
    return method === 'get' ? r.query(body || {}) : r.send(body || {});
  };
  const made = await send('leader', 'post', f.base, {
    ...validSession(),
    resourceIds: [f.resourceId],
  });
  expect(made.status).toBe(201);
  const id = made.body.sessions[0].session_id;
  const notification = (
    await pool.query(
      'SELECT notification_id FROM notifications WHERE user_id=$1 AND session_id=$2',
      [f.leader.id, id],
    )
  ).rows[0].notification_id;
  const [method, template] = route.split(' ');
  const verb = method.toLowerCase();
  const url = template
    .replace(':groupId', f.groupId)
    .replace(':sessionId', id)
    .replace(':resourceId', f.resourceId)
    .replace(':notificationId', notification);
  let body = verb === 'get' ? {} : validSession();
  if (url.endsWith('/cancel')) body = { reason: 'Timetable changed' };
  if (url.endsWith('/duplicate'))
    body = { startsAt: validSession().startsAt, endsAt: validSession().endsAt };
  if (url.endsWith('/rsvp')) body = { response: 'going' };
  if (url.endsWith('/read')) body = {};
  expect((await send(null, verb, url, body)).status).toBe(401);
  expect(
    (await send('eduquest_session=revoked-test-session', verb, url, body))
      .status,
  ).toBe(401);
  const privateList = template.startsWith('/api/v1/me/') && verb === 'get';
  const denied = await send('outsider', verb, url, body);
  expect(denied.status).toBe(privateList ? 200 : 403);
  if (privateList) expect(denied.body.data).toEqual([]);
  const leaderOnly = ['post', 'patch'].includes(verb) && !url.endsWith('/read');
  if (leaderOnly) {
    expect((await send('member', verb, url, body)).status).toBe(403);
    expect((await send('lecturer', verb, url, body)).status).toBe(403);
  }
  if (url.endsWith('/rsvp'))
    expect((await send('lecturer', verb, url, body)).status).toBe(403);
  expect(
    (await send('leader', verb, url, { ...body, unknownField: true })).status,
  ).toBe(422);
  if (leaderOnly && !url.endsWith('/duplicate')) {
    const bad = {
      ...body,
      ...(url.endsWith('/cancel') ? { reason: 'fuck' } : { title: 'fuck' }),
    };
    const r = await send('leader', verb, url, bad);
    expect(r.status).toBe(422);
    expect(JSON.stringify(r.body)).not.toContain('fuck');
  }
  const success = await send('leader', verb, url, body);
  expect(success.status).toBe(
    verb === 'post' && (url === f.base || url.endsWith('/duplicate'))
      ? 201
      : 200,
  );
  expect(JSON.stringify(success.body)).not.toMatch(
    /password_hash|token_hash|secret_encrypted|is_correct/,
  );
  if (url.endsWith('.ics')) expect(success.text).toContain('BEGIN:VCALENDAR');
  else if (privateList || (url === f.base && verb === 'get'))
    expect(success.body.data).toBeInstanceOf(Array);
  else if (url.endsWith('/rsvp')) expect(success.body.response).toBe('going');
  else if (url.endsWith('/read'))
    expect(success.body.notification.read_at).toBeTruthy();
  else if (url.endsWith('/preparation-options'))
    expect(success.body.resources[0].title).toBe('Preparation');
  else if (url.includes('/resources/'))
    expect(success.text || success.body.toString()).toContain(
      'Study preparation fixture',
    );
  else expect(success.body.session || success.body.sessions).toBeTruthy();
}
