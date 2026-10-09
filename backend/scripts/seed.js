// @ts-nocheck - seed values are runtime environment/data records.
import 'dotenv/config';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import { pool } from '../db.js';

const demoPassword = process.env.SEED_DEMO_PASSWORD || 'EduQuestDemo123!';
const hash = await bcrypt.hash(demoPassword, 10);
const client = await pool.connect();
const upsertUser = async (email, role, fullName) => {
  const existing = await client.query(
    'SELECT user_id FROM users WHERE lower(email)=lower($1)',
    [email],
  );
  if (existing.rowCount) {
    await client.query(
      'UPDATE users SET password_hash=$1,full_name=$2,role=$3 WHERE user_id=$4',
      [hash, fullName, role, existing.rows[0].user_id],
    );
    return existing.rows[0].user_id;
  }
  return (
    await client.query(
      'INSERT INTO users(email,password_hash,role,full_name) VALUES($1,$2,$3,$4) RETURNING user_id',
      [email.toLowerCase(), hash, role, fullName],
    )
  ).rows[0].user_id;
};
try {
  await client.query('BEGIN');
  const lecturer = await upsertUser(
    'demo-lecturer@example.com',
    'lecturer',
    'Demo Lecturer',
  );
  const students = [];
  for (let index = 1; index <= 5; index += 1) {
    students.push(
      await upsertUser(
        `demo-student-${index}@example.com`,
        'student',
        `Demo Student ${index}`,
      ),
    );
  }
  const moduleRow = (
    await client.query(
      `INSERT INTO modules(lecturer_id,module_code,module_name,join_code) VALUES($1,'DEMO101','Database Systems','DEMOJOIN2026') ON CONFLICT(module_code) DO UPDATE SET module_name=EXCLUDED.module_name RETURNING module_id,join_code`,
      [lecturer],
    )
  ).rows[0];
  for (const student of students)
    await client.query(
      'INSERT INTO enrollments(student_id,module_id) VALUES($1,$2) ON CONFLICT DO NOTHING',
      [student, moduleRow.module_id],
    );
  const groups = [];
  for (const [name, members] of [
    ['Alpha Group', students.slice(0, 3)],
    ['Beta Group', students.slice(3)],
  ]) {
    const group = (
      await client.query(
        `INSERT INTO study_groups(module_id,created_by,group_name) VALUES($1,$2,$3) ON CONFLICT(module_id,group_name) DO UPDATE SET group_name=EXCLUDED.group_name RETURNING group_id`,
        [moduleRow.module_id, lecturer, name],
      )
    ).rows[0];
    groups.push(group.group_id);
    for (const student of members)
      await client.query(
        'INSERT INTO group_members(group_id,student_id) VALUES($1,$2) ON CONFLICT DO NOTHING',
        [group.group_id, student],
      );
  }
  const uploadDir = path.resolve(process.env.UPLOAD_DIR || './uploads');
  await mkdir(uploadDir, { recursive: true });
  const resourcePath = path.join(uploadDir, 'demo-resource.txt');
  await writeFile(
    resourcePath,
    'Normalization, keys, dependencies, and relational design.',
  );
  const resource = (
    await client.query(
      `INSERT INTO resources(uploaded_by,module_id,title,resource_type,file_location,file_size_bytes) VALUES($1,$2,'Demo revision notes','txt',$3,$4) RETURNING resource_id`,
      [lecturer, moduleRow.module_id, resourcePath, 58],
    )
  ).rows[0];
  const topic = (
    await client.query(
      `INSERT INTO topics(module_id,name) VALUES($1,'Normalization') ON CONFLICT(module_id,name) DO UPDATE SET name=EXCLUDED.name RETURNING topic_id`,
      [moduleRow.module_id],
    )
  ).rows[0];
  const quiz = (
    await client.query(
      `INSERT INTO quizzes(module_id,resource_id,created_by,title,is_competitive,status) VALUES($1,$2,$3,'Demo competitive quiz',true,'published') RETURNING quiz_id`,
      [moduleRow.module_id, resource.resource_id, lecturer],
    )
  ).rows[0];
  const practice = (
    await client.query(
      `INSERT INTO quizzes(module_id,resource_id,created_by,title,is_competitive,status) VALUES($1,$2,$3,'Demo practice quiz',false,'published') RETURNING quiz_id`,
      [moduleRow.module_id, resource.resource_id, lecturer],
    )
  ).rows[0];
  const question = (
    await client.query(
      `INSERT INTO questions(quiz_id,topic_id,question_text,marks) VALUES($1,$2,'What does a primary key provide?',1) RETURNING question_id`,
      [quiz.quiz_id, topic.topic_id],
    )
  ).rows[0];
  const correct = (
    await client.query(
      `INSERT INTO question_options(question_id,option_text,is_correct) VALUES($1,'A unique row identity',true) RETURNING option_id`,
      [question.question_id],
    )
  ).rows[0].option_id;
  const wrong = (
    await client.query(
      `INSERT INTO question_options(question_id,option_text,is_correct) VALUES($1,'A display colour',false) RETURNING option_id`,
      [question.question_id],
    )
  ).rows[0].option_id;
  await client.query(
    `INSERT INTO questions(quiz_id,topic_id,question_text,marks) VALUES($1,$2,'What is a practice activity?',1)`,
    [practice.quiz_id, topic.topic_id],
  );
  for (const [index, student] of students.slice(0, 3).entries()) {
    const attempt = (
      await client.query(
        `INSERT INTO quiz_attempts(quiz_id,student_id,score,start_time,completion_time,is_scored) VALUES($1,$2,$3,now()-interval '10 minutes',now()-($4 || ' minutes')::interval,true) RETURNING attempt_id`,
        [quiz.quiz_id, student, index === 0 ? 1 : 0, String(index)],
      )
    ).rows[0];
    await client.query(
      `INSERT INTO student_answers(attempt_id,question_id,option_id,is_correct) VALUES($1,$2,$3,$4)`,
      [
        attempt.attempt_id,
        question.question_id,
        index === 0 ? correct : wrong,
        index === 0,
      ],
    );
  }
  await client.query('COMMIT');
  console.log('Seeded EduQuest demo data.');
  console.log(`Lecturer: demo-lecturer@example.com / ${demoPassword}`);
  for (let index = 1; index <= 5; index += 1)
    console.log(
      `Student ${index}: demo-student-${index}@example.com / ${demoPassword}`,
    );
  console.log(`Module: DEMO101 / JoinCode ${moduleRow.join_code}`);
  console.log(`Groups: ${groups.length}; quizzes: competitive and practice`);
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
  await pool.end();
}
