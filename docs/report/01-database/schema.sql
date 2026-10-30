-- EduQuest final PostgreSQL schema, introspected from the migrated TEST_DATABASE_URL database.
-- Generated without data, credentials, or secrets.
BEGIN;
-- citext handling: citext is not installed by the final PGlite-compatible migrations.
-- Email is stored as text and case-insensitive uniqueness is enforced by a lower(email) index.
SET search_path = public;

CREATE TYPE "ai_job_status" AS ENUM ('queued', 'running', 'succeeded', 'failed');
CREATE TYPE "quiz_status" AS ENUM ('draft', 'published');
CREATE TYPE "user_role" AS ENUM ('student', 'lecturer');

-- Asynchronous AI quiz-generation job state and retry metadata.
CREATE TABLE "ai_generation_jobs" (
  "job_id" uuid DEFAULT gen_random_uuid(),
  "requested_by" uuid,
  "resource_id" uuid,
  "status" ai_job_status DEFAULT 'queued'::ai_job_status,
  "attempts" integer DEFAULT 0,
  "error_code" text,
  "quiz_id" uuid,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  "question_count" integer DEFAULT 5,
  "difficulty" text DEFAULT 'mixed'::text
);

-- Student membership in modules.
CREATE TABLE "enrollments" (
  "enrolment_id" uuid DEFAULT gen_random_uuid(),
  "student_id" uuid,
  "module_id" uuid,
  "enrolled_date" timestamp with time zone DEFAULT now()
);

-- Practice-game personal-best scores, excluded from leaderboards.
CREATE TABLE "game_personal_bests" (
  "game_type_id" uuid,
  "student_id" uuid,
  "quiz_id" uuid,
  "score" integer,
  "achieved_at" timestamp with time zone DEFAULT now()
);

-- Append-only move log for versioned generic game plays.
CREATE TABLE "game_play_moves" (
  "move_id" uuid DEFAULT gen_random_uuid(),
  "play_id" uuid,
  "move_number" integer,
  "move_type" text,
  "payload" jsonb DEFAULT '{}'::jsonb,
  "state_after" jsonb,
  "created_at" timestamp with time zone DEFAULT now(),
  "question_id" uuid,
  "option_id" uuid,
  "phase_attempt" integer
);

-- Versioned generic practice-game state for solo games.
CREATE TABLE "game_plays" (
  "play_id" uuid DEFAULT gen_random_uuid(),
  "game_type_id" uuid,
  "student_id" uuid,
  "quiz_id" uuid,
  "mode" text DEFAULT 'solo'::text,
  "status" text DEFAULT 'in_progress'::text,
  "state" jsonb,
  "score" integer DEFAULT 0,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  "completed_at" timestamp with time zone
);

-- Infected game session state and terminal outcome.
CREATE TABLE "game_sessions" (
  "session_id" uuid DEFAULT gen_random_uuid(),
  "game_id" uuid,
  "student_id" uuid,
  "mode" text DEFAULT 'solo'::text,
  "cure" integer DEFAULT 0,
  "hearts" integer DEFAULT 3,
  "score" integer DEFAULT 0,
  "status" text DEFAULT 'in_progress'::text,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  "completed_at" timestamp with time zone
);

-- Cards offered during an Infected turn.
CREATE TABLE "game_turn_cards" (
  "turn_id" uuid,
  "session_id" uuid,
  "card_index" integer,
  "question_id" uuid,
  "difficulty_level" smallint
);

-- Infected turn choices and server-scored transitions.
CREATE TABLE "game_turns" (
  "turn_id" uuid DEFAULT gen_random_uuid(),
  "session_id" uuid,
  "turn_number" integer,
  "chosen_question_id" uuid,
  "chosen_option_id" uuid,
  "is_correct" boolean,
  "cure_before" integer,
  "cure_after" integer,
  "hearts_before" integer,
  "hearts_after" integer,
  "score_delta" integer DEFAULT 0,
  "created_at" timestamp with time zone DEFAULT now(),
  "answered_at" timestamp with time zone
);

-- Data-driven catalog of enabled or disabled game types.
CREATE TABLE "game_types" (
  "game_type_id" uuid DEFAULT gen_random_uuid(),
  "key" text,
  "display_name" text,
  "is_enabled" boolean DEFAULT false
);

-- Practice-game instances attached to quizzes.
CREATE TABLE "games" (
  "game_id" uuid DEFAULT gen_random_uuid(),
  "quiz_id" uuid,
  "game_type_id" uuid,
  "created_date" timestamp with time zone DEFAULT now()
);

-- Membership of users in study groups.
CREATE TABLE "group_members" (
  "group_id" uuid,
  "student_id" uuid,
  "joined_date" timestamp with time zone DEFAULT now()
);

-- Lecturer-owned teaching modules and enrolment join codes.
CREATE TABLE "modules" (
  "module_id" uuid DEFAULT gen_random_uuid(),
  "lecturer_id" uuid,
  "module_code" text,
  "module_name" text,
  "join_code" text,
  "created_date" timestamp with time zone DEFAULT now()
);

-- Answer options belonging to quiz questions.
CREATE TABLE "question_options" (
  "option_id" uuid DEFAULT gen_random_uuid(),
  "question_id" uuid,
  "option_text" text,
  "is_correct" boolean DEFAULT false
);

-- Quiz questions, difficulty levels, explanations, and topic links.
CREATE TABLE "questions" (
  "question_id" uuid DEFAULT gen_random_uuid(),
  "quiz_id" uuid,
  "topic_id" uuid,
  "question_text" text,
  "marks" numeric(8,2),
  "difficulty_level" smallint DEFAULT 3,
  "explanation" text
);

-- Student scored quiz attempts and completion results.
CREATE TABLE "quiz_attempts" (
  "attempt_id" uuid DEFAULT gen_random_uuid(),
  "quiz_id" uuid,
  "student_id" uuid,
  "score" numeric(10,2),
  "start_time" timestamp with time zone DEFAULT now(),
  "completion_time" timestamp with time zone,
  "is_scored" boolean DEFAULT false
);

-- Published or draft quizzes belonging to modules and resources.
CREATE TABLE "quizzes" (
  "quiz_id" uuid DEFAULT gen_random_uuid(),
  "module_id" uuid,
  "resource_id" uuid,
  "created_by" uuid,
  "title" text,
  "is_competitive" boolean DEFAULT false,
  "max_scored_attempts" integer DEFAULT 1,
  "status" quiz_status DEFAULT 'draft'::quiz_status,
  "closes_at" timestamp with time zone
);

-- Uploaded learning resources scoped to modules or groups.
CREATE TABLE "resources" (
  "resource_id" uuid DEFAULT gen_random_uuid(),
  "uploaded_by" uuid,
  "module_id" uuid,
  "group_id" uuid,
  "title" text,
  "resource_type" text,
  "file_location" text,
  "file_size_bytes" bigint,
  "created_date" timestamp with time zone DEFAULT now()
);

-- Applied migration filenames used by the migration runner.
CREATE TABLE "schema_migrations" (
  "version" text,
  "applied_at" timestamp with time zone DEFAULT now()
);

-- Opaque server-side login sessions with revocation and expiry.
CREATE TABLE "sessions" (
  "session_id" uuid DEFAULT gen_random_uuid(),
  "user_id" uuid,
  "token_hash" text,
  "created_at" timestamp with time zone DEFAULT now(),
  "expires_at" timestamp with time zone,
  "revoked_at" timestamp with time zone
);

-- Scored answers stored only for answered quiz questions.
CREATE TABLE "student_answers" (
  "answer_id" uuid DEFAULT gen_random_uuid(),
  "attempt_id" uuid,
  "question_id" uuid,
  "option_id" uuid,
  "is_correct" boolean
);

