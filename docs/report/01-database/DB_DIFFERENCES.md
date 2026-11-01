# Phase 3 ERD to Final Schema Differences

| Area            | Final schema difference                                                    | Reason                                                                                                                |
| --------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Authentication  | Added sessions with opaque token hashes, expiry, and revocation            | Server-side sessions replace JWTs and support logout revocation.                                                      |
| AI generation   | Added ai_generation_jobs                                                   | Persistent queued/running/succeeded/failed job polling and retry state.                                               |
| Curriculum      | Added topics and topic foreign keys from questions                         | Topic-scoped revision, analytics, and generated content.                                                              |
| Games           | Added game_types, games, game_sessions, game_turns, game_turn_cards        | Data-driven practice games and Infected state.                                                                        |
| Generic games   | Added game_plays, game_play_moves, and game_personal_bests                 | Versioned append-only solo game state and personal records.                                                           |
| Quiz fields     | Added quizzes.Title and nullable quizzes.ClosesAt                          | Friendly quiz titles and server-side closing enforcement.                                                             |
| Module fields   | Added unique, non-guessable modules.JoinCode                               | Student self-enrolment uses join codes rather than module codes.                                                      |
| Question fields | Added questions.DifficultyLevel smallint (1–5) and nullable Explanation    | Shared difficulty tiers and post-answer explanations for games and AI content.                                        |
| Integrity       | Added partial unique indexes, composite foreign keys, checks, and triggers | Enforce one scored attempt, server-owned game state, answer scope, terminal finality, and no repeated game questions. |
| Multiplayer     | No game_rooms or game_room_players tables exist                            | Multiplayer remains intentionally out of scope.                                                                       |
