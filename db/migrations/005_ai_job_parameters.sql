ALTER TABLE ai_generation_jobs ADD COLUMN IF NOT EXISTS question_count integer NOT NULL DEFAULT 5 CHECK (question_count BETWEEN 1 AND 50);
ALTER TABLE ai_generation_jobs ADD COLUMN IF NOT EXISTS difficulty text NOT NULL DEFAULT 'mixed' CHECK (length(trim(difficulty)) > 0);