-- Module-scoped study groups.
CREATE TABLE "study_groups" (
  "group_id" uuid DEFAULT gen_random_uuid(),
  "module_id" uuid,
  "created_by" uuid,
  "group_name" text,
  "created_date" timestamp with time zone DEFAULT now()
);

-- Module-owned topic labels used by questions and analytics.
CREATE TABLE "topics" (
  "topic_id" uuid DEFAULT gen_random_uuid(),
  "module_id" uuid,
  "name" text
);

-- EduQuest accounts and role information.
CREATE TABLE "users" (
  "user_id" uuid DEFAULT gen_random_uuid(),
  "email" text,
  "password_hash" text,
  "role" user_role,
  "full_name" text,
  "created_date" timestamp with time zone DEFAULT now(),
  "extended_time" boolean DEFAULT false
);

ALTER TABLE "ai_generation_jobs" ADD CONSTRAINT "ai_generation_jobs_attempts_check" CHECK (attempts >= 0);
ALTER TABLE "ai_generation_jobs" ADD CONSTRAINT "ai_generation_jobs_attempts_not_null" NOT NULL attempts;
ALTER TABLE "ai_generation_jobs" ADD CONSTRAINT "ai_generation_jobs_created_at_not_null" NOT NULL created_at;
ALTER TABLE "ai_generation_jobs" ADD CONSTRAINT "ai_generation_jobs_difficulty_check" CHECK (length(TRIM(BOTH FROM difficulty)) > 0);
ALTER TABLE "ai_generation_jobs" ADD CONSTRAINT "ai_generation_jobs_difficulty_not_null" NOT NULL difficulty;
ALTER TABLE "ai_generation_jobs" ADD CONSTRAINT "ai_generation_jobs_job_id_not_null" NOT NULL job_id;
ALTER TABLE "ai_generation_jobs" ADD CONSTRAINT "ai_generation_jobs_pkey" PRIMARY KEY (job_id);
ALTER TABLE "ai_generation_jobs" ADD CONSTRAINT "ai_generation_jobs_question_count_check" CHECK (question_count >= 1 AND question_count <= 50);
ALTER TABLE "ai_generation_jobs" ADD CONSTRAINT "ai_generation_jobs_question_count_not_null" NOT NULL question_count;
ALTER TABLE "ai_generation_jobs" ADD CONSTRAINT "ai_generation_jobs_requested_by_not_null" NOT NULL requested_by;
ALTER TABLE "ai_generation_jobs" ADD CONSTRAINT "ai_generation_jobs_resource_id_not_null" NOT NULL resource_id;
ALTER TABLE "ai_generation_jobs" ADD CONSTRAINT "ai_generation_jobs_status_not_null" NOT NULL status;
ALTER TABLE "ai_generation_jobs" ADD CONSTRAINT "ai_generation_jobs_updated_at_not_null" NOT NULL updated_at;
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_enrolled_date_not_null" NOT NULL enrolled_date;
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_enrolment_id_not_null" NOT NULL enrolment_id;
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_module_id_not_null" NOT NULL module_id;
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_pkey" PRIMARY KEY (enrolment_id);
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_student_id_module_id_key" UNIQUE (student_id, module_id);
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_student_id_not_null" NOT NULL student_id;
ALTER TABLE "game_personal_bests" ADD CONSTRAINT "game_personal_bests_achieved_at_not_null" NOT NULL achieved_at;
ALTER TABLE "game_personal_bests" ADD CONSTRAINT "game_personal_bests_game_type_id_not_null" NOT NULL game_type_id;
ALTER TABLE "game_personal_bests" ADD CONSTRAINT "game_personal_bests_pkey" PRIMARY KEY (game_type_id, student_id, quiz_id);
ALTER TABLE "game_personal_bests" ADD CONSTRAINT "game_personal_bests_quiz_id_not_null" NOT NULL quiz_id;
ALTER TABLE "game_personal_bests" ADD CONSTRAINT "game_personal_bests_score_check" CHECK (score >= 0);
ALTER TABLE "game_personal_bests" ADD CONSTRAINT "game_personal_bests_score_not_null" NOT NULL score;
ALTER TABLE "game_personal_bests" ADD CONSTRAINT "game_personal_bests_student_id_not_null" NOT NULL student_id;
ALTER TABLE "game_play_moves" ADD CONSTRAINT "game_play_moves_created_at_not_null" NOT NULL created_at;
ALTER TABLE "game_play_moves" ADD CONSTRAINT "game_play_moves_move_id_not_null" NOT NULL move_id;
ALTER TABLE "game_play_moves" ADD CONSTRAINT "game_play_moves_move_number_check" CHECK (move_number >= 1);
ALTER TABLE "game_play_moves" ADD CONSTRAINT "game_play_moves_move_number_not_null" NOT NULL move_number;
ALTER TABLE "game_play_moves" ADD CONSTRAINT "game_play_moves_move_type_check" CHECK (length(TRIM(BOTH FROM move_type)) > 0);
ALTER TABLE "game_play_moves" ADD CONSTRAINT "game_play_moves_move_type_not_null" NOT NULL move_type;
ALTER TABLE "game_play_moves" ADD CONSTRAINT "game_play_moves_payload_check" CHECK (jsonb_typeof(payload) = 'object'::text);
ALTER TABLE "game_play_moves" ADD CONSTRAINT "game_play_moves_payload_not_null" NOT NULL payload;
ALTER TABLE "game_play_moves" ADD CONSTRAINT "game_play_moves_phase_attempt_check" CHECK (phase_attempt >= 1);
ALTER TABLE "game_play_moves" ADD CONSTRAINT "game_play_moves_pkey" PRIMARY KEY (move_id);
ALTER TABLE "game_play_moves" ADD CONSTRAINT "game_play_moves_play_id_move_number_key" UNIQUE (play_id, move_number);
ALTER TABLE "game_play_moves" ADD CONSTRAINT "game_play_moves_play_id_not_null" NOT NULL play_id;
ALTER TABLE "game_play_moves" ADD CONSTRAINT "game_play_moves_state_after_check" CHECK (jsonb_typeof(state_after) = 'object'::text);
ALTER TABLE "game_play_moves" ADD CONSTRAINT "game_play_moves_state_after_not_null" NOT NULL state_after;
ALTER TABLE "game_plays" ADD CONSTRAINT "game_plays_check" CHECK (status = 'in_progress'::text AND completed_at IS NULL OR status <> 'in_progress'::text AND completed_at IS NOT NULL);
ALTER TABLE "game_plays" ADD CONSTRAINT "game_plays_created_at_not_null" NOT NULL created_at;
ALTER TABLE "game_plays" ADD CONSTRAINT "game_plays_game_type_id_not_null" NOT NULL game_type_id;
ALTER TABLE "game_plays" ADD CONSTRAINT "game_plays_mode_check" CHECK (mode = ANY (ARRAY['solo'::text, 'room'::text]));
ALTER TABLE "game_plays" ADD CONSTRAINT "game_plays_mode_not_null" NOT NULL mode;
ALTER TABLE "game_plays" ADD CONSTRAINT "game_plays_pkey" PRIMARY KEY (play_id);
ALTER TABLE "game_plays" ADD CONSTRAINT "game_plays_play_id_not_null" NOT NULL play_id;
ALTER TABLE "game_plays" ADD CONSTRAINT "game_plays_quiz_id_not_null" NOT NULL quiz_id;
ALTER TABLE "game_plays" ADD CONSTRAINT "game_plays_score_check" CHECK (score >= 0);
ALTER TABLE "game_plays" ADD CONSTRAINT "game_plays_score_not_null" NOT NULL score;
ALTER TABLE "game_plays" ADD CONSTRAINT "game_plays_state_check" CHECK (jsonb_typeof(state) = 'object'::text);
ALTER TABLE "game_plays" ADD CONSTRAINT "game_plays_state_check1" CHECK (state ? 'version'::text AND jsonb_typeof(state -> 'version'::text) = 'number'::text);
ALTER TABLE "game_plays" ADD CONSTRAINT "game_plays_state_not_null" NOT NULL state;
ALTER TABLE "game_plays" ADD CONSTRAINT "game_plays_status_check" CHECK (status = ANY (ARRAY['in_progress'::text, 'won'::text, 'lost'::text, 'finished'::text, 'exhausted'::text]));
ALTER TABLE "game_plays" ADD CONSTRAINT "game_plays_status_not_null" NOT NULL status;
ALTER TABLE "game_plays" ADD CONSTRAINT "game_plays_student_id_not_null" NOT NULL student_id;
ALTER TABLE "game_plays" ADD CONSTRAINT "game_plays_updated_at_not_null" NOT NULL updated_at;
ALTER TABLE "game_sessions" ADD CONSTRAINT "game_sessions_check" CHECK (status <> 'won'::text OR cure = 100);
ALTER TABLE "game_sessions" ADD CONSTRAINT "game_sessions_check1" CHECK (status <> 'lost'::text OR hearts = 0);
ALTER TABLE "game_sessions" ADD CONSTRAINT "game_sessions_check2" CHECK (status <> 'in_progress'::text OR cure < 100 AND hearts > 0);
ALTER TABLE "game_sessions" ADD CONSTRAINT "game_sessions_check3" CHECK (status = 'in_progress'::text AND completed_at IS NULL OR status <> 'in_progress'::text AND completed_at IS NOT NULL);
ALTER TABLE "game_sessions" ADD CONSTRAINT "game_sessions_created_at_not_null" NOT NULL created_at;
ALTER TABLE "game_sessions" ADD CONSTRAINT "game_sessions_cure_check" CHECK (cure >= 0 AND cure <= 100);
ALTER TABLE "game_sessions" ADD CONSTRAINT "game_sessions_cure_not_null" NOT NULL cure;
ALTER TABLE "game_sessions" ADD CONSTRAINT "game_sessions_game_id_not_null" NOT NULL game_id;
ALTER TABLE "game_sessions" ADD CONSTRAINT "game_sessions_hearts_check" CHECK (hearts >= 0 AND hearts <= 3);
ALTER TABLE "game_sessions" ADD CONSTRAINT "game_sessions_hearts_not_null" NOT NULL hearts;
ALTER TABLE "game_sessions" ADD CONSTRAINT "game_sessions_mode_check" CHECK (mode = ANY (ARRAY['solo'::text, 'group'::text]));
ALTER TABLE "game_sessions" ADD CONSTRAINT "game_sessions_mode_not_null" NOT NULL mode;
ALTER TABLE "game_sessions" ADD CONSTRAINT "game_sessions_pkey" PRIMARY KEY (session_id);
ALTER TABLE "game_sessions" ADD CONSTRAINT "game_sessions_score_check" CHECK (score >= 0);
ALTER TABLE "game_sessions" ADD CONSTRAINT "game_sessions_score_not_null" NOT NULL score;
ALTER TABLE "game_sessions" ADD CONSTRAINT "game_sessions_session_id_not_null" NOT NULL session_id;
ALTER TABLE "game_sessions" ADD CONSTRAINT "game_sessions_status_check" CHECK (status = ANY (ARRAY['in_progress'::text, 'won'::text, 'lost'::text, 'exhausted'::text]));
ALTER TABLE "game_sessions" ADD CONSTRAINT "game_sessions_status_not_null" NOT NULL status;
ALTER TABLE "game_sessions" ADD CONSTRAINT "game_sessions_student_id_not_null" NOT NULL student_id;
ALTER TABLE "game_sessions" ADD CONSTRAINT "game_sessions_updated_at_not_null" NOT NULL updated_at;
ALTER TABLE "game_turn_cards" ADD CONSTRAINT "game_turn_cards_card_index_check" CHECK (card_index >= 0 AND card_index <= 2);
ALTER TABLE "game_turn_cards" ADD CONSTRAINT "game_turn_cards_card_index_not_null" NOT NULL card_index;
ALTER TABLE "game_turn_cards" ADD CONSTRAINT "game_turn_cards_difficulty_level_check" CHECK (difficulty_level >= 1 AND difficulty_level <= 5);
ALTER TABLE "game_turn_cards" ADD CONSTRAINT "game_turn_cards_difficulty_not_null" NOT NULL difficulty_level;
ALTER TABLE "game_turn_cards" ADD CONSTRAINT "game_turn_cards_pkey" PRIMARY KEY (turn_id, card_index);
ALTER TABLE "game_turn_cards" ADD CONSTRAINT "game_turn_cards_question_id_not_null" NOT NULL question_id;
ALTER TABLE "game_turn_cards" ADD CONSTRAINT "game_turn_cards_session_id_not_null" NOT NULL session_id;
ALTER TABLE "game_turn_cards" ADD CONSTRAINT "game_turn_cards_session_id_question_id_key" UNIQUE (session_id, question_id);
ALTER TABLE "game_turn_cards" ADD CONSTRAINT "game_turn_cards_turn_id_not_null" NOT NULL turn_id;
ALTER TABLE "game_turn_cards" ADD CONSTRAINT "game_turn_cards_turn_id_question_id_key" UNIQUE (turn_id, question_id);
ALTER TABLE "game_turns" ADD CONSTRAINT "game_turns_check" CHECK (chosen_option_id IS NULL AND is_correct IS NULL AND answered_at IS NULL AND cure_after IS NULL AND hearts_after IS NULL OR chosen_option_id IS NOT NULL AND is_correct IS NOT NULL AND answered_at IS NOT NULL AND cure_after IS NOT NULL AND hearts_after IS NOT NULL);
ALTER TABLE "game_turns" ADD CONSTRAINT "game_turns_created_at_not_null" NOT NULL created_at;
ALTER TABLE "game_turns" ADD CONSTRAINT "game_turns_cure_after_check" CHECK (cure_after >= 0 AND cure_after <= 100);
ALTER TABLE "game_turns" ADD CONSTRAINT "game_turns_cure_before_check" CHECK (cure_before >= 0 AND cure_before <= 100);
ALTER TABLE "game_turns" ADD CONSTRAINT "game_turns_cure_before_not_null" NOT NULL cure_before;
ALTER TABLE "game_turns" ADD CONSTRAINT "game_turns_hearts_after_check" CHECK (hearts_after >= 0 AND hearts_after <= 3);
ALTER TABLE "game_turns" ADD CONSTRAINT "game_turns_hearts_before_check" CHECK (hearts_before >= 0 AND hearts_before <= 3);
ALTER TABLE "game_turns" ADD CONSTRAINT "game_turns_hearts_before_not_null" NOT NULL hearts_before;
ALTER TABLE "game_turns" ADD CONSTRAINT "game_turns_pkey" PRIMARY KEY (turn_id);
ALTER TABLE "game_turns" ADD CONSTRAINT "game_turns_score_delta_check" CHECK (score_delta >= 0);
ALTER TABLE "game_turns" ADD CONSTRAINT "game_turns_score_delta_not_null" NOT NULL score_delta;
ALTER TABLE "game_turns" ADD CONSTRAINT "game_turns_session_id_not_null" NOT NULL session_id;
ALTER TABLE "game_turns" ADD CONSTRAINT "game_turns_session_id_turn_number_key" UNIQUE (session_id, turn_number);
ALTER TABLE "game_turns" ADD CONSTRAINT "game_turns_turn_id_not_null" NOT NULL turn_id;
ALTER TABLE "game_turns" ADD CONSTRAINT "game_turns_turn_id_session_id_key" UNIQUE (turn_id, session_id);
ALTER TABLE "game_turns" ADD CONSTRAINT "game_turns_turn_number_check" CHECK (turn_number >= 1);
ALTER TABLE "game_turns" ADD CONSTRAINT "game_turns_turn_number_not_null" NOT NULL turn_number;
ALTER TABLE "game_types" ADD CONSTRAINT "game_types_display_name_not_null" NOT NULL display_name;
ALTER TABLE "game_types" ADD CONSTRAINT "game_types_game_type_id_not_null" NOT NULL game_type_id;
ALTER TABLE "game_types" ADD CONSTRAINT "game_types_is_enabled_not_null" NOT NULL is_enabled;
ALTER TABLE "game_types" ADD CONSTRAINT "game_types_key_key" UNIQUE (key);
ALTER TABLE "game_types" ADD CONSTRAINT "game_types_key_not_null" NOT NULL key;
ALTER TABLE "game_types" ADD CONSTRAINT "game_types_pkey" PRIMARY KEY (game_type_id);
ALTER TABLE "games" ADD CONSTRAINT "games_created_date_not_null" NOT NULL created_date;
ALTER TABLE "games" ADD CONSTRAINT "games_game_id_not_null" NOT NULL game_id;
ALTER TABLE "games" ADD CONSTRAINT "games_game_type_id_not_null" NOT NULL game_type_id;
ALTER TABLE "games" ADD CONSTRAINT "games_pkey" PRIMARY KEY (game_id);
ALTER TABLE "games" ADD CONSTRAINT "games_quiz_id_game_type_id_key" UNIQUE (quiz_id, game_type_id);
ALTER TABLE "games" ADD CONSTRAINT "games_quiz_id_not_null" NOT NULL quiz_id;
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_group_id_not_null" NOT NULL group_id;
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_joined_date_not_null" NOT NULL joined_date;
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_pkey" PRIMARY KEY (group_id, student_id);
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_student_id_not_null" NOT NULL student_id;
ALTER TABLE "modules" ADD CONSTRAINT "modules_created_date_not_null" NOT NULL created_date;
ALTER TABLE "modules" ADD CONSTRAINT "modules_join_code_check" CHECK (length(TRIM(BOTH FROM join_code)) >= 12);
ALTER TABLE "modules" ADD CONSTRAINT "modules_join_code_key" UNIQUE (join_code);
ALTER TABLE "modules" ADD CONSTRAINT "modules_join_code_not_null" NOT NULL join_code;
ALTER TABLE "modules" ADD CONSTRAINT "modules_lecturer_id_not_null" NOT NULL lecturer_id;
ALTER TABLE "modules" ADD CONSTRAINT "modules_module_code_check" CHECK (length(TRIM(BOTH FROM module_code)) > 0);
ALTER TABLE "modules" ADD CONSTRAINT "modules_module_code_key" UNIQUE (module_code);
ALTER TABLE "modules" ADD CONSTRAINT "modules_module_code_not_null" NOT NULL module_code;
ALTER TABLE "modules" ADD CONSTRAINT "modules_module_id_not_null" NOT NULL module_id;
ALTER TABLE "modules" ADD CONSTRAINT "modules_module_name_check" CHECK (length(TRIM(BOTH FROM module_name)) > 0);
ALTER TABLE "modules" ADD CONSTRAINT "modules_module_name_not_null" NOT NULL module_name;
ALTER TABLE "modules" ADD CONSTRAINT "modules_pkey" PRIMARY KEY (module_id);
ALTER TABLE "question_options" ADD CONSTRAINT "question_options_is_correct_not_null" NOT NULL is_correct;
ALTER TABLE "question_options" ADD CONSTRAINT "question_options_option_id_not_null" NOT NULL option_id;
ALTER TABLE "question_options" ADD CONSTRAINT "question_options_option_text_check" CHECK (length(TRIM(BOTH FROM option_text)) > 0);
ALTER TABLE "question_options" ADD CONSTRAINT "question_options_option_text_not_null" NOT NULL option_text;
ALTER TABLE "question_options" ADD CONSTRAINT "question_options_pkey" PRIMARY KEY (option_id);
ALTER TABLE "question_options" ADD CONSTRAINT "question_options_question_id_not_null" NOT NULL question_id;
ALTER TABLE "question_options" ADD CONSTRAINT "question_options_question_id_option_id_key" UNIQUE (question_id, option_id);
ALTER TABLE "questions" ADD CONSTRAINT "questions_difficulty_level_check" CHECK (difficulty_level >= 1 AND difficulty_level <= 5);
ALTER TABLE "questions" ADD CONSTRAINT "questions_difficulty_not_null" NOT NULL difficulty_level;
ALTER TABLE "questions" ADD CONSTRAINT "questions_explanation_length_check" CHECK (explanation IS NULL OR length(TRIM(BOTH FROM explanation)) >= 1 AND length(TRIM(BOTH FROM explanation)) <= 300);
ALTER TABLE "questions" ADD CONSTRAINT "questions_marks_check" CHECK (marks > 0::numeric);
ALTER TABLE "questions" ADD CONSTRAINT "questions_marks_not_null" NOT NULL marks;
ALTER TABLE "questions" ADD CONSTRAINT "questions_pkey" PRIMARY KEY (question_id);
ALTER TABLE "questions" ADD CONSTRAINT "questions_question_id_not_null" NOT NULL question_id;
ALTER TABLE "questions" ADD CONSTRAINT "questions_question_id_quiz_id_key" UNIQUE (question_id, quiz_id);
ALTER TABLE "questions" ADD CONSTRAINT "questions_question_text_check" CHECK (length(TRIM(BOTH FROM question_text)) > 0);
ALTER TABLE "questions" ADD CONSTRAINT "questions_question_text_not_null" NOT NULL question_text;
ALTER TABLE "questions" ADD CONSTRAINT "questions_quiz_id_not_null" NOT NULL quiz_id;
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_attempt_id_not_null" NOT NULL attempt_id;
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_attempt_id_quiz_id_key" UNIQUE (attempt_id, quiz_id);
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_check" CHECK (completion_time IS NULL OR completion_time >= start_time);
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_check1" CHECK (is_scored = false OR completion_time IS NOT NULL);
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_is_scored_not_null" NOT NULL is_scored;
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_pkey" PRIMARY KEY (attempt_id);
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_quiz_id_not_null" NOT NULL quiz_id;
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_score_check" CHECK (score IS NULL OR score >= 0::numeric);
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_start_time_not_null" NOT NULL start_time;
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_student_id_not_null" NOT NULL student_id;
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_check" CHECK (NOT is_competitive OR max_scored_attempts = 1);
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_created_by_not_null" NOT NULL created_by;
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_is_competitive_not_null" NOT NULL is_competitive;
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_max_scored_attempts_check" CHECK (max_scored_attempts >= 1);
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_max_scored_attempts_not_null" NOT NULL max_scored_attempts;
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_module_id_not_null" NOT NULL module_id;
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_pkey" PRIMARY KEY (quiz_id);
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_quiz_id_not_null" NOT NULL quiz_id;
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_status_not_null" NOT NULL status;
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_title_check" CHECK (length(TRIM(BOTH FROM title)) > 0);
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_title_not_null" NOT NULL title;
ALTER TABLE "resources" ADD CONSTRAINT "resources_created_date_not_null" NOT NULL created_date;
ALTER TABLE "resources" ADD CONSTRAINT "resources_file_location_not_null" NOT NULL file_location;
ALTER TABLE "resources" ADD CONSTRAINT "resources_file_size_bytes_check" CHECK (file_size_bytes > 0);
ALTER TABLE "resources" ADD CONSTRAINT "resources_file_size_bytes_not_null" NOT NULL file_size_bytes;
ALTER TABLE "resources" ADD CONSTRAINT "resources_module_id_not_null" NOT NULL module_id;
ALTER TABLE "resources" ADD CONSTRAINT "resources_pkey" PRIMARY KEY (resource_id);
ALTER TABLE "resources" ADD CONSTRAINT "resources_resource_id_not_null" NOT NULL resource_id;
ALTER TABLE "resources" ADD CONSTRAINT "resources_resource_type_not_null" NOT NULL resource_type;
ALTER TABLE "resources" ADD CONSTRAINT "resources_title_check" CHECK (length(TRIM(BOTH FROM title)) > 0);
ALTER TABLE "resources" ADD CONSTRAINT "resources_title_not_null" NOT NULL title;
ALTER TABLE "resources" ADD CONSTRAINT "resources_uploaded_by_not_null" NOT NULL uploaded_by;
ALTER TABLE "schema_migrations" ADD CONSTRAINT "schema_migrations_applied_at_not_null" NOT NULL applied_at;
ALTER TABLE "schema_migrations" ADD CONSTRAINT "schema_migrations_pkey" PRIMARY KEY (version);
ALTER TABLE "schema_migrations" ADD CONSTRAINT "schema_migrations_version_not_null" NOT NULL version;
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_check" CHECK (expires_at > created_at);
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_check1" CHECK (revoked_at IS NULL OR revoked_at >= created_at);
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_created_at_not_null" NOT NULL created_at;
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_expires_at_not_null" NOT NULL expires_at;
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_pkey" PRIMARY KEY (session_id);
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_session_id_not_null" NOT NULL session_id;
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_token_hash_key" UNIQUE (token_hash);
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_token_hash_not_null" NOT NULL token_hash;
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_not_null" NOT NULL user_id;
ALTER TABLE "student_answers" ADD CONSTRAINT "student_answers_answer_id_not_null" NOT NULL answer_id;
ALTER TABLE "student_answers" ADD CONSTRAINT "student_answers_attempt_id_not_null" NOT NULL attempt_id;
ALTER TABLE "student_answers" ADD CONSTRAINT "student_answers_attempt_id_question_id_key" UNIQUE (attempt_id, question_id);
ALTER TABLE "student_answers" ADD CONSTRAINT "student_answers_is_correct_not_null" NOT NULL is_correct;
ALTER TABLE "student_answers" ADD CONSTRAINT "student_answers_option_id_not_null" NOT NULL option_id;
ALTER TABLE "student_answers" ADD CONSTRAINT "student_answers_pkey" PRIMARY KEY (answer_id);
ALTER TABLE "student_answers" ADD CONSTRAINT "student_answers_question_id_not_null" NOT NULL question_id;
ALTER TABLE "study_groups" ADD CONSTRAINT "study_groups_created_by_not_null" NOT NULL created_by;
ALTER TABLE "study_groups" ADD CONSTRAINT "study_groups_created_date_not_null" NOT NULL created_date;
ALTER TABLE "study_groups" ADD CONSTRAINT "study_groups_group_id_not_null" NOT NULL group_id;
ALTER TABLE "study_groups" ADD CONSTRAINT "study_groups_group_name_check" CHECK (length(TRIM(BOTH FROM group_name)) > 0);
ALTER TABLE "study_groups" ADD CONSTRAINT "study_groups_group_name_not_null" NOT NULL group_name;
ALTER TABLE "study_groups" ADD CONSTRAINT "study_groups_module_id_group_name_key" UNIQUE (module_id, group_name);
ALTER TABLE "study_groups" ADD CONSTRAINT "study_groups_module_id_not_null" NOT NULL module_id;
ALTER TABLE "study_groups" ADD CONSTRAINT "study_groups_pkey" PRIMARY KEY (group_id);
ALTER TABLE "topics" ADD CONSTRAINT "topics_module_id_name_key" UNIQUE (module_id, name);
ALTER TABLE "topics" ADD CONSTRAINT "topics_module_id_not_null" NOT NULL module_id;
ALTER TABLE "topics" ADD CONSTRAINT "topics_name_check" CHECK (length(TRIM(BOTH FROM name)) > 0);
ALTER TABLE "topics" ADD CONSTRAINT "topics_name_not_null" NOT NULL name;
ALTER TABLE "topics" ADD CONSTRAINT "topics_pkey" PRIMARY KEY (topic_id);
ALTER TABLE "topics" ADD CONSTRAINT "topics_topic_id_not_null" NOT NULL topic_id;
ALTER TABLE "users" ADD CONSTRAINT "users_created_date_not_null" NOT NULL created_date;
ALTER TABLE "users" ADD CONSTRAINT "users_email_check" CHECK (email = lower(email));
ALTER TABLE "users" ADD CONSTRAINT "users_email_not_null" NOT NULL email;
ALTER TABLE "users" ADD CONSTRAINT "users_extended_time_not_null" NOT NULL extended_time;
ALTER TABLE "users" ADD CONSTRAINT "users_full_name_check" CHECK (length(TRIM(BOTH FROM full_name)) > 0);
ALTER TABLE "users" ADD CONSTRAINT "users_full_name_not_null" NOT NULL full_name;
ALTER TABLE "users" ADD CONSTRAINT "users_password_hash_not_null" NOT NULL password_hash;
ALTER TABLE "users" ADD CONSTRAINT "users_pkey" PRIMARY KEY (user_id);
ALTER TABLE "users" ADD CONSTRAINT "users_role_not_null" NOT NULL role;
ALTER TABLE "users" ADD CONSTRAINT "users_user_id_not_null" NOT NULL user_id;

