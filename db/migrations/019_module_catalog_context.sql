ALTER TABLE users
  ADD COLUMN IF NOT EXISTS student_year smallint DEFAULT 1;

ALTER TABLE users ALTER COLUMN student_year SET DEFAULT 1;

UPDATE users
SET student_year = 1
WHERE role = 'student' AND student_year IS NULL;

ALTER TABLE users
  ADD CONSTRAINT users_student_year_valid
    CHECK (student_year IS NULL OR student_year BETWEEN 1 AND 3),
  ADD CONSTRAINT users_student_year_for_students
    CHECK (role = 'lecturer' OR student_year IS NOT NULL);

ALTER TABLE modules
  ADD COLUMN IF NOT EXISTS year smallint NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS programme text NOT NULL DEFAULT 'both',
  ADD COLUMN IF NOT EXISTS offering text NOT NULL DEFAULT 'Semester 1',
  ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '';

UPDATE modules
SET year = CASE
  WHEN module_code ~ '[123]' THEN substring(module_code FROM '[123]')::smallint
  ELSE 1
END,
  programme = 'both',
  offering = 'Semester 1',
  description = COALESCE(description, '')
;

ALTER TABLE modules
  ADD CONSTRAINT modules_year_valid CHECK (year BETWEEN 1 AND 3),
  ADD CONSTRAINT modules_programme_valid CHECK (programme IN ('it', 'business', 'both')),
  ADD CONSTRAINT modules_offering_nonempty CHECK (length(trim(offering)) > 0),
  ADD CONSTRAINT modules_description_length CHECK (char_length(description) <= 1000);

CREATE INDEX IF NOT EXISTS modules_year_programme_idx
  ON modules(year, programme);
