CREATE TABLE IF NOT EXISTS game_types (
  game_type_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  display_name text NOT NULL,
  is_enabled boolean NOT NULL DEFAULT false
);

INSERT INTO game_types (key, display_name, is_enabled) VALUES
  ('flashcards', 'Flashcards', false),
  ('speed_round', 'Speed round', false),
  ('match_pairs', 'Match pairs', false)
ON CONFLICT (key) DO NOTHING;

CREATE UNIQUE INDEX IF NOT EXISTS one_active_attempt_per_student_quiz
  ON quiz_attempts(quiz_id, student_id) WHERE completion_time IS NULL;

ALTER TABLE games ADD COLUMN IF NOT EXISTS game_type_id uuid;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='games' AND column_name='game_type') THEN
    UPDATE games g SET game_type_id = gt.game_type_id
    FROM game_types gt WHERE gt.key = g.game_type::text AND g.game_type_id IS NULL;
    ALTER TABLE games DROP CONSTRAINT IF EXISTS games_quiz_id_game_type_key;
    ALTER TABLE games DROP COLUMN game_type;
  END IF;
END $$;
ALTER TABLE games ALTER COLUMN game_type_id SET NOT NULL;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='games_game_type_id_fk') THEN
    ALTER TABLE games ADD CONSTRAINT games_game_type_id_fk FOREIGN KEY (game_type_id) REFERENCES game_types(game_type_id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='games_quiz_id_game_type_id_key') THEN
    ALTER TABLE games ADD CONSTRAINT games_quiz_id_game_type_id_key UNIQUE (quiz_id, game_type_id);
  END IF;
END $$;
DROP TRIGGER IF EXISTS games_practice_only ON games;
DROP FUNCTION IF EXISTS enforce_games_practice_only();
DROP TYPE IF EXISTS game_type;