ALTER TABLE "ai_generation_jobs" ADD CONSTRAINT "ai_generation_jobs_quiz_id_fkey" FOREIGN KEY (quiz_id) REFERENCES quizzes(quiz_id) ON DELETE RESTRICT;
ALTER TABLE "ai_generation_jobs" ADD CONSTRAINT "ai_generation_jobs_requested_by_fkey" FOREIGN KEY (requested_by) REFERENCES users(user_id) ON DELETE RESTRICT;
ALTER TABLE "ai_generation_jobs" ADD CONSTRAINT "ai_generation_jobs_resource_id_fkey" FOREIGN KEY (resource_id) REFERENCES resources(resource_id) ON DELETE RESTRICT;
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_module_id_fkey" FOREIGN KEY (module_id) REFERENCES modules(module_id) ON DELETE RESTRICT;
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_student_id_fkey" FOREIGN KEY (student_id) REFERENCES users(user_id) ON DELETE RESTRICT;
ALTER TABLE "game_personal_bests" ADD CONSTRAINT "game_personal_bests_game_type_id_fkey" FOREIGN KEY (game_type_id) REFERENCES game_types(game_type_id) ON DELETE RESTRICT;
ALTER TABLE "game_personal_bests" ADD CONSTRAINT "game_personal_bests_quiz_id_fkey" FOREIGN KEY (quiz_id) REFERENCES quizzes(quiz_id) ON DELETE CASCADE;
ALTER TABLE "game_personal_bests" ADD CONSTRAINT "game_personal_bests_student_id_fkey" FOREIGN KEY (student_id) REFERENCES users(user_id) ON DELETE CASCADE;
ALTER TABLE "game_play_moves" ADD CONSTRAINT "game_play_move_option_question_fk" FOREIGN KEY (question_id, option_id) REFERENCES question_options(question_id, option_id) ON DELETE RESTRICT;
ALTER TABLE "game_play_moves" ADD CONSTRAINT "game_play_moves_play_id_fkey" FOREIGN KEY (play_id) REFERENCES game_plays(play_id) ON DELETE CASCADE;
ALTER TABLE "game_play_moves" ADD CONSTRAINT "game_play_moves_question_id_fkey" FOREIGN KEY (question_id) REFERENCES questions(question_id) ON DELETE RESTRICT;
ALTER TABLE "game_plays" ADD CONSTRAINT "game_plays_game_type_id_fkey" FOREIGN KEY (game_type_id) REFERENCES game_types(game_type_id) ON DELETE RESTRICT;
ALTER TABLE "game_plays" ADD CONSTRAINT "game_plays_quiz_id_fkey" FOREIGN KEY (quiz_id) REFERENCES quizzes(quiz_id) ON DELETE CASCADE;
ALTER TABLE "game_plays" ADD CONSTRAINT "game_plays_student_id_fkey" FOREIGN KEY (student_id) REFERENCES users(user_id) ON DELETE RESTRICT;
ALTER TABLE "game_sessions" ADD CONSTRAINT "game_sessions_game_id_fkey" FOREIGN KEY (game_id) REFERENCES games(game_id) ON DELETE CASCADE;
ALTER TABLE "game_sessions" ADD CONSTRAINT "game_sessions_student_id_fkey" FOREIGN KEY (student_id) REFERENCES users(user_id) ON DELETE RESTRICT;
ALTER TABLE "game_turn_cards" ADD CONSTRAINT "game_turn_cards_question_id_fkey" FOREIGN KEY (question_id) REFERENCES questions(question_id) ON DELETE RESTRICT;
ALTER TABLE "game_turn_cards" ADD CONSTRAINT "game_turn_cards_turn_id_session_id_fkey" FOREIGN KEY (turn_id, session_id) REFERENCES game_turns(turn_id, session_id) ON DELETE CASCADE;
ALTER TABLE "game_turns" ADD CONSTRAINT "game_turn_chosen_card_fk" FOREIGN KEY (turn_id, chosen_question_id) REFERENCES game_turn_cards(turn_id, question_id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "game_turns" ADD CONSTRAINT "game_turn_option_question_fk" FOREIGN KEY (chosen_question_id, chosen_option_id) REFERENCES question_options(question_id, option_id) ON DELETE RESTRICT;
ALTER TABLE "game_turns" ADD CONSTRAINT "game_turns_chosen_question_id_fkey" FOREIGN KEY (chosen_question_id) REFERENCES questions(question_id) ON DELETE RESTRICT;
ALTER TABLE "game_turns" ADD CONSTRAINT "game_turns_session_id_fkey" FOREIGN KEY (session_id) REFERENCES game_sessions(session_id) ON DELETE CASCADE;
ALTER TABLE "games" ADD CONSTRAINT "games_game_type_id_fk" FOREIGN KEY (game_type_id) REFERENCES game_types(game_type_id) ON DELETE RESTRICT;
ALTER TABLE "games" ADD CONSTRAINT "games_game_type_id_fkey" FOREIGN KEY (game_type_id) REFERENCES game_types(game_type_id) ON DELETE RESTRICT;
ALTER TABLE "games" ADD CONSTRAINT "games_quiz_id_fkey" FOREIGN KEY (quiz_id) REFERENCES quizzes(quiz_id) ON DELETE CASCADE;
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_group_id_fkey" FOREIGN KEY (group_id) REFERENCES study_groups(group_id) ON DELETE CASCADE;
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_student_id_fkey" FOREIGN KEY (student_id) REFERENCES users(user_id) ON DELETE RESTRICT;
ALTER TABLE "modules" ADD CONSTRAINT "modules_lecturer_id_fkey" FOREIGN KEY (lecturer_id) REFERENCES users(user_id) ON DELETE RESTRICT;
ALTER TABLE "question_options" ADD CONSTRAINT "question_options_question_id_fkey" FOREIGN KEY (question_id) REFERENCES questions(question_id) ON DELETE CASCADE;
ALTER TABLE "questions" ADD CONSTRAINT "questions_quiz_id_fkey" FOREIGN KEY (quiz_id) REFERENCES quizzes(quiz_id) ON DELETE CASCADE;
ALTER TABLE "questions" ADD CONSTRAINT "questions_topic_id_fkey" FOREIGN KEY (topic_id) REFERENCES topics(topic_id) ON DELETE RESTRICT;
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_quiz_id_fkey" FOREIGN KEY (quiz_id) REFERENCES quizzes(quiz_id) ON DELETE RESTRICT;
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_student_id_fkey" FOREIGN KEY (student_id) REFERENCES users(user_id) ON DELETE RESTRICT;
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_created_by_fkey" FOREIGN KEY (created_by) REFERENCES users(user_id) ON DELETE RESTRICT;
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_module_id_fkey" FOREIGN KEY (module_id) REFERENCES modules(module_id) ON DELETE RESTRICT;
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_resource_id_fkey" FOREIGN KEY (resource_id) REFERENCES resources(resource_id) ON DELETE RESTRICT;
ALTER TABLE "resources" ADD CONSTRAINT "resources_group_id_fkey" FOREIGN KEY (group_id) REFERENCES study_groups(group_id) ON DELETE RESTRICT;
ALTER TABLE "resources" ADD CONSTRAINT "resources_module_id_fkey" FOREIGN KEY (module_id) REFERENCES modules(module_id) ON DELETE RESTRICT;
ALTER TABLE "resources" ADD CONSTRAINT "resources_uploaded_by_fkey" FOREIGN KEY (uploaded_by) REFERENCES users(user_id) ON DELETE RESTRICT;
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE;
ALTER TABLE "student_answers" ADD CONSTRAINT "student_answers_attempt_id_fkey" FOREIGN KEY (attempt_id) REFERENCES quiz_attempts(attempt_id) ON DELETE CASCADE;
ALTER TABLE "student_answers" ADD CONSTRAINT "student_answers_option_id_fkey" FOREIGN KEY (option_id) REFERENCES question_options(option_id) ON DELETE RESTRICT;
ALTER TABLE "student_answers" ADD CONSTRAINT "student_answers_question_id_fkey" FOREIGN KEY (question_id) REFERENCES questions(question_id) ON DELETE RESTRICT;
ALTER TABLE "study_groups" ADD CONSTRAINT "study_groups_created_by_fkey" FOREIGN KEY (created_by) REFERENCES users(user_id) ON DELETE RESTRICT;
ALTER TABLE "study_groups" ADD CONSTRAINT "study_groups_module_id_fkey" FOREIGN KEY (module_id) REFERENCES modules(module_id) ON DELETE RESTRICT;
ALTER TABLE "topics" ADD CONSTRAINT "topics_module_id_fkey" FOREIGN KEY (module_id) REFERENCES modules(module_id) ON DELETE RESTRICT;

CREATE OR REPLACE FUNCTION public.require_role(p_user_id uuid, p_role user_role)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users WHERE user_id = p_user_id AND role = p_role) THEN
    RAISE EXCEPTION 'role constraint violated' USING ERRCODE = '23514';
  END IF;
