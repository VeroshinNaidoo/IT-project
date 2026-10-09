CREATE UNIQUE INDEX question_one_correct_option ON question_options(question_id) WHERE is_correct;
CREATE UNIQUE INDEX competitive_one_scored_attempt ON quiz_attempts(quiz_id, student_id) WHERE is_scored;

CREATE INDEX sessions_user_id_idx ON sessions(user_id);
CREATE INDEX modules_lecturer_id_idx ON modules(lecturer_id);
CREATE INDEX enrollments_module_id_idx ON enrollments(module_id);
CREATE INDEX study_groups_module_id_idx ON study_groups(module_id);
CREATE INDEX group_members_student_id_idx ON group_members(student_id);
CREATE INDEX resources_module_id_idx ON resources(module_id);
CREATE INDEX resources_group_id_idx ON resources(group_id);
CREATE INDEX topics_module_id_idx ON topics(module_id);
CREATE INDEX quizzes_module_id_idx ON quizzes(module_id);
CREATE INDEX questions_quiz_id_idx ON questions(quiz_id);
CREATE INDEX attempts_quiz_score_idx ON quiz_attempts(quiz_id, is_scored, completion_time, score DESC);
CREATE INDEX attempts_student_id_idx ON quiz_attempts(student_id);
CREATE INDEX answers_question_id_idx ON student_answers(question_id);
CREATE INDEX jobs_status_updated_idx ON ai_generation_jobs(status, updated_at);

CREATE OR REPLACE FUNCTION require_role(p_user_id uuid, p_role user_role) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users WHERE user_id = p_user_id AND role = p_role) THEN
    RAISE EXCEPTION 'role constraint violated' USING ERRCODE = '23514';
  END IF;
END; $$;

CREATE OR REPLACE FUNCTION enforce_academic_roles() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'modules' THEN PERFORM require_role(NEW.lecturer_id, 'lecturer'); END IF;
  IF TG_TABLE_NAME = 'enrollments' THEN PERFORM require_role(NEW.student_id, 'student'); END IF;
  IF TG_TABLE_NAME = 'group_members' THEN PERFORM require_role(NEW.student_id, 'student'); END IF;
  IF TG_TABLE_NAME = 'quiz_attempts' THEN PERFORM require_role(NEW.student_id, 'student'); END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER modules_lecturer_role BEFORE INSERT OR UPDATE ON modules FOR EACH ROW EXECUTE FUNCTION enforce_academic_roles();
CREATE TRIGGER enrollments_student_role BEFORE INSERT OR UPDATE ON enrollments FOR EACH ROW EXECUTE FUNCTION enforce_academic_roles();
CREATE TRIGGER group_members_student_role BEFORE INSERT OR UPDATE ON group_members FOR EACH ROW EXECUTE FUNCTION enforce_academic_roles();
CREATE TRIGGER attempts_student_role BEFORE INSERT OR UPDATE ON quiz_attempts FOR EACH ROW EXECUTE FUNCTION enforce_academic_roles();

CREATE OR REPLACE FUNCTION enforce_group_membership() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE module_for_group uuid;
BEGIN
  SELECT module_id INTO module_for_group FROM study_groups WHERE group_id = NEW.group_id;
  IF NOT EXISTS (SELECT 1 FROM enrollments WHERE module_id = module_for_group AND student_id = NEW.student_id) THEN
    RAISE EXCEPTION 'group member must be enrolled in the group module' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER group_membership_required BEFORE INSERT OR UPDATE ON group_members FOR EACH ROW EXECUTE FUNCTION enforce_group_membership();

CREATE OR REPLACE FUNCTION enforce_resource_scope() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.group_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM study_groups WHERE group_id = NEW.group_id AND module_id = NEW.module_id) THEN
    RAISE EXCEPTION 'resource group must belong to resource module' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER resource_scope_required BEFORE INSERT OR UPDATE ON resources FOR EACH ROW EXECUTE FUNCTION enforce_resource_scope();

CREATE OR REPLACE FUNCTION enforce_quiz_ownership() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM require_role(NEW.created_by, 'lecturer');
  IF NOT EXISTS (SELECT 1 FROM modules WHERE module_id = NEW.module_id AND lecturer_id = NEW.created_by) THEN
    RAISE EXCEPTION 'quiz creator must own module' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER quiz_ownership_required BEFORE INSERT OR UPDATE ON quizzes FOR EACH ROW EXECUTE FUNCTION enforce_quiz_ownership();

CREATE OR REPLACE FUNCTION enforce_answer_consistency() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE attempt_quiz uuid; option_question uuid; question_quiz uuid;
BEGIN
  SELECT quiz_id INTO attempt_quiz FROM quiz_attempts WHERE attempt_id = NEW.attempt_id;
  SELECT question_id INTO option_question FROM question_options WHERE option_id = NEW.option_id;
  SELECT quiz_id INTO question_quiz FROM questions WHERE question_id = NEW.question_id;
  IF option_question IS DISTINCT FROM NEW.question_id OR question_quiz IS DISTINCT FROM attempt_quiz THEN
    RAISE EXCEPTION 'answer does not match attempt question and option' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER answer_consistency_required BEFORE INSERT OR UPDATE ON student_answers FOR EACH ROW EXECUTE FUNCTION enforce_answer_consistency();

CREATE OR REPLACE FUNCTION enforce_games_practice_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM quizzes WHERE quiz_id = NEW.quiz_id AND is_competitive) THEN
    RAISE EXCEPTION 'games must be practice-only' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER games_practice_only BEFORE INSERT OR UPDATE ON games FOR EACH ROW EXECUTE FUNCTION enforce_games_practice_only();

CREATE OR REPLACE FUNCTION touch_job_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER jobs_touch_updated_at BEFORE UPDATE ON ai_generation_jobs FOR EACH ROW EXECUTE FUNCTION touch_job_updated_at();
