ALTER TABLE game_types
  ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT 'Practice questions in a game format.' CHECK (length(trim(description)) > 0),
  ADD COLUMN IF NOT EXISTS minimum_questions integer NOT NULL DEFAULT 6 CHECK (minimum_questions > 0);

UPDATE game_types SET
  description = CASE key
    WHEN 'infected' THEN 'Choose a question card and grow your cure. Reach 100% before you lose all three hearts.'
    WHEN 'island_escape' THEN 'Answer questions to gather supplies and sail home. Survive setbacks and reach the mainland.'
    WHEN 'memory_match' THEN 'Flip question and answer cards to find matching pairs. Clear every pair with as few mismatches as possible.'
    WHEN 'boss_battle' THEN 'Answer questions to damage the boss while protecting your HP. Reduce the boss to zero before your HP runs out.'
    WHEN 'pixel_racer' THEN 'Race a deterministic bot by answering questions and building speed. Finish with the greatest distance.'
    WHEN 'timer_trivia' THEN 'Pick board cells and answer before the server timer expires. Finish ten rounds with the highest personal score.'
    WHEN 'flashcards' THEN 'Review practice questions one card at a time.'
    ELSE description
  END,
  minimum_questions = CASE key
    WHEN 'infected' THEN 6
    WHEN 'island_escape' THEN 30
    WHEN 'memory_match' THEN 6
    WHEN 'boss_battle' THEN 12
    WHEN 'pixel_racer' THEN 10
    WHEN 'timer_trivia' THEN 10
    ELSE minimum_questions
  END;
