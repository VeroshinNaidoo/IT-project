INSERT INTO game_types (key, display_name, is_enabled)
VALUES ('island_escape', 'Island Escape', true)
ON CONFLICT (key) DO UPDATE
SET display_name=EXCLUDED.display_name, is_enabled=true;

INSERT INTO games (quiz_id, game_type_id)
SELECT q.quiz_id, gt.game_type_id
FROM quizzes q CROSS JOIN game_types gt
WHERE gt.key='island_escape'
ON CONFLICT (quiz_id, game_type_id) DO NOTHING;

CREATE OR REPLACE FUNCTION attach_enabled_quiz_games() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO games (quiz_id, game_type_id)
  SELECT NEW.quiz_id, game_type_id FROM game_types
  WHERE key IN ('infected','island_escape')
  ON CONFLICT (quiz_id, game_type_id) DO NOTHING;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS quizzes_attach_infected_game ON quizzes;
DROP TRIGGER IF EXISTS quizzes_attach_enabled_games ON quizzes;
CREATE TRIGGER quizzes_attach_enabled_games
AFTER INSERT ON quizzes FOR EACH ROW EXECUTE FUNCTION attach_enabled_quiz_games();

ALTER TABLE game_play_moves
  ADD COLUMN question_id uuid REFERENCES questions(question_id) ON DELETE RESTRICT,
  ADD COLUMN option_id uuid,
  ADD COLUMN phase_attempt integer CHECK (phase_attempt >= 1);

ALTER TABLE game_play_moves ADD CONSTRAINT game_play_move_option_question_fk
  FOREIGN KEY (question_id, option_id)
  REFERENCES question_options(question_id, option_id) ON DELETE RESTRICT;

CREATE UNIQUE INDEX game_play_question_once_per_phase_attempt
  ON game_play_moves(play_id, phase_attempt, question_id)
  WHERE question_id IS NOT NULL;

CREATE TABLE game_personal_bests (
  game_type_id uuid NOT NULL REFERENCES game_types(game_type_id) ON DELETE RESTRICT,
  student_id uuid NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  quiz_id uuid NOT NULL REFERENCES quizzes(quiz_id) ON DELETE CASCADE,
  score integer NOT NULL CHECK (score >= 0),
  achieved_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (game_type_id, student_id, quiz_id)
);

CREATE OR REPLACE FUNCTION enforce_island_play_state() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE game_key text; state_status text; state_score integer;
BEGIN
  SELECT key INTO game_key FROM game_types WHERE game_type_id=NEW.game_type_id;
  IF TG_OP='UPDATE' AND OLD.status<>'in_progress' THEN
    RAISE EXCEPTION 'terminal game play is final' USING ERRCODE='23514';
  END IF;
  IF TG_OP='UPDATE' AND NEW.score < OLD.score THEN
    RAISE EXCEPTION 'game score cannot decrease' USING ERRCODE='23514';
  END IF;
  IF game_key='island_escape' THEN
    state_status := NEW.state->>'status';
    state_score := (NEW.state->>'score')::integer;
    IF state_status IS DISTINCT FROM NEW.status OR state_score IS DISTINCT FROM NEW.score THEN
      RAISE EXCEPTION 'island state must match play columns' USING ERRCODE='23514';
    END IF;
    IF (NEW.state->>'wrongInPhase')::integer NOT BETWEEN 0 AND 4 THEN
      RAISE EXCEPTION 'island wrong count requires an immediate setback' USING ERRCODE='23514';
    END IF;
    IF (NEW.state->>'setbacks')::integer NOT BETWEEN 0 AND 4 THEN
      RAISE EXCEPTION 'island setbacks are outside the configured range' USING ERRCODE='23514';
    END IF;
    IF (NEW.state->>'doubleActive')::boolean AND (NEW.state->>'streak')::integer < 3 THEN
      RAISE EXCEPTION 'island doubling requires a streak of three' USING ERRCODE='23514';
    END IF;
    IF (NEW.state->>'setbacks')::integer=4 AND NEW.status<>'lost' THEN
      RAISE EXCEPTION 'the fourth island setback must end the play' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER island_play_state_required
BEFORE INSERT OR UPDATE ON game_plays
FOR EACH ROW EXECUTE FUNCTION enforce_island_play_state();

CREATE OR REPLACE FUNCTION enforce_game_play_move_scope() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE play_quiz uuid; question_quiz uuid;
BEGIN
  IF NEW.question_id IS NULL AND NEW.option_id IS NULL AND NEW.phase_attempt IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.question_id IS NULL OR NEW.option_id IS NULL OR NEW.phase_attempt IS NULL THEN
    RAISE EXCEPTION 'question moves require question, option, and phase attempt' USING ERRCODE='23514';
  END IF;
  SELECT quiz_id INTO play_quiz FROM game_plays WHERE play_id=NEW.play_id;
  SELECT quiz_id INTO question_quiz FROM questions WHERE question_id=NEW.question_id;
  IF play_quiz IS DISTINCT FROM question_quiz THEN
    RAISE EXCEPTION 'game move question must belong to the play quiz' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER game_play_move_scope_required
BEFORE INSERT OR UPDATE ON game_play_moves
FOR EACH ROW EXECUTE FUNCTION enforce_game_play_move_scope();
