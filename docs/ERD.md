# EduQuest ERD

The Milestone 1 schema is implemented in `db/migrations/002_schema.sql` and constrained in `db/migrations/003_invariants.sql`.

```mermaid
erDiagram
  USERS ||--o{ SESSIONS : owns
  USERS ||--o{ MODULES : teaches
  USERS ||--o{ ENROLLMENTS : has
  MODULES ||--o{ ENROLLMENTS : contains
  MODULES ||--o{ STUDY_GROUPS : has
  STUDY_GROUPS ||--o{ GROUP_MEMBERS : includes
  USERS ||--o{ GROUP_MEMBERS : joins
  MODULES ||--o{ RESOURCES : contains
  STUDY_GROUPS o|--o{ RESOURCES : scopes
  MODULES ||--o{ TOPICS : defines
  MODULES ||--o{ QUIZZES : contains
  RESOURCES o|--o{ QUIZZES : derives
  QUIZZES ||--o{ QUESTIONS : contains
  TOPICS o|--o{ QUESTIONS : tags
  QUESTIONS ||--o{ QUESTION_OPTIONS : offers
  QUIZZES ||--o{ QUIZ_ATTEMPTS : receives
  QUIZ_ATTEMPTS ||--o{ STUDENT_ANSWERS : contains
  QUESTIONS ||--o{ STUDENT_ANSWERS : answers
  QUESTION_OPTIONS ||--o{ STUDENT_ANSWERS : selects
  QUIZZES ||--o{ GAMES : supports
  GAME_TYPES ||--o{ GAMES : classifies
  GAMES ||--o{ GAME_SESSIONS : runs
  USERS ||--o{ GAME_SESSIONS : plays
  GAME_SESSIONS ||--o{ GAME_TURNS : records
  GAME_TURNS ||--o{ GAME_TURN_CARDS : offers
  QUESTIONS ||--o{ GAME_TURN_CARDS : appears
  GAME_TYPES ||--o{ GAME_PLAYS : classifies
  USERS ||--o{ GAME_PLAYS : starts
  QUIZZES ||--o{ GAME_PLAYS : supplies
  GAME_PLAYS ||--o{ GAME_PLAY_MOVES : records
  GAME_TYPES ||--o{ GAME_PERSONAL_BESTS : classifies
  USERS ||--o{ GAME_PERSONAL_BESTS : earns
  QUIZZES ||--o{ GAME_PERSONAL_BESTS : tracks
  USERS ||--o{ AI_GENERATION_JOBS : requests
  RESOURCES ||--o{ AI_GENERATION_JOBS : processes
  QUIZZES o|--o{ AI_GENERATION_JOBS : creates
```

`game_types` is a data-driven catalog (`GameTypeID`, unique `Key`, `DisplayName`, `IsEnabled`). `games.GameTypeID` references it. `infected`, `island_escape`, `memory_match`, `boss_battle`, `pixel_racer`, and `timer_trivia` are enabled; `flashcards` remains disabled. The superseded `speed_round` and `match_pairs` rows are removed. Games are practice-only and reuse quiz questions; they do not create leaderboard records.

Questions use required `DifficultyLevel smallint` (1–5, default 3) and nullable `Explanation` (1–300 characters). The shared mapping is levels 1–2 Easy, 3 Medium, and 4–5 Hard.

- `game_sessions(SessionID PK, GameID FK, StudentID FK, Mode, Cure, Hearts, Score, Status, CreatedAt, UpdatedAt, CompletedAt)` stores practice-only state. A partial unique index permits one in-progress solo session per game/user.
- `game_turns(TurnID PK, SessionID FK, TurnNumber, ChosenQuestionID FK, ChosenOptionID FK, IsCorrect, CureBefore, CureAfter, HeartsBefore, HeartsAfter, ScoreDelta, CreatedAt, AnsweredAt)` records an immutable answered transition.
- `game_turn_cards(TurnID FK, SessionID FK, CardIndex, QuestionID FK, DifficultyLevel)` records offered cards. `(TurnID, CardIndex)` is the primary key and `(SessionID, QuestionID)` is unique.
- Composite foreign keys enforce that the chosen question was offered and the chosen option belongs to it. Triggers enforce quiz scope, stored difficulty, one-heart wrong-answer loss, and answer-once behavior.

