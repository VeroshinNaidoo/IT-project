CREATE TABLE IF NOT EXISTS labs (
  lab_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id uuid NOT NULL REFERENCES modules(module_id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('code','spreadsheet','calculator','scenario')),
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 160),
  instructions text NOT NULL CHECK (length(trim(instructions)) BETWEEN 1 AND 5000),
  difficulty smallint NOT NULL CHECK (difficulty BETWEEN 1 AND 5),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  created_by uuid NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  config jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(config) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS labs_module_status_idx ON labs(module_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS lab_attempts (
  attempt_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_id uuid NOT NULL REFERENCES labs(lab_id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  submission jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(submission) = 'object'),
  checks_passed integer NOT NULL DEFAULT 0 CHECK (checks_passed >= 0),
  checks_total integer NOT NULL DEFAULT 0 CHECK (checks_total >= 0 AND checks_passed <= checks_total),
  completed boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(lab_id, student_id)
);

CREATE INDEX IF NOT EXISTS lab_attempts_student_idx ON lab_attempts(student_id, updated_at DESC);
