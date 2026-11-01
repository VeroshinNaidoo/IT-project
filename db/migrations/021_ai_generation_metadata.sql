ALTER TABLE ai_generation_jobs
  ADD COLUMN IF NOT EXISTS quiz_mode text NOT NULL DEFAULT 'practice'
    CHECK (quiz_mode IN ('practice', 'competitive')),
  ADD COLUMN IF NOT EXISTS quiz_title text NOT NULL DEFAULT 'Generated quiz'
    CHECK (length(trim(quiz_title)) > 0),
  ADD COLUMN IF NOT EXISTS closes_at timestamptz;