Generic solo-game storage introduced by migration 007:

- `game_plays(PlayID PK, GameTypeID FK, StudentID FK, QuizID FK, Mode, Status, State jsonb, Score, CreatedAt, UpdatedAt, CompletedAt)` stores versioned game-owned state. A partial unique index permits one in-progress solo play per game type, user, and quiz.
- `game_play_moves(MoveID PK, PlayID FK, MoveNumber, MoveType, Payload jsonb, StateAfter jsonb, QuestionID FK nullable, OptionID FK nullable, PhaseAttempt nullable, CreatedAt)` is append-only and uniquely ordered within a play. Island Escape uses the question, option, and phase-attempt columns to enforce answer scope and no repeated question within an attempt.
- Checks require object-shaped versioned state and non-negative scores. Triggers enforce module scope, append-only moves, and terminal-state finality.
- `game_personal_bests(GameTypeID FK, StudentID FK, QuizID FK, Score, UpdatedAt)` stores practice-only personal records; its composite key is `(GameTypeID, StudentID, QuizID)`.

Memory Match uses `game_plays` for its versioned, Zod-validated shuffled-card state and `game_play_moves` for its append-only flip log. The partial unique index resumes the same in-progress play for a student, game type, and quiz. Pair identity and all unflipped text remain server-only; persisted client state uses opaque card IDs, kinds, face state, matched state, score, moves, and mismatch count.

Boss Battle uses the same generic tables with a versioned state containing bounded boss/player HP, score, a server-shuffled remaining-question queue, the current question, and terminal status. Each answer appends one immutable move and the play row stores the latest validated state; terminal-state and append-only triggers remain shared with the other generic games.

Pixel Car Racer uses the generic tables with versioned player and deterministic-Bot race state: bounded speed, distance, streak, points, nitro state, consumed slots, a shared server-selected question list, and terminal outcome. Each server-scored answer appends one immutable move. Race scores remain practice-only and are not queried by leaderboard or scored analytics services.

Timer Trivia uses the generic tables with a versioned topic/level board state, up to five topic columns, point rows 10–50 mapped to levels 1–5, server deadlines, answered-cell tracking, and terminal status. A user’s `extended_time` preference doubles the server deadline. The server selects each distinct question cell, owns timeout and scoring decisions, and practice results remain outside leaderboards and scored analytics.
The final identity schema also includes `users.FirstName`, nullable `users.LastName`, `users.StudentType`, `users.EmailVerifiedAt`, `email_verification_tokens`, `mfa_credentials`, and `mfa_recovery_codes` from migration 016. MFA tables are storage scaffolding only until the MFA API slice is implemented.

### Profile additions

```mermaid
erDiagram
  USERS ||--o{ USER_PREFERRED_LANGUAGES : selects
  PROGRAMMING_LANGUAGES ||--o{ USER_PREFERRED_LANGUAGES : supports
  USERS { uuid user_id PK text pending_email }
  PROGRAMMING_LANGUAGES { uuid language_id PK text name UK }
  USER_PREFERRED_LANGUAGES { uuid user_id PK_FK uuid language_id PK_FK }
```

### Module catalogue additions

`USERS.StudentYear` is nullable for lecturers and required 1–3 for students. `MODULES.Year` is 1–3, `MODULES.Programme` is `it|business|both`, `MODULES.Offering` is a non-empty offering label, and `MODULES.Description` is bounded text. The enrolled-module and resource-tile endpoints project only owner/enrollment-visible data. The look-ahead endpoint projects year-2 module metadata and topic/prerequisite hints only; it does not return resources, quizzes, answers or enrolment actions.
Study-group collaboration adds `GROUP_LANGUAGES(GroupID, LanguageID)`, `GROUP_LEADERS(GroupID, StudentID, Role)`, and `GROUP_UPDATES(UpdateID, GroupID, AuthorID, Kind, Text, TopicID, PlannedFor, CreatedAt)`. `STUDY_GROUPS` now also has `Focus`, `Description`, and `Visibility`. A database trigger prevents removing or demoting the last leader.

### Practice Labs

`LABS` stores lecturer-owned, module-scoped practice activities and kind-specific JSON configuration. `LAB_ATTEMPTS` stores one student-owned draft/progress record per lab. Submission checks are explicitly self-checked in the browser; these rows are not scored quiz attempts and are excluded from leaderboards and analytics.

