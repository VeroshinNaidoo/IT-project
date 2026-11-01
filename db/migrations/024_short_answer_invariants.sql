CREATE OR REPLACE FUNCTION enforce_answer_consistency() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE attempt_quiz uuid; option_question uuid; question_quiz uuid;
BEGIN
  SELECT quiz_id INTO attempt_quiz FROM quiz_attempts WHERE attempt_id = NEW.attempt_id;
  SELECT quiz_id INTO question_quiz FROM questions WHERE question_id = NEW.question_id;
  IF question_quiz IS DISTINCT FROM attempt_quiz THEN
    RAISE EXCEPTION 'answer does not match attempt question and option' USING ERRCODE = '23514';
  END IF;
  IF NEW.option_id IS NOT NULL THEN
    SELECT question_id INTO option_question FROM question_options WHERE option_id = NEW.option_id;
    IF option_question IS DISTINCT FROM NEW.question_id THEN
      RAISE EXCEPTION 'answer does not match attempt question and option' USING ERRCODE = '23514';
    END IF;
  ELSIF NEW.answer_text IS NULL THEN
    RAISE EXCEPTION 'answer requires an option or answer text' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END; $$;