END; $function$;

CREATE OR REPLACE FUNCTION public.enforce_module_lecturer_role()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN PERFORM require_role(NEW.lecturer_id, 'lecturer'); RETURN NEW; END; $function$;

CREATE OR REPLACE FUNCTION public.enforce_enrollment_student_role()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users WHERE user_id = NEW.student_id AND role = 'student') THEN
    RAISE EXCEPTION 'role constraint violated' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END; $function$;

CREATE OR REPLACE FUNCTION public.enforce_group_member_student_role()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN PERFORM require_role(NEW.student_id, 'student'); RETURN NEW; END; $function$;

CREATE OR REPLACE FUNCTION public.enforce_attempt_student_role()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN PERFORM require_role(NEW.student_id, 'student'); RETURN NEW; END; $function$;

CREATE OR REPLACE FUNCTION public.enforce_group_membership()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE module_for_group uuid;
BEGIN
  SELECT module_id INTO module_for_group FROM study_groups WHERE group_id = NEW.group_id;
  IF NOT EXISTS (SELECT 1 FROM enrollments WHERE module_id = module_for_group AND student_id = NEW.student_id) THEN
    RAISE EXCEPTION 'group member must be enrolled in the group module' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END; $function$;

CREATE OR REPLACE FUNCTION public.enforce_resource_scope()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.group_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM study_groups WHERE group_id = NEW.group_id AND module_id = NEW.module_id) THEN
    RAISE EXCEPTION 'resource group must belong to resource module' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END; $function$;

