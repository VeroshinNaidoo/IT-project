ALTER TABLE study_groups
  ADD COLUMN IF NOT EXISTS focus text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'module';

ALTER TABLE study_groups
  ADD CONSTRAINT study_groups_visibility_valid
  CHECK (visibility IN ('module', 'members', 'private'));
ALTER TABLE study_groups
  ADD CONSTRAINT study_groups_focus_length CHECK (length(focus) <= 200),
  ADD CONSTRAINT study_groups_description_length CHECK (length(description) <= 500);

CREATE TABLE IF NOT EXISTS group_languages (
  group_id uuid NOT NULL REFERENCES study_groups(group_id) ON DELETE CASCADE,
  language_id uuid NOT NULL REFERENCES programming_languages(language_id) ON DELETE RESTRICT,
  PRIMARY KEY (group_id, language_id)
);

CREATE TABLE IF NOT EXISTS group_leaders (
  group_id uuid NOT NULL REFERENCES study_groups(group_id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  role text NOT NULL DEFAULT 'leader' CHECK (role IN ('leader', 'co-leader')),
  PRIMARY KEY (group_id, student_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS group_one_leader_idx
  ON group_leaders(group_id) WHERE role = 'leader';

CREATE TABLE IF NOT EXISTS group_updates (
  update_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES study_groups(group_id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('doing_now', 'next_up')),
  text text NOT NULL CHECK (length(trim(text)) BETWEEN 1 AND 200),
  topic_id uuid REFERENCES topics(topic_id) ON DELETE SET NULL,
  planned_for timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO group_leaders(group_id, student_id, role)
SELECT g.group_id,
       COALESCE(
         CASE WHEN u.role = 'student' THEN g.created_by END,
         (SELECT gm.student_id FROM group_members gm WHERE gm.group_id = g.group_id ORDER BY gm.joined_date LIMIT 1)
       ),
       'leader'
FROM study_groups g
LEFT JOIN users u ON u.user_id = g.created_by
WHERE COALESCE(
        CASE WHEN u.role = 'student' THEN g.created_by END,
        (SELECT gm.student_id FROM group_members gm WHERE gm.group_id = g.group_id ORDER BY gm.joined_date LIMIT 1)
      ) IS NOT NULL
ON CONFLICT (group_id, student_id) DO UPDATE SET role = 'leader';

CREATE INDEX IF NOT EXISTS group_languages_language_idx ON group_languages(language_id);
CREATE INDEX IF NOT EXISTS group_updates_group_created_idx ON group_updates(group_id, created_at DESC);

CREATE OR REPLACE FUNCTION prevent_last_group_leader_change() RETURNS trigger AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN OLD;
  END IF;
  IF OLD.role = 'leader' AND NOT EXISTS (
    SELECT 1 FROM group_leaders gl
    WHERE gl.group_id = OLD.group_id AND gl.student_id <> OLD.student_id AND gl.role = 'leader'
  ) THEN
    RAISE EXCEPTION 'A study group must retain at least one leader';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS group_leaders_keep_one ON group_leaders;
CREATE TRIGGER group_leaders_keep_one
BEFORE DELETE OR UPDATE OF role ON group_leaders
FOR EACH ROW EXECUTE FUNCTION prevent_last_group_leader_change();
