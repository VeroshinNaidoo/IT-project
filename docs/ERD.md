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
  USERS ||--o{ AI_GENERATION_JOBS : requests
  RESOURCES ||--o{ AI_GENERATION_JOBS : processes
  QUIZZES o|--o{ AI_GENERATION_JOBS : creates
```

Games are practice-only and reuse quiz questions. They do not create leaderboard records.