CREATE OR REPLACE FUNCTION public.enforce_quiz_ownership()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  PERFORM require_role(NEW.created_by, 'lecturer');
  IF NOT EXISTS (SELECT 1 FROM modules WHERE module_id = NEW.module_id AND lecturer_id = NEW.created_by) THEN
    RAISE EXCEPTION 'quiz creator must own module' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END; $function$;

CREATE OR REPLACE FUNCTION public.enforce_answer_consistency()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE attempt_quiz uuid; option_question uuid; question_quiz uuid;
BEGIN
  SELECT quiz_id INTO attempt_quiz FROM quiz_attempts WHERE attempt_id = NEW.attempt_id;
  SELECT question_id INTO option_question FROM question_options WHERE option_id = NEW.option_id;
  SELECT quiz_id INTO question_quiz FROM questions WHERE question_id = NEW.question_id;
  IF option_question IS DISTINCT FROM NEW.question_id OR question_quiz IS DISTINCT FROM attempt_quiz THEN
    RAISE EXCEPTION 'answer does not match attempt question and option' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END; $function$;

CREATE OR REPLACE FUNCTION public.touch_job_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $function$;

CREATE OR REPLACE FUNCTION public.attach_infected_game()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  INSERT INTO games (quiz_id, game_type_id)
  SELECT NEW.quiz_id, game_type_id FROM game_types WHERE key='infected'
  ON CONFLICT (quiz_id, game_type_id) DO NOTHING;
  RETURN NEW;
