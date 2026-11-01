ALTER TABLE quizzes
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS quizzes_module_created_at_idx
  ON quizzes(module_id, created_at DESC, quiz_id DESC);
