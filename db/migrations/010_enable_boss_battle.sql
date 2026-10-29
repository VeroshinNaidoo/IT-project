UPDATE game_types
SET display_name = 'Boss Battle',
    is_enabled = true
WHERE key = 'boss_battle';

INSERT INTO games (quiz_id, game_type_id)
SELECT q.quiz_id, gt.game_type_id
FROM quizzes q
CROSS JOIN game_types gt
WHERE gt.is_enabled = true
ON CONFLICT (quiz_id, game_type_id) DO NOTHING;

CREATE OR REPLACE FUNCTION attach_enabled_quiz_games() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO games (quiz_id, game_type_id)
  SELECT NEW.quiz_id, game_type_id
  FROM game_types
  WHERE is_enabled = true
  ON CONFLICT (quiz_id, game_type_id) DO NOTHING;
  RETURN NEW;
END; $$;