END; $function$;

CREATE OR REPLACE FUNCTION public.enforce_game_session_scope()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
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
END; $function$;

CREATE OR REPLACE FUNCTION public.enforce_game_turn_card_scope()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
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
END; $function$;

CREATE OR REPLACE FUNCTION public.enforce_game_turn_answer_once()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
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
END; $function$;

CREATE OR REPLACE FUNCTION public.touch_game_session_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN NEW.updated_at=now(); RETURN NEW; END; $function$;

CREATE OR REPLACE FUNCTION public.enforce_generic_play_scope()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
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
END; $function$;

CREATE OR REPLACE FUNCTION public.enforce_game_play_move_insert()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
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
END; $function$;

CREATE OR REPLACE FUNCTION public.prevent_game_play_move_change()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  RAISE EXCEPTION 'game play moves are append-only' USING ERRCODE='23514';
END; $function$;

CREATE OR REPLACE FUNCTION public.touch_game_play_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN NEW.updated_at=now(); RETURN NEW; END; $function$;

CREATE OR REPLACE FUNCTION public.attach_enabled_quiz_games()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  INSERT INTO games (quiz_id, game_type_id)
  SELECT NEW.quiz_id, game_type_id
  FROM game_types
  WHERE is_enabled = true
  ON CONFLICT (quiz_id, game_type_id) DO NOTHING;
  RETURN NEW;
