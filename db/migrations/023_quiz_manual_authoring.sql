ALTER TABLE questions
  ADD COLUMN IF NOT EXISTS question_type text NOT NULL DEFAULT 'multiple_choice'
    CHECK (question_type IN ('multiple_choice','true_false','short_answer','code')),
  ADD COLUMN IF NOT EXISTS accepted_answers jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS ignore_punctuation boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS code_language text,
  ADD COLUMN IF NOT EXISTS code_before text,
  ADD COLUMN IF NOT EXISTS code_after text,
  ADD COLUMN IF NOT EXISTS expected_output text,
  ADD COLUMN IF NOT EXISTS display_order integer NOT NULL DEFAULT 0 CHECK (display_order >= 0),
  ADD CONSTRAINT questions_code_size CHECK (
    (code_before IS NULL OR length(code_before) <= 2000) AND
    (code_after IS NULL OR length(code_after) <= 2000) AND
    (expected_output IS NULL OR length(expected_output) <= 2000)
  );

ALTER TABLE student_answers
  ADD COLUMN IF NOT EXISTS answer_text text;

ALTER TABLE student_answers
  ALTER COLUMN option_id DROP NOT NULL;

ALTER TABLE student_answers
  ADD CONSTRAINT student_answers_has_answer CHECK (option_id IS NOT NULL OR answer_text IS NOT NULL);

CREATE INDEX IF NOT EXISTS questions_quiz_order_idx ON questions(quiz_id, display_order, question_id);
