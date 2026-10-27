ALTER TABLE questions DROP CONSTRAINT IF EXISTS questions_difficulty_check;
ALTER TABLE questions ALTER COLUMN difficulty DROP DEFAULT;
ALTER TABLE questions ALTER COLUMN difficulty TYPE smallint USING (
  CASE difficulty
    WHEN 'easy' THEN 1
    WHEN 'medium' THEN 3
    WHEN 'hard' THEN 5
    ELSE NULL
  END
);
ALTER TABLE questions RENAME COLUMN difficulty TO difficulty_level;
ALTER TABLE questions ALTER COLUMN difficulty_level SET DEFAULT 3;
ALTER TABLE questions ALTER COLUMN difficulty_level SET NOT NULL;
ALTER TABLE questions ADD CONSTRAINT questions_difficulty_level_check
  CHECK (difficulty_level BETWEEN 1 AND 5);

ALTER TABLE game_turn_cards DROP CONSTRAINT IF EXISTS game_turn_cards_difficulty_check;
ALTER TABLE game_turn_cards ALTER COLUMN difficulty TYPE smallint USING (
  CASE difficulty
    WHEN 'easy' THEN 1
    WHEN 'medium' THEN 3
    WHEN 'hard' THEN 5
    ELSE NULL
  END
);
ALTER TABLE game_turn_cards RENAME COLUMN difficulty TO difficulty_level;
ALTER TABLE game_turn_cards ALTER COLUMN difficulty_level SET NOT NULL;
ALTER TABLE game_turn_cards ADD CONSTRAINT game_turn_cards_difficulty_level_check
  CHECK (difficulty_level BETWEEN 1 AND 5);

CREATE OR REPLACE FUNCTION enforce_game_turn_card_scope() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE expected_quiz uuid; actual_quiz uuid; actual_level smallint;
BEGIN
  SELECT g.quiz_id INTO expected_quiz
  FROM game_turns t JOIN game_sessions s ON s.session_id=t.session_id
  JOIN games g ON g.game_id=s.game_id
  WHERE t.turn_id=NEW.turn_id AND t.session_id=NEW.session_id;
  SELECT quiz_id,difficulty_level INTO actual_quiz,actual_level
  FROM questions WHERE question_id=NEW.question_id;
  IF expected_quiz IS DISTINCT FROM actual_quiz OR NEW.difficulty_level IS DISTINCT FROM actual_level THEN
    RAISE EXCEPTION 'game card must use a question and difficulty level from its quiz' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END; $$;

DELETE FROM game_types WHERE key IN ('speed_round', 'match_pairs');
INSERT INTO game_types (key, display_name, is_enabled) VALUES
  ('memory_match', 'Memory Match', false),
  ('timer_trivia', 'Timer Trivia', false),
  ('boss_battle', 'Boss Battle', false),
  ('pixel_racer', 'Pixel Car Racer', false)
ON CONFLICT (key) DO UPDATE
SET display_name=EXCLUDED.display_name, is_enabled=false;

CREATE TABLE game_plays (
  play_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_type_id uuid NOT NULL REFERENCES game_types(game_type_id) ON DELETE RESTRICT,
  student_id uuid NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  quiz_id uuid NOT NULL REFERENCES quizzes(quiz_id) ON DELETE CASCADE,
  mode text NOT NULL DEFAULT 'solo' CHECK (mode IN ('solo', 'room')),
  status text NOT NULL DEFAULT 'in_progress'
    CHECK (status IN ('in_progress', 'won', 'lost', 'finished', 'exhausted')),
  state jsonb NOT NULL,
  score integer NOT NULL DEFAULT 0 CHECK (score >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CHECK (jsonb_typeof(state) = 'object'),
  CHECK (state ? 'version' AND jsonb_typeof(state->'version') = 'number'),
  CHECK ((status='in_progress' AND completed_at IS NULL) OR
         (status<>'in_progress' AND completed_at IS NOT NULL))
);

CREATE UNIQUE INDEX one_in_progress_generic_solo_play
  ON game_plays(game_type_id, student_id, quiz_id)
  WHERE mode='solo' AND status='in_progress';
CREATE INDEX game_plays_student_idx ON game_plays(student_id, updated_at DESC);
CREATE INDEX game_plays_quiz_type_idx ON game_plays(quiz_id, game_type_id, status);

CREATE TABLE game_play_moves (
  move_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  play_id uuid NOT NULL REFERENCES game_plays(play_id) ON DELETE CASCADE,
  move_number integer NOT NULL CHECK (move_number >= 1),
  move_type text NOT NULL CHECK (length(trim(move_type)) > 0),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(payload)='object'),
  state_after jsonb NOT NULL CHECK (jsonb_typeof(state_after)='object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (play_id, move_number)
);

CREATE OR REPLACE FUNCTION enforce_generic_play_scope() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE module_owner uuid; actor_role user_role;
BEGIN
  SELECT m.lecturer_id INTO module_owner
  FROM quizzes q JOIN modules m ON m.module_id=q.module_id
  WHERE q.quiz_id=NEW.quiz_id;
  SELECT role INTO actor_role FROM users WHERE user_id=NEW.student_id;
  IF module_owner IS NULL OR actor_role IS NULL THEN
    RAISE EXCEPTION 'game play scope is invalid' USING ERRCODE='23514';
  END IF;
  IF actor_role='student' AND NOT EXISTS (
    SELECT 1 FROM quizzes q JOIN enrollments e ON e.module_id=q.module_id
    WHERE q.quiz_id=NEW.quiz_id AND e.student_id=NEW.student_id
  ) THEN
    RAISE EXCEPTION 'student must be enrolled in the game module' USING ERRCODE='23514';
  END IF;
  IF actor_role='lecturer' AND module_owner<>NEW.student_id THEN
    RAISE EXCEPTION 'lecturer must own the game module' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER generic_play_scope_required
BEFORE INSERT OR UPDATE OF quiz_id,student_id ON game_plays
FOR EACH ROW EXECUTE FUNCTION enforce_generic_play_scope();

CREATE OR REPLACE FUNCTION enforce_game_play_move_insert() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM game_plays WHERE play_id=NEW.play_id AND status='in_progress'
  ) THEN
    RAISE EXCEPTION 'terminal game play accepts no moves' USING ERRCODE='23514';
  END IF;
  IF NOT (NEW.state_after ? 'version') THEN
    RAISE EXCEPTION 'move state requires a version' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER game_play_move_insert_guard
BEFORE INSERT ON game_play_moves FOR EACH ROW EXECUTE FUNCTION enforce_game_play_move_insert();

CREATE OR REPLACE FUNCTION prevent_game_play_move_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'game play moves are append-only' USING ERRCODE='23514';
END; $$;
CREATE TRIGGER game_play_moves_append_only
BEFORE UPDATE OR DELETE ON game_play_moves
FOR EACH ROW EXECUTE FUNCTION prevent_game_play_move_change();

CREATE OR REPLACE FUNCTION touch_game_play_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at=now(); RETURN NEW; END; $$;
CREATE TRIGGER game_plays_touch_updated_at
BEFORE UPDATE ON game_plays FOR EACH ROW EXECUTE FUNCTION touch_game_play_updated_at();