END; $function$;

CREATE OR REPLACE FUNCTION public.enforce_island_play_state()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
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
END; $function$;

CREATE OR REPLACE FUNCTION public.enforce_game_play_move_scope()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
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
END; $function$;

CREATE INDEX jobs_status_updated_idx ON public.ai_generation_jobs USING btree (status, updated_at);
CREATE INDEX enrollments_module_id_idx ON public.enrollments USING btree (module_id);
CREATE UNIQUE INDEX game_play_question_once_per_phase_attempt ON public.game_play_moves USING btree (play_id, phase_attempt, question_id) WHERE (question_id IS NOT NULL);
CREATE INDEX game_plays_quiz_type_idx ON public.game_plays USING btree (quiz_id, game_type_id, status);
CREATE INDEX game_plays_student_idx ON public.game_plays USING btree (student_id, updated_at DESC);
CREATE UNIQUE INDEX one_in_progress_generic_solo_play ON public.game_plays USING btree (game_type_id, student_id, quiz_id) WHERE ((mode = 'solo'::text) AND (status = 'in_progress'::text));
CREATE INDEX game_sessions_student_idx ON public.game_sessions USING btree (student_id, updated_at DESC);
CREATE UNIQUE INDEX one_in_progress_infected_solo_session ON public.game_sessions USING btree (game_id, student_id) WHERE ((mode = 'solo'::text) AND (status = 'in_progress'::text));
CREATE INDEX group_members_student_id_idx ON public.group_members USING btree (student_id);
CREATE INDEX modules_lecturer_id_idx ON public.modules USING btree (lecturer_id);
CREATE UNIQUE INDEX question_one_correct_option ON public.question_options USING btree (question_id) WHERE is_correct;
CREATE INDEX questions_quiz_id_idx ON public.questions USING btree (quiz_id);
CREATE INDEX attempts_quiz_score_idx ON public.quiz_attempts USING btree (quiz_id, is_scored, completion_time, score DESC);
CREATE INDEX attempts_student_id_idx ON public.quiz_attempts USING btree (student_id);
CREATE UNIQUE INDEX competitive_one_scored_attempt ON public.quiz_attempts USING btree (quiz_id, student_id) WHERE is_scored;
CREATE UNIQUE INDEX one_active_attempt_per_student_quiz ON public.quiz_attempts USING btree (quiz_id, student_id) WHERE (completion_time IS NULL);
CREATE INDEX quizzes_module_id_idx ON public.quizzes USING btree (module_id);
CREATE INDEX resources_group_id_idx ON public.resources USING btree (group_id);
CREATE INDEX resources_module_id_idx ON public.resources USING btree (module_id);
CREATE INDEX sessions_user_id_idx ON public.sessions USING btree (user_id);
CREATE INDEX answers_question_id_idx ON public.student_answers USING btree (question_id);
CREATE INDEX study_groups_module_id_idx ON public.study_groups USING btree (module_id);
CREATE INDEX topics_module_id_idx ON public.topics USING btree (module_id);
CREATE UNIQUE INDEX users_email_lower_unique ON public.users USING btree (lower(email));

