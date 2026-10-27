ALTER TABLE questions ADD COLUMN IF NOT EXISTS difficulty text;
UPDATE questions SET difficulty = 'medium' WHERE difficulty IS NULL;
ALTER TABLE questions ALTER COLUMN difficulty SET DEFAULT 'medium';
ALTER TABLE questions ALTER COLUMN difficulty SET NOT NULL;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS explanation text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='questions_difficulty_check') THEN
    ALTER TABLE questions ADD CONSTRAINT questions_difficulty_check
      CHECK (difficulty IN ('easy', 'medium', 'hard'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='questions_explanation_length_check') THEN
    ALTER TABLE questions ADD CONSTRAINT questions_explanation_length_check
      CHECK (explanation IS NULL OR (length(trim(explanation)) BETWEEN 1 AND 300));
  END IF;
END $$;

INSERT INTO game_types (key, display_name, is_enabled)
VALUES ('infected', 'Infected', true)
ON CONFLICT (key) DO UPDATE
SET display_name=EXCLUDED.display_name, is_enabled=true;

INSERT INTO games (quiz_id, game_type_id)
SELECT q.quiz_id, gt.game_type_id
FROM quizzes q CROSS JOIN game_types gt
WHERE gt.key='infected'
ON CONFLICT (quiz_id, game_type_id) DO NOTHING;

CREATE OR REPLACE FUNCTION attach_infected_game() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO games (quiz_id, game_type_id)
  SELECT NEW.quiz_id, game_type_id FROM game_types WHERE key='infected'
  ON CONFLICT (quiz_id, game_type_id) DO NOTHING;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS quizzes_attach_infected_game ON quizzes;
CREATE TRIGGER quizzes_attach_infected_game
AFTER INSERT ON quizzes FOR EACH ROW EXECUTE FUNCTION attach_infected_game();

CREATE TABLE IF NOT EXISTS game_sessions (
  session_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES games(game_id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  mode text NOT NULL DEFAULT 'solo' CHECK (mode IN ('solo', 'group')),
  cure integer NOT NULL DEFAULT 0 CHECK (cure BETWEEN 0 AND 100),
  hearts integer NOT NULL DEFAULT 3 CHECK (hearts BETWEEN 0 AND 3),
  score integer NOT NULL DEFAULT 0 CHECK (score >= 0),
  status text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'won', 'lost', 'exhausted')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CHECK (status <> 'won' OR cure = 100),
  CHECK (status <> 'lost' OR hearts = 0),
  CHECK (status <> 'in_progress' OR (cure < 100 AND hearts > 0)),
  CHECK ((status = 'in_progress' AND completed_at IS NULL) OR (status <> 'in_progress' AND completed_at IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS one_in_progress_infected_solo_session
  ON game_sessions(game_id, student_id)
  WHERE mode='solo' AND status='in_progress';
CREATE INDEX IF NOT EXISTS game_sessions_student_idx ON game_sessions(student_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS game_turns (
  turn_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES game_sessions(session_id) ON DELETE CASCADE,
  turn_number integer NOT NULL CHECK (turn_number >= 1),
  chosen_question_id uuid REFERENCES questions(question_id) ON DELETE RESTRICT,
  chosen_option_id uuid,
  is_correct boolean,
  cure_before integer NOT NULL CHECK (cure_before BETWEEN 0 AND 100),
  cure_after integer CHECK (cure_after BETWEEN 0 AND 100),
  hearts_before integer NOT NULL CHECK (hearts_before BETWEEN 0 AND 3),
  hearts_after integer CHECK (hearts_after BETWEEN 0 AND 3),
  score_delta integer NOT NULL DEFAULT 0 CHECK (score_delta >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  answered_at timestamptz,
  UNIQUE (session_id, turn_number),
  UNIQUE (turn_id, session_id),
  CHECK ((chosen_option_id IS NULL AND is_correct IS NULL AND answered_at IS NULL AND cure_after IS NULL AND hearts_after IS NULL) OR
         (chosen_option_id IS NOT NULL AND is_correct IS NOT NULL AND answered_at IS NOT NULL AND cure_after IS NOT NULL AND hearts_after IS NOT NULL)),
  CONSTRAINT game_turn_option_question_fk
    FOREIGN KEY (chosen_question_id, chosen_option_id)
    REFERENCES question_options(question_id, option_id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS game_turn_cards (
  turn_id uuid NOT NULL,
  session_id uuid NOT NULL,
  card_index integer NOT NULL CHECK (card_index BETWEEN 0 AND 2),
  question_id uuid NOT NULL REFERENCES questions(question_id) ON DELETE RESTRICT,
  difficulty text NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard')),
  PRIMARY KEY (turn_id, card_index),
  UNIQUE (turn_id, question_id),
  UNIQUE (session_id, question_id),
  FOREIGN KEY (turn_id, session_id)
    REFERENCES game_turns(turn_id, session_id) ON DELETE CASCADE
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='game_turn_chosen_card_fk') THEN
    ALTER TABLE game_turns ADD CONSTRAINT game_turn_chosen_card_fk
      FOREIGN KEY (turn_id, chosen_question_id)
      REFERENCES game_turn_cards(turn_id, question_id)
      DEFERRABLE INITIALLY DEFERRED;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION enforce_game_session_scope() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE game_module uuid; actor_role user_role;
BEGIN
  SELECT q.module_id INTO game_module
  FROM games g JOIN quizzes q ON q.quiz_id=g.quiz_id
  WHERE g.game_id=NEW.game_id;
  SELECT role INTO actor_role FROM users WHERE user_id=NEW.student_id;
  IF game_module IS NULL OR actor_role IS NULL THEN
    RAISE EXCEPTION 'game session scope is invalid' USING ERRCODE='23514';
  END IF;
  IF actor_role='student' AND NOT EXISTS (
    SELECT 1 FROM enrollments WHERE module_id=game_module AND student_id=NEW.student_id
  ) THEN
    RAISE EXCEPTION 'student must be enrolled in the game module' USING ERRCODE='23514';
  END IF;
  IF actor_role='lecturer' AND NOT EXISTS (
    SELECT 1 FROM modules WHERE module_id=game_module AND lecturer_id=NEW.student_id
  ) THEN
    RAISE EXCEPTION 'lecturer must own the game module' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS game_session_scope_required ON game_sessions;
CREATE TRIGGER game_session_scope_required
BEFORE INSERT OR UPDATE OF game_id,student_id ON game_sessions
FOR EACH ROW EXECUTE FUNCTION enforce_game_session_scope();

CREATE OR REPLACE FUNCTION enforce_game_turn_card_scope() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE expected_quiz uuid; actual_quiz uuid; actual_difficulty text;
BEGIN
  SELECT g.quiz_id INTO expected_quiz
  FROM game_turns t JOIN game_sessions s ON s.session_id=t.session_id
  JOIN games g ON g.game_id=s.game_id
  WHERE t.turn_id=NEW.turn_id AND t.session_id=NEW.session_id;
  SELECT quiz_id,difficulty INTO actual_quiz,actual_difficulty
  FROM questions WHERE question_id=NEW.question_id;
  IF expected_quiz IS DISTINCT FROM actual_quiz OR NEW.difficulty IS DISTINCT FROM actual_difficulty THEN
    RAISE EXCEPTION 'game card must use a question and difficulty from its quiz' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS game_turn_card_scope_required ON game_turn_cards;
CREATE TRIGGER game_turn_card_scope_required
BEFORE INSERT OR UPDATE ON game_turn_cards
FOR EACH ROW EXECUTE FUNCTION enforce_game_turn_card_scope();

CREATE OR REPLACE FUNCTION enforce_game_turn_answer_once() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.answered_at IS NOT NULL THEN
    RAISE EXCEPTION 'game turn has already been answered' USING ERRCODE='23514';
  END IF;
  IF NEW.answered_at IS NOT NULL THEN
    IF NEW.is_correct=false AND NEW.hearts_after <> greatest(0, NEW.hearts_before-1) THEN
      RAISE EXCEPTION 'wrong game answer must cost exactly one heart' USING ERRCODE='23514';
    END IF;
    IF NEW.is_correct=true AND NEW.hearts_after <> NEW.hearts_before THEN
      RAISE EXCEPTION 'correct game answer cannot cost a heart' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS game_turn_answer_once ON game_turns;
CREATE TRIGGER game_turn_answer_once
BEFORE UPDATE ON game_turns FOR EACH ROW EXECUTE FUNCTION enforce_game_turn_answer_once();

CREATE OR REPLACE FUNCTION touch_game_session_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at=now(); RETURN NEW; END; $$;
DROP TRIGGER IF EXISTS game_sessions_touch_updated_at ON game_sessions;
CREATE TRIGGER game_sessions_touch_updated_at
BEFORE UPDATE ON game_sessions FOR EACH ROW EXECUTE FUNCTION touch_game_session_updated_at();