For `spreadsheet` labs, `config` contains bounded starting cells, locked-cell addresses, tolerance checks and display formats. `calculator` configs contain declarative inputs and output formulas; `scenario` configs contain finite nodes, choices and meter changes. None of these configurations is executable code.

```mermaid
erDiagram
  MODULES ||--o{ LABS : contains
  USERS ||--o{ LABS : authors
  LABS ||--o{ LAB_ATTEMPTS : receives
  USERS ||--o{ LAB_ATTEMPTS : makes
  LABS { uuid lab_id PK uuid module_id FK text kind text title text instructions smallint difficulty text status uuid created_by FK jsonb config }
  LAB_ATTEMPTS { uuid attempt_id PK uuid lab_id FK uuid student_id FK jsonb submission int checks_passed int checks_total boolean completed timestamptz updated_at }
```

### Manual quiz authoring additions

`questions` now stores `question_type`, `accepted_answers`, `ignore_punctuation`, bounded code display fields and `display_order`. `student_answers.option_id` is nullable when a short-answer response is stored in `answer_text`; the check constraint requires one of those answer forms. Authoring routes remain owned by the lecturer who owns the quiz module.

### Study session additions

```mermaid
erDiagram
  STUDY_GROUPS ||--o{ GROUP_SESSIONS : schedules
  USERS ||--o{ GROUP_SESSIONS : creates
  TOPICS ||--o{ GROUP_SESSIONS : references
  GROUP_SESSIONS ||--o{ SESSION_PREPARATION_RESOURCES : includes
  RESOURCES ||--o{ SESSION_PREPARATION_RESOURCES : links
  GROUP_SESSIONS ||--o{ SESSION_RSVPS : receives
  USERS ||--o{ SESSION_RSVPS : responds
  USERS ||--o{ NOTIFICATIONS : receives
  GROUP_SESSIONS ||--o{ NOTIFICATIONS : concerns
  GROUP_SESSIONS { uuid session_id PK uuid group_id FK uuid created_by FK uuid topic_ref FK text status timestamptz starts_at timestamptz ends_at }
  SESSION_PREPARATION_RESOURCES { uuid session_id PK_FK uuid resource_id PK_FK }
  SESSION_RSVPS { uuid session_id PK_FK uuid student_id PK_FK text response }
  NOTIFICATIONS { uuid notification_id PK uuid user_id FK uuid session_id FK text kind jsonb payload timestamptz read_at text dedup_key }
```

### Study group messaging additions

```mermaid
erDiagram
  STUDY_GROUPS ||--o{ GROUP_MESSAGES : contains
  USERS ||--o{ GROUP_MESSAGES : writes
  GROUP_MESSAGES ||--o{ GROUP_MESSAGES : replies_to
  GROUP_MESSAGES ||--o{ GROUP_MESSAGE_ATTACHMENTS : has
  RESOURCES ||--o{ GROUP_MESSAGE_ATTACHMENTS : shared
  STUDY_GROUPS ||--o{ GROUP_MESSAGE_READS : tracks
  USERS ||--o{ GROUP_MESSAGE_READS : reads
  STUDY_GROUPS ||--o{ GROUP_MUTES : moderates
  USERS ||--o{ GROUP_MUTES : muted
  GROUP_MESSAGES ||--o{ MESSAGE_REPORTS : reported
  USERS ||--o{ MESSAGE_REPORTS : reports
  GROUP_MESSAGES ||--o{ NOTIFICATIONS : notifies
  GROUP_MESSAGES { uuid message_id PK uuid group_id FK uuid author_id FK text kind text body uuid reply_to_id FK boolean pinned timestamptz created_at timestamptz edited_at timestamptz deleted_at }
  GROUP_MESSAGE_ATTACHMENTS { uuid attachment_id PK uuid message_id FK uuid resource_id FK text original_name text mime_type integer size_bytes }
  GROUP_MESSAGE_READS { uuid group_id PK_FK uuid user_id PK_FK uuid last_read_message_id FK }
  GROUP_MUTES { uuid group_id PK_FK uuid user_id PK_FK timestamptz muted_until uuid muted_by FK text reason }
  MESSAGE_REPORTS { uuid report_id PK uuid message_id FK uuid reporter_id FK text reason text status timestamptz created_at }
```
