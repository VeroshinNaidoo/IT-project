UPDATE game_types
SET display_name='Timer Trivia', is_enabled=true
WHERE key='timer_trivia';

INSERT INTO games(quiz_id, game_type_id)
SELECT q.quiz_id, gt.game_type_id
FROM quizzes q
CROSS JOIN game_types gt
WHERE gt.key='timer_trivia' AND gt.is_enabled=true
ON CONFLICT (quiz_id, game_type_id) DO NOTHING;
