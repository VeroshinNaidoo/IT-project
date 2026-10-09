CREATE TYPE user_role AS ENUM ('student', 'lecturer');
CREATE TYPE quiz_status AS ENUM ('draft', 'published');
CREATE TYPE game_type AS ENUM ('flashcards', 'speed_round', 'match_pairs');
CREATE TYPE ai_job_status AS ENUM ('queued', 'running', 'succeeded', 'failed');

CREATE TABLE users (
  user_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL CHECK (email = lower(email)),
  password_hash text NOT NULL,
  role user_role NOT NULL,
  full_name text NOT NULL CHECK (length(trim(full_name)) > 0),
  created_date timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sessions (
  session_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  CHECK (expires_at > created_at),
  CHECK (revoked_at IS NULL OR revoked_at >= created_at)
);

CREATE TABLE modules (
  module_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lecturer_id uuid NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  module_code text NOT NULL UNIQUE CHECK (length(trim(module_code)) > 0),
  module_name text NOT NULL CHECK (length(trim(module_name)) > 0),
  join_code text NOT NULL UNIQUE CHECK (length(trim(join_code)) >= 12),
  created_date timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE enrollments (
  enrolment_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  module_id uuid NOT NULL REFERENCES modules(module_id) ON DELETE RESTRICT,
  enrolled_date timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, module_id)
);

CREATE TABLE study_groups (
  group_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id uuid NOT NULL REFERENCES modules(module_id) ON DELETE RESTRICT,
  created_by uuid NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  group_name text NOT NULL CHECK (length(trim(group_name)) > 0),
  created_date timestamptz NOT NULL DEFAULT now(),
  UNIQUE (module_id, group_name)
);

CREATE TABLE group_members (
  group_id uuid NOT NULL REFERENCES study_groups(group_id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  joined_date timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, student_id)
);

CREATE TABLE resources (
  resource_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  uploaded_by uuid NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  module_id uuid NOT NULL REFERENCES modules(module_id) ON DELETE RESTRICT,
  group_id uuid REFERENCES study_groups(group_id) ON DELETE RESTRICT,
  title text NOT NULL CHECK (length(trim(title)) > 0),
  resource_type text NOT NULL,
  file_location text NOT NULL,
  file_size_bytes bigint NOT NULL CHECK (file_size_bytes > 0),
  created_date timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE topics (
  topic_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id uuid NOT NULL REFERENCES modules(module_id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (length(trim(name)) > 0),
  UNIQUE (module_id, name)
);

CREATE TABLE quizzes (
  quiz_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id uuid NOT NULL REFERENCES modules(module_id) ON DELETE RESTRICT,
  resource_id uuid REFERENCES resources(resource_id) ON DELETE RESTRICT,
  created_by uuid NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  title text NOT NULL CHECK (length(trim(title)) > 0),
  is_competitive boolean NOT NULL DEFAULT false,
  max_scored_attempts integer NOT NULL DEFAULT 1 CHECK (max_scored_attempts >= 1),
  status quiz_status NOT NULL DEFAULT 'draft',
  closes_at timestamptz,
  CHECK (NOT is_competitive OR max_scored_attempts = 1)
);

CREATE TABLE games (
  game_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id uuid NOT NULL REFERENCES quizzes(quiz_id) ON DELETE CASCADE,
  game_type game_type NOT NULL,
  created_date timestamptz NOT NULL DEFAULT now(),
  UNIQUE (quiz_id, game_type)
);

CREATE TABLE questions (
  question_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id uuid NOT NULL REFERENCES quizzes(quiz_id) ON DELETE CASCADE,
  topic_id uuid REFERENCES topics(topic_id) ON DELETE RESTRICT,
  question_text text NOT NULL CHECK (length(trim(question_text)) > 0),
  marks numeric(8,2) NOT NULL CHECK (marks > 0),
  UNIQUE (question_id, quiz_id)
);

CREATE TABLE question_options (
  option_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES questions(question_id) ON DELETE CASCADE,
  option_text text NOT NULL CHECK (length(trim(option_text)) > 0),
  is_correct boolean NOT NULL DEFAULT false,
  UNIQUE (question_id, option_id)
);

CREATE TABLE quiz_attempts (
  attempt_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id uuid NOT NULL REFERENCES quizzes(quiz_id) ON DELETE RESTRICT,
  student_id uuid NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  score numeric(10,2) CHECK (score IS NULL OR score >= 0),
  start_time timestamptz NOT NULL DEFAULT now(),
  completion_time timestamptz,
  is_scored boolean NOT NULL DEFAULT false,
  CHECK (completion_time IS NULL OR completion_time >= start_time),
  CHECK (is_scored = false OR completion_time IS NOT NULL),
  UNIQUE (attempt_id, quiz_id)
);

CREATE TABLE student_answers (
  answer_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id uuid NOT NULL REFERENCES quiz_attempts(attempt_id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES questions(question_id) ON DELETE RESTRICT,
  option_id uuid NOT NULL REFERENCES question_options(option_id) ON DELETE RESTRICT,
  is_correct boolean NOT NULL,
  UNIQUE (attempt_id, question_id)
);

CREATE TABLE ai_generation_jobs (
  job_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_by uuid NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  resource_id uuid NOT NULL REFERENCES resources(resource_id) ON DELETE RESTRICT,
  status ai_job_status NOT NULL DEFAULT 'queued',
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  error_code text,
  quiz_id uuid REFERENCES quizzes(quiz_id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
