# Decisions

## 2026-10-09 — Milestone 1 foundation

- Use UUID primary keys throughout; `group_members` uses a composite `(group_id, student_id)` primary key.
- Use opaque random session tokens stored only as hashes in `sessions`; cookies are httpOnly and JWTs are not used. Logout revokes the server-side session.
- Add `ai_generation_jobs` for persistent asynchronous generation and status polling.
- Modules use a random unique `join_code` for student self-enrolment; `module_code` remains an academic identifier only.
- Add quiz `title` and optional `closes_at`; the service rejects starts and submissions after the close time with HTTP 409.
- Mini-scope is a short per-topic revision summary from one resource. Analysis is lecturer-facing and receives only aggregate topic statistics; no student names, emails, or IDs are sent to AI.
- Allowed game types are `flashcards`, `speed_round`, and `match_pairs`. Games are practice-only and reuse quiz questions. Competitive games are gated until the student's scored attempt is complete; lecturers always have access.
- Game mechanics are frozen pending team decision. The three keys are disabled placeholders in the `game_types` lookup table; adding a future type is a data change, not a migration. The implemented rule is: lecturers can access games, while students can access games for a competitive quiz only after their own scored attempt is completed. The earlier database test name suggesting that all competitive games were forbidden was corrected; the service policy is the authoritative access boundary.
- Future game modules must implement `{ key, buildFromQuiz(quiz), validate(gameData), scoring: 'none' | 'practice' }`. No game score is eligible for leaderboard records without explicit future approval.
- Unanswered questions score zero and do not create `student_answers` rows. Results report the unanswered count.
- Upload maximum defaults to 20 MiB and is configurable through environment configuration.
- `COOKIE_SECURE` defaults to true. It may be false only in development; production startup must reject that configuration.
- Leaderboards use standard competition ranking (`1, 1, 3`), ordered by score descending and earlier completion time. Equal rank requires identical score and completion time.
- NFR04, NFR05, and NFR10 use automated axe and Playwright viewport/browser checks plus a manual checklist documented in `docs/MANUAL_TESTS.md`.
- FR-21/NFR17 use the maintained `obscenity` library plus editable custom and allow JSON lists. Matching normalizes accents, leetspeak, separators, and repeated letters, then uses token boundaries and an allow-list to reduce false positives. The backend re-checks all user-visible fields and AI output; frontend checks are advisory only. Offending text is never logged or echoed, and ten violations within ten minutes trigger a temporary cooldown without an automatic ban. The confident custom terms currently included are `fok`, `kak`, `poes`, and `isifebe`; uncertain regional terms are intentionally not guessed. No filter is perfect, determined users can invent spellings, and the custom list needs periodic review.
- Deletion policy: academic records use `RESTRICT`; owned children such as options, answers, group membership, games, and questions cascade where safe.
- The requested PGlite local database is an approved local-development deviation. PGlite does not provide the `citext` contrib extension, so emails are stored lowercased with a `lower(email)` unique index and a database check. The application lowercases emails before persistence. PGlite's socket server serializes query execution; it cannot fully prove row-locking/concurrency behavior. The concurrency tests remain in the suite and are marked for real PostgreSQL verification through `REAL_TEST_DATABASE_URL`.
- PGlite also does not expose the `pgcrypto` extension, but its PostgreSQL-compatible engine provides `gen_random_uuid()` as a built-in function, so the extension request was removed without changing UUID defaults or constraints.

## 2026-10-27 — FR-22 Infected solo mode

- Infected is the only enabled playable game. `flashcards`, `speed_round`, and `match_pairs` remain disabled placeholders and their mechanics remain frozen.
- Each turn aims to offer one Easy, one Medium, and one Hard card. Missing difficulty slots are filled from any remaining unused questions. Fewer than three remaining questions produces fewer cards; no remaining questions ends the session as `exhausted` without a win or loss.
- Every question placed on a turn is considered offered, including unchosen cards, and can never be offered again in that session.
- `GAME_MIN_QUESTIONS` defaults to 6. An enabled Infected game below the threshold is listed as unavailable with the reason “Not enough questions for this game yet.”
- There is one in-progress solo session per game and user. Starting again resumes it; starting after a terminal session creates a replay. Solo v1 has no time limit.
- Infected uses `scoring: 'practice'`. Its score is cure-reward points earned for correct answers only and is stored only in `game_sessions`; it never enters quiz attempts, leaderboards, or scored-attempt analytics.
- The existing `canAccessGame` policy remains the single access boundary: enrolled students may play practice quizzes; competitive quizzes unlock only after that student completes their scored attempt. A lecturer may play games for modules they own, but normal module ownership still prevents access to another lecturer’s quiz.
- A `games` row for Infected is attached automatically when a quiz is created. This keeps session foreign keys explicit while availability remains catalog- and question-count-driven.
- Public card IDs are the underlying question UUIDs. Before a card is chosen, the API returns only difficulty, topic, reward, and penalty. Correctness and the explicit correct answer are returned only after submission.
- AI explanations must contain one or two sentences, be at most 300 characters, contain no instruction-like text, and pass the shared profanity check. The backend remains the final validation authority.
- The pre-existing game-catalog invariant was renumbered from `INV-16` to `INV-23` so the approved Infected invariants occupy `INV-16` through `INV-22` exactly.
- Stage 2 group mode is not part of the solo implementation or this decision. Its rules must be recorded separately before implementation begins.