-- Trigger jobs_touch_updated_at on ai_generation_jobs: CREATE TRIGGER jobs_touch_updated_at BEFORE UPDATE ON ai_generation_jobs FOR EACH ROW EXECUTE FUNCTION touch_job_updated_at()
CREATE TRIGGER jobs_touch_updated_at BEFORE UPDATE ON ai_generation_jobs FOR EACH ROW EXECUTE FUNCTION touch_job_updated_at();
-- Trigger enrollments_student_role on enrollments: CREATE TRIGGER enrollments_student_role BEFORE INSERT OR UPDATE ON enrollments FOR EACH ROW EXECUTE FUNCTION enforce_enrollment_student_role()
CREATE TRIGGER enrollments_student_role BEFORE INSERT OR UPDATE ON enrollments FOR EACH ROW EXECUTE FUNCTION enforce_enrollment_student_role();
-- Trigger game_play_move_insert_guard on game_play_moves: CREATE TRIGGER game_play_move_insert_guard BEFORE INSERT ON game_play_moves FOR EACH ROW EXECUTE FUNCTION enforce_game_play_move_insert()
CREATE TRIGGER game_play_move_insert_guard BEFORE INSERT ON game_play_moves FOR EACH ROW EXECUTE FUNCTION enforce_game_play_move_insert();
-- Trigger game_play_move_scope_required on game_play_moves: CREATE TRIGGER game_play_move_scope_required BEFORE INSERT OR UPDATE ON game_play_moves FOR EACH ROW EXECUTE FUNCTION enforce_game_play_move_scope()
CREATE TRIGGER game_play_move_scope_required BEFORE INSERT OR UPDATE ON game_play_moves FOR EACH ROW EXECUTE FUNCTION enforce_game_play_move_scope();
-- Trigger game_play_moves_append_only on game_play_moves: CREATE TRIGGER game_play_moves_append_only BEFORE DELETE OR UPDATE ON game_play_moves FOR EACH ROW EXECUTE FUNCTION prevent_game_play_move_change()
CREATE TRIGGER game_play_moves_append_only BEFORE DELETE OR UPDATE ON game_play_moves FOR EACH ROW EXECUTE FUNCTION prevent_game_play_move_change();
-- Trigger game_plays_touch_updated_at on game_plays: CREATE TRIGGER game_plays_touch_updated_at BEFORE UPDATE ON game_plays FOR EACH ROW EXECUTE FUNCTION touch_game_play_updated_at()
CREATE TRIGGER game_plays_touch_updated_at BEFORE UPDATE ON game_plays FOR EACH ROW EXECUTE FUNCTION touch_game_play_updated_at();
-- Trigger generic_play_scope_required on game_plays: CREATE TRIGGER generic_play_scope_required BEFORE INSERT OR UPDATE OF quiz_id, student_id ON game_plays FOR EACH ROW EXECUTE FUNCTION enforce_generic_play_scope()
CREATE TRIGGER generic_play_scope_required BEFORE INSERT OR UPDATE OF quiz_id, student_id ON game_plays FOR EACH ROW EXECUTE FUNCTION enforce_generic_play_scope();
-- Trigger island_play_state_required on game_plays: CREATE TRIGGER island_play_state_required BEFORE INSERT OR UPDATE ON game_plays FOR EACH ROW EXECUTE FUNCTION enforce_island_play_state()
CREATE TRIGGER island_play_state_required BEFORE INSERT OR UPDATE ON game_plays FOR EACH ROW EXECUTE FUNCTION enforce_island_play_state();
-- Trigger game_session_scope_required on game_sessions: CREATE TRIGGER game_session_scope_required BEFORE INSERT OR UPDATE OF game_id, student_id ON game_sessions FOR EACH ROW EXECUTE FUNCTION enforce_game_session_scope()
CREATE TRIGGER game_session_scope_required BEFORE INSERT OR UPDATE OF game_id, student_id ON game_sessions FOR EACH ROW EXECUTE FUNCTION enforce_game_session_scope();
-- Trigger game_sessions_touch_updated_at on game_sessions: CREATE TRIGGER game_sessions_touch_updated_at BEFORE UPDATE ON game_sessions FOR EACH ROW EXECUTE FUNCTION touch_game_session_updated_at()
CREATE TRIGGER game_sessions_touch_updated_at BEFORE UPDATE ON game_sessions FOR EACH ROW EXECUTE FUNCTION touch_game_session_updated_at();
-- Trigger game_turn_card_scope_required on game_turn_cards: CREATE TRIGGER game_turn_card_scope_required BEFORE INSERT OR UPDATE ON game_turn_cards FOR EACH ROW EXECUTE FUNCTION enforce_game_turn_card_scope()
CREATE TRIGGER game_turn_card_scope_required BEFORE INSERT OR UPDATE ON game_turn_cards FOR EACH ROW EXECUTE FUNCTION enforce_game_turn_card_scope();
-- Trigger game_turn_answer_once on game_turns: CREATE TRIGGER game_turn_answer_once BEFORE UPDATE ON game_turns FOR EACH ROW EXECUTE FUNCTION enforce_game_turn_answer_once()
CREATE TRIGGER game_turn_answer_once BEFORE UPDATE ON game_turns FOR EACH ROW EXECUTE FUNCTION enforce_game_turn_answer_once();
-- Trigger group_members_student_role on group_members: CREATE TRIGGER group_members_student_role BEFORE INSERT OR UPDATE ON group_members FOR EACH ROW EXECUTE FUNCTION enforce_group_member_student_role()
CREATE TRIGGER group_members_student_role BEFORE INSERT OR UPDATE ON group_members FOR EACH ROW EXECUTE FUNCTION enforce_group_member_student_role();
-- Trigger group_membership_required on group_members: CREATE TRIGGER group_membership_required BEFORE INSERT OR UPDATE ON group_members FOR EACH ROW EXECUTE FUNCTION enforce_group_membership()
CREATE TRIGGER group_membership_required BEFORE INSERT OR UPDATE ON group_members FOR EACH ROW EXECUTE FUNCTION enforce_group_membership();
-- Trigger modules_lecturer_role on modules: CREATE TRIGGER modules_lecturer_role BEFORE INSERT OR UPDATE ON modules FOR EACH ROW EXECUTE FUNCTION enforce_module_lecturer_role()
CREATE TRIGGER modules_lecturer_role BEFORE INSERT OR UPDATE ON modules FOR EACH ROW EXECUTE FUNCTION enforce_module_lecturer_role();
-- Trigger attempts_student_role on quiz_attempts: CREATE TRIGGER attempts_student_role BEFORE INSERT OR UPDATE ON quiz_attempts FOR EACH ROW EXECUTE FUNCTION enforce_attempt_student_role()
CREATE TRIGGER attempts_student_role BEFORE INSERT OR UPDATE ON quiz_attempts FOR EACH ROW EXECUTE FUNCTION enforce_attempt_student_role();
-- Trigger quiz_ownership_required on quizzes: CREATE TRIGGER quiz_ownership_required BEFORE INSERT OR UPDATE ON quizzes FOR EACH ROW EXECUTE FUNCTION enforce_quiz_ownership()
CREATE TRIGGER quiz_ownership_required BEFORE INSERT OR UPDATE ON quizzes FOR EACH ROW EXECUTE FUNCTION enforce_quiz_ownership();
-- Trigger quizzes_attach_enabled_games on quizzes: CREATE TRIGGER quizzes_attach_enabled_games AFTER INSERT ON quizzes FOR EACH ROW EXECUTE FUNCTION attach_enabled_quiz_games()
CREATE TRIGGER quizzes_attach_enabled_games AFTER INSERT ON quizzes FOR EACH ROW EXECUTE FUNCTION attach_enabled_quiz_games();
-- Trigger resource_scope_required on resources: CREATE TRIGGER resource_scope_required BEFORE INSERT OR UPDATE ON resources FOR EACH ROW EXECUTE FUNCTION enforce_resource_scope()
CREATE TRIGGER resource_scope_required BEFORE INSERT OR UPDATE ON resources FOR EACH ROW EXECUTE FUNCTION enforce_resource_scope();
-- Trigger answer_consistency_required on student_answers: CREATE TRIGGER answer_consistency_required BEFORE INSERT OR UPDATE ON student_answers FOR EACH ROW EXECUTE FUNCTION enforce_answer_consistency()
CREATE TRIGGER answer_consistency_required BEFORE INSERT OR UPDATE ON student_answers FOR EACH ROW EXECUTE FUNCTION enforce_answer_consistency();
COMMIT;
