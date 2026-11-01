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
    const student = await upsertUser(
      `demo-student-${index}@example.com`,
      'student',
      `Demo Student ${index}`,
    );
    await client.query('UPDATE users SET student_year=$1 WHERE user_id=$2', [
      index <= 3 ? index : 1,
      student,
    ]);
    students.push(student);
  }
  const moduleRow = (
    await client.query(
      `INSERT INTO modules(lecturer_id,module_code,module_name,description,year,programme,offering,join_code) VALUES($1,'DEMO101','Database Systems','Foundations of data modelling, queries and reliable information systems.',1,'both','Semester 1','DEMOJOIN2026') ON CONFLICT(module_code) DO UPDATE SET module_name=EXCLUDED.module_name,description=EXCLUDED.description,year=EXCLUDED.year,programme=EXCLUDED.programme,offering=EXCLUDED.offering RETURNING module_id,join_code`,
      [lecturer],
    )
  ).rows[0];
  for (const module of [
    [
      'DEMO-IT101',
      'Programming Foundations',
      'Introduction to programming and problem solving.',
      1,
      'it',
    ],
    [
      'DEMO-BUS101',
      'Business Information Systems',
      'How organisations use information systems to make decisions.',
      1,
      'business',
    ],
    [
      'DEMO-IT201',
      'Software Engineering',
      'Collaborative design, testing and delivery of software.',
      2,
      'it',
    ],
    [
      'DEMO-BUS201',
      'Business Data Analysis',
      'Practical analysis for evidence-based business decisions.',
      2,
      'business',
    ],
    [
      'DEMO-IT301',
      'Cloud Applications',
      'Designing reliable applications for modern cloud platforms.',
      3,
      'it',
    ],
    [
      'DEMO-BUS301',
      'Digital Strategy',
      'Technology strategy, governance and digital transformation.',
      3,
      'business',
    ],
  ]) {
    await client.query(
      `INSERT INTO modules(lecturer_id,module_code,module_name,description,year,programme,offering,join_code)
       VALUES($1,$2,$3,$4,$5,$6,'Semester 1',$7)
       ON CONFLICT(module_code) DO UPDATE SET module_name=EXCLUDED.module_name,description=EXCLUDED.description,year=EXCLUDED.year,programme=EXCLUDED.programme,offering=EXCLUDED.offering`,
      [
        lecturer,
        module[0],
        module[1],
        module[2],
        module[3],
        module[4],
        `${module[0]}JOIN2026`,
      ],
    );
  }
  const itModule = (
    await client.query(
      "SELECT module_id FROM modules WHERE module_code='DEMO-IT101'",
    )
  ).rows[0];
  for (const student of students)
    await client.query(
      'INSERT INTO enrollments(student_id,module_id) VALUES($1,$2) ON CONFLICT DO NOTHING',
      [student, itModule.module_id],
    );
  const codeLabs = [
    [
      'Headings and paragraphs',
      'Build a clear heading and supporting paragraph.',
      '<h1>Welcome</h1><p>Learning by building.</p>',
      [
        {
          type: 'element_exists',
          selector: 'h1',
          hint: 'Add one main heading.',
        },
      ],
    ],
    [
      'Change text colour',
      'Use CSS to make the heading easy to read.',
      '<h1 class="headline">Colour me</h1>',
      [
        {
          type: 'computed_style_equals',
          selector: '.headline',
          property: 'color',
          expected: 'rgb(59, 75, 219)',
          hint: 'Choose a readable colour in CSS.',
        },
      ],
    ],
    [
      'Build a styled button',
      'Create a button and change its style.',
      '<button class="action">Start</button>',
      [
        {
          type: 'element_exists',
          selector: 'button',
          hint: 'Add a button element.',
        },
        {
          type: 'attribute_equals',
          selector: 'button',
          attribute: 'type',
          expected: 'button',
          hint: 'Give it a button type.',
        },
      ],
    ],
    [
      'Fix the broken HTML',
      'Repair the document structure so the message is visible.',
      '<p>Fix this message</p>',
      [
        {
          type: 'text_contains',
          selector: 'p',
          text: 'Fix',
          hint: 'Keep the message in a paragraph.',
        },
      ],
    ],
    [
      'Playground',
      'Try HTML, CSS and JavaScript safely in your browser.',
      '<h1>Try it</h1><p>Experiment here.</p>',
      [],
    ],
  ];
  for (const [title, instructions, starterHtml, checks] of codeLabs) {
    const exists = await client.query(
      'SELECT 1 FROM labs WHERE module_id=$1 AND title=$2 LIMIT 1',
      [itModule.module_id, title],
    );
    if (!exists.rowCount)
      await client.query(
        `INSERT INTO labs(module_id,kind,title,instructions,difficulty,status,created_by,config) VALUES($1,'code',$2,$3,$4,'published',$5,$6)`,
        [
          itModule.module_id,
          title,
          instructions,
          title === 'Playground' ? 1 : 2,
          lecturer,
          { starterHtml, starterCss: '', starterJs: '', checks },
        ],
      );
  }
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
  let resource = (
    await client.query(
      `SELECT resource_id FROM resources WHERE module_id=$1 AND title='Demo revision notes' ORDER BY created_date LIMIT 1`,
      [moduleRow.module_id],
    )
  ).rows[0];
  if (!resource)
    resource = (
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
  const getOrCreateQuiz = async (title, competitive) => {
    let row = (
      await client.query(
        `SELECT quiz_id FROM quizzes WHERE module_id=$1 AND title=$2 ORDER BY created_at LIMIT 1`,
        [moduleRow.module_id, title],
      )
    ).rows[0];
    if (!row)
      row = (
        await client.query(
          `INSERT INTO quizzes(module_id,resource_id,created_by,title,is_competitive,status) VALUES($1,$2,$3,$4,$5,'published') RETURNING quiz_id`,
          [
            moduleRow.module_id,
            resource.resource_id,
            lecturer,
            title,
            competitive,
          ],
        )
      ).rows[0];
    return row;
  };
  const quiz = await getOrCreateQuiz('Demo competitive quiz', true);
  const practice = await getOrCreateQuiz('Demo practice quiz', false);
  let question;
  let correct;
  let wrong;
  const difficultyLevels = [1, 2, 3, 4, 5];
  const competitiveQuestionCount = await client.query(
    'SELECT count(*)::int AS count FROM questions WHERE quiz_id=$1',
    [quiz.quiz_id],
  );
  if (competitiveQuestionCount.rows[0].count === 0)
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
  if (!question) {
    question = (
      await client.query(
        `SELECT question_id FROM questions WHERE quiz_id=$1 ORDER BY question_id LIMIT 1`,
        [quiz.quiz_id],
      )
    ).rows[0];
    correct = (
      await client.query(
        `SELECT option_id FROM question_options WHERE question_id=$1 AND is_correct=true ORDER BY option_id LIMIT 1`,
        [question.question_id],
      )
    ).rows[0].option_id;
    wrong = (
      await client.query(
        `SELECT option_id FROM question_options WHERE question_id=$1 AND is_correct=false ORDER BY option_id LIMIT 1`,
        [question.question_id],
      )
    ).rows[0].option_id;
  }
  const practiceQuestionCount = await client.query(
    'SELECT count(*)::int AS count FROM questions WHERE quiz_id=$1',
    [practice.quiz_id],
  );
  if (practiceQuestionCount.rows[0].count === 0)
    for (let index = 0; index < 25; index += 1) {
      const practiceQuestion = (
        await client.query(
          `INSERT INTO questions(quiz_id,topic_id,question_text,marks,difficulty_level,explanation)
         VALUES($1,$2,$3,1,$4,$5) RETURNING question_id`,
          [
            practice.quiz_id,
            topics[index % topics.length].topic_id,
            `Practice database question ${index + 1}?`,
            difficultyLevels[
              Math.floor(index / topics.length) % difficultyLevels.length
            ],
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
         count(DISTINCT q.topic_id || ':' || q.difficulty_level)::int AS timer_board_cell_count,
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
    practiceCoverage.timer_board_cell_count < 10 ||
    practiceCoverage.missing_explanation_count > 0
  ) {
    throw new Error('Demo practice quiz does not satisfy game seed coverage.');
  }
  for (const [index, student] of students.slice(0, 3).entries()) {
    const existingAttempt = await client.query(
      'SELECT 1 FROM quiz_attempts WHERE quiz_id=$1 AND student_id=$2 LIMIT 1',
      [quiz.quiz_id, student],
    );
    if (existingAttempt.rowCount) continue;
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
