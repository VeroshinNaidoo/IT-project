# EduQuest Final Database ERD

```mermaid
erDiagram
  AI_GENERATION_JOBS {
    uuid job_id "PK"
    uuid requested_by "FK"
    uuid resource_id "FK"
    ai_job_status status
    integer attempts
    text error_code
    uuid quiz_id "FK"
    timestamp_with_time_zone created_at
    timestamp_with_time_zone updated_at
    integer question_count
    text difficulty
  }
  ENROLLMENTS {
    uuid enrolment_id "PK"
    uuid student_id "FK"
    uuid module_id "FK"
    timestamp_with_time_zone enrolled_date
  }
  GAME_PERSONAL_BESTS {
    uuid game_type_id "PK,FK"
    uuid student_id "PK,FK"
    uuid quiz_id "PK,FK"
    integer score
    timestamp_with_time_zone achieved_at
  }
  GAME_PLAY_MOVES {
    uuid move_id "PK"
    uuid play_id "FK"
    integer move_number
    text move_type
    jsonb payload
    jsonb state_after
    timestamp_with_time_zone created_at
    uuid question_id "FK"
    uuid option_id "FK"
    integer phase_attempt
  }
  GAME_PLAYS {
    uuid play_id "PK"
    uuid game_type_id "FK"
    uuid student_id "FK"
    uuid quiz_id "FK"
    text mode
    text status
    jsonb state
    integer score
    timestamp_with_time_zone created_at
    timestamp_with_time_zone updated_at
    timestamp_with_time_zone completed_at
  }
  GAME_SESSIONS {
    uuid session_id "PK"
    uuid game_id "FK"
    uuid student_id "FK"
    text mode
    integer cure
    integer hearts
    integer score
    text status
    timestamp_with_time_zone created_at
    timestamp_with_time_zone updated_at
    timestamp_with_time_zone completed_at
  }
  GAME_TURN_CARDS {
    uuid turn_id "PK,FK"
    uuid session_id "FK"
    integer card_index "PK"
    uuid question_id "FK"
    smallint difficulty_level
  }
  GAME_TURNS {
    uuid turn_id "PK,FK"
    uuid session_id "FK"
    integer turn_number
    uuid chosen_question_id "FK"
    uuid chosen_option_id "FK"
    boolean is_correct
    integer cure_before
    integer cure_after
    integer hearts_before
    integer hearts_after
    integer score_delta
    timestamp_with_time_zone created_at
    timestamp_with_time_zone answered_at
  }
  GAME_TYPES {
    uuid game_type_id "PK"
    text key
    text display_name
    boolean is_enabled
  }
  GAMES {
    uuid game_id "PK"
    uuid quiz_id "FK"
    uuid game_type_id "FK"
    timestamp_with_time_zone created_date
  }
  GROUP_MEMBERS {
    uuid group_id "PK,FK"
    uuid student_id "PK,FK"
    timestamp_with_time_zone joined_date
  }
  MODULES {
    uuid module_id "PK"
    uuid lecturer_id "FK"
    text module_code
    text module_name
    text join_code
    timestamp_with_time_zone created_date
  }
  QUESTION_OPTIONS {
    uuid option_id "PK"
    uuid question_id "FK"
    text option_text
    boolean is_correct
  }
  QUESTIONS {
    uuid question_id "PK"
    uuid quiz_id "FK"
    uuid topic_id "FK"
    text question_text
    numeric_8,2 marks
    smallint difficulty_level
    text explanation
  }
  QUIZ_ATTEMPTS {
    uuid attempt_id "PK"
    uuid quiz_id "FK"
    uuid student_id "FK"
    numeric_10,2 score
    timestamp_with_time_zone start_time
    timestamp_with_time_zone completion_time
    boolean is_scored
  }
  QUIZZES {
    uuid quiz_id "PK"
    uuid module_id "FK"
    uuid resource_id "FK"
    uuid created_by "FK"
    text title
    boolean is_competitive
    integer max_scored_attempts
    quiz_status status
    timestamp_with_time_zone closes_at
  }
  RESOURCES {
    uuid resource_id "PK"
    uuid uploaded_by "FK"
    uuid module_id "FK"
    uuid group_id "FK"
    text title
    text resource_type
    text file_location
    bigint file_size_bytes
    timestamp_with_time_zone created_date
  }
  SCHEMA_MIGRATIONS {
    text version "PK"
    timestamp_with_time_zone applied_at
  }
  SESSIONS {
    uuid session_id "PK"
    uuid user_id "FK"
    text token_hash
    timestamp_with_time_zone created_at
    timestamp_with_time_zone expires_at
    timestamp_with_time_zone revoked_at
  }
  STUDENT_ANSWERS {
    uuid answer_id "PK"
    uuid attempt_id "FK"
    uuid question_id "FK"
    uuid option_id "FK"
    boolean is_correct
  }
  STUDY_GROUPS {
    uuid group_id "PK"
    uuid module_id "FK"
    uuid created_by "FK"
    text group_name
    timestamp_with_time_zone created_date
  }
  TOPICS {
    uuid topic_id "PK"
    uuid module_id "FK"
    text name
  }
  USERS {
    uuid user_id "PK"
    text email
    text password_hash
    user_role role
    text full_name
    timestamp_with_time_zone created_date
    boolean extended_time
  }
  QUIZZES ||--}o AI_GENERATION_JOBS : "ai_generation_jobs_quiz_id_fkey"
  USERS ||--}| AI_GENERATION_JOBS : "ai_generation_jobs_requested_by_fkey"
  RESOURCES ||--}| AI_GENERATION_JOBS : "ai_generation_jobs_resource_id_fkey"
  MODULES ||--}| ENROLLMENTS : "enrollments_module_id_fkey"
  USERS ||--}| ENROLLMENTS : "enrollments_student_id_fkey"
  GAME_TYPES ||--}| GAME_PERSONAL_BESTS : "game_personal_bests_game_type_id_fkey"
  QUIZZES ||--}| GAME_PERSONAL_BESTS : "game_personal_bests_quiz_id_fkey"
  USERS ||--}| GAME_PERSONAL_BESTS : "game_personal_bests_student_id_fkey"
  QUESTION_OPTIONS ||--}o GAME_PLAY_MOVES : "game_play_move_option_question_fk"
  GAME_PLAYS ||--}| GAME_PLAY_MOVES : "game_play_moves_play_id_fkey"
  QUESTIONS ||--}o GAME_PLAY_MOVES : "game_play_moves_question_id_fkey"
  GAME_TYPES ||--}| GAME_PLAYS : "game_plays_game_type_id_fkey"
  QUIZZES ||--}| GAME_PLAYS : "game_plays_quiz_id_fkey"
  USERS ||--}| GAME_PLAYS : "game_plays_student_id_fkey"
  GAMES ||--}| GAME_SESSIONS : "game_sessions_game_id_fkey"
  USERS ||--}| GAME_SESSIONS : "game_sessions_student_id_fkey"
  QUESTIONS ||--}| GAME_TURN_CARDS : "game_turn_cards_question_id_fkey"
  GAME_TURNS ||--}| GAME_TURN_CARDS : "game_turn_cards_turn_id_session_id_fkey"
  GAME_TURN_CARDS ||--}o GAME_TURNS : "game_turn_chosen_card_fk"
  QUESTION_OPTIONS ||--}o GAME_TURNS : "game_turn_option_question_fk"
  QUESTIONS ||--}o GAME_TURNS : "game_turns_chosen_question_id_fkey"
  GAME_SESSIONS ||--}| GAME_TURNS : "game_turns_session_id_fkey"
  GAME_TYPES ||--}| GAMES : "games_game_type_id_fk"
  GAME_TYPES ||--}| GAMES : "games_game_type_id_fkey"
  QUIZZES ||--}| GAMES : "games_quiz_id_fkey"
  STUDY_GROUPS ||--}| GROUP_MEMBERS : "group_members_group_id_fkey"
  USERS ||--}| GROUP_MEMBERS : "group_members_student_id_fkey"
  USERS ||--}| MODULES : "modules_lecturer_id_fkey"
  QUESTIONS ||--}| QUESTION_OPTIONS : "question_options_question_id_fkey"
  QUIZZES ||--}| QUESTIONS : "questions_quiz_id_fkey"
  TOPICS ||--}o QUESTIONS : "questions_topic_id_fkey"
  QUIZZES ||--}| QUIZ_ATTEMPTS : "quiz_attempts_quiz_id_fkey"
  USERS ||--}| QUIZ_ATTEMPTS : "quiz_attempts_student_id_fkey"
  USERS ||--}| QUIZZES : "quizzes_created_by_fkey"
  MODULES ||--}| QUIZZES : "quizzes_module_id_fkey"
  RESOURCES ||--}o QUIZZES : "quizzes_resource_id_fkey"
  STUDY_GROUPS ||--}o RESOURCES : "resources_group_id_fkey"
  MODULES ||--}| RESOURCES : "resources_module_id_fkey"
  USERS ||--}| RESOURCES : "resources_uploaded_by_fkey"
  USERS ||--}| SESSIONS : "sessions_user_id_fkey"
  QUIZ_ATTEMPTS ||--}| STUDENT_ANSWERS : "student_answers_attempt_id_fkey"
  QUESTION_OPTIONS ||--}| STUDENT_ANSWERS : "student_answers_option_id_fkey"
  QUESTIONS ||--}| STUDENT_ANSWERS : "student_answers_question_id_fkey"
  USERS ||--}| STUDY_GROUPS : "study_groups_created_by_fkey"
  MODULES ||--}| STUDY_GROUPS : "study_groups_module_id_fkey"
  MODULES ||--}| TOPICS : "topics_module_id_fkey"
```

Schema tables: 23. Foreign-key relationships: 46.

Rendering note: Mermaid CLI and the Mermaid npm package were unavailable in the offline environment. `erd.svg` and `erd.png` are a local readable fallback generated from this exact Mermaid entity/relationship block; the source remains the Mermaid diagram above.
