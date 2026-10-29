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
  const topics = [];
  for (const name of [
    'Normalization',
    'Keys',
    'SQL',
    'Transactions',
    'Data modelling',
  ])
    topics.push(
      (
        await client.query(
          `INSERT INTO topics(module_id,name) VALUES($1,$2)
           ON CONFLICT(module_id,name) DO UPDATE SET name=EXCLUDED.name RETURNING topic_id`,
          [moduleRow.module_id, name],
        )
      ).rows[0],
    );
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
  let question;
  let correct;
  let wrong;
  const difficultyLevels = [1, 2, 3, 4, 5];
  for (let index = 0; index < 40; index += 1) {
    const inserted = (
      await client.query(
        `INSERT INTO questions(quiz_id,topic_id,question_text,marks,difficulty_level,explanation)
         VALUES($1,$2,$3,1,$4,$5) RETURNING question_id`,
        [
          quiz.quiz_id,
          topics[index % topics.length].topic_id,
          `Which database principle is demonstrated in scenario ${index + 1}?`,
          difficultyLevels[index % difficultyLevels.length],
          `Scenario ${index + 1} demonstrates a core normalization or key-design principle.`,
        ],
      )
    ).rows[0];
    const correctOption = (
      await client.query(
        `INSERT INTO question_options(question_id,option_text,is_correct)
         VALUES($1,$2,true) RETURNING option_id`,
        [inserted.question_id, `Supported database principle ${index + 1}`],
      )
    ).rows[0].option_id;
    const wrongOption = (
      await client.query(
        `INSERT INTO question_options(question_id,option_text,is_correct)
         VALUES($1,$2,false) RETURNING option_id`,
        [inserted.question_id, `Unrelated display choice ${index + 1}`],
      )
    ).rows[0].option_id;
    await client.query(
      `INSERT INTO question_options(question_id,option_text,is_correct) VALUES
       ($1,$2,false),($1,$3,false)`,
      [
        inserted.question_id,
        `Unsupported claim ${index + 1}`,
        `Contradictory claim ${index + 1}`,
      ],
    );
    if (index === 0) {
      question = inserted;
      correct = correctOption;
      wrong = wrongOption;
    }
  }
  for (let index = 0; index < 25; index += 1) {
    const practiceQuestion = (
      await client.query(
        `INSERT INTO questions(quiz_id,topic_id,question_text,marks,difficulty_level,explanation)
         VALUES($1,$2,$3,1,$4,$5) RETURNING question_id`,
        [
          practice.quiz_id,
          topics[index % topics.length].topic_id,
          `Practice database question ${index + 1}?`,
          difficultyLevels[index % difficultyLevels.length],
          `The correct option follows from the supplied database notes.`,
        ],
      )
    ).rows[0];
    await client.query(
      `INSERT INTO question_options(question_id,option_text,is_correct) VALUES
       ($1,$2,true),($1,$3,false),($1,$4,false),($1,$5,false)`,
      [
        practiceQuestion.question_id,
        `Practice answer ${index + 1}`,
        `Practice distractor A${index + 1}`,
        `Practice distractor B${index + 1}`,
        `Practice distractor C${index + 1}`,
      ],
    );
  }
  const practiceCoverage = (
    await client.query(
      `SELECT
         count(DISTINCT q.question_id)::int AS question_count,
         count(DISTINCT q.topic_id)::int AS topic_count,
         count(DISTINCT q.difficulty_level)::int AS level_count,
         count(DISTINCT q.question_id) FILTER (
           WHERE length(q.question_text) <= 140
             AND EXISTS (
               SELECT 1
               FROM question_options qo
               WHERE qo.question_id=q.question_id
                 AND qo.is_correct=true
                 AND length(qo.option_text) <= 60
             )
         )::int AS memory_eligible_count,
         count(DISTINCT q.question_id) FILTER (
           WHERE EXISTS (
             SELECT 1
             FROM question_options qo
             WHERE qo.question_id=q.question_id
               AND qo.is_correct=true
           )
             AND (
               SELECT count(*)
               FROM question_options qo
               WHERE qo.question_id=q.question_id
             ) >= 2
         )::int AS boss_eligible_count,
         count(DISTINCT q.question_id) FILTER (
           WHERE EXISTS (
             SELECT 1
             FROM question_options qo
             WHERE qo.question_id=q.question_id
               AND qo.is_correct=true
           )
             AND (
               SELECT count(*)
               FROM question_options qo
               WHERE qo.question_id=q.question_id
             ) >= 2
         )::int AS pixel_racer_eligible_count,
         count(*) FILTER (
           WHERE q.explanation IS NULL OR length(trim(q.explanation))=0
         )::int AS missing_explanation_count
       FROM questions q
       WHERE q.quiz_id=$1`,
      [practice.quiz_id],
    )
  ).rows[0];
  if (
    practiceCoverage.question_count < 25 ||
    practiceCoverage.topic_count < 5 ||
    practiceCoverage.level_count < 5 ||
    practiceCoverage.memory_eligible_count < 8 ||
    practiceCoverage.boss_eligible_count < 12 ||
    practiceCoverage.pixel_racer_eligible_count < 10 ||
    practiceCoverage.missing_explanation_count > 0
  ) {
    throw new Error('Demo practice quiz does not satisfy game seed coverage.');
  }
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
