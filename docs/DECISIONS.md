# Decisions

## 2026-10-09 — Milestone 1 foundation

- Use UUID primary keys throughout; `group_members` uses a composite `(group_id, student_id)` primary key.
- Use opaque random session tokens stored only as hashes in `sessions`; cookies are httpOnly and JWTs are not used. Logout revokes the server-side session.
- Add `ai_generation_jobs` for persistent asynchronous generation and status polling.
- Modules use a random unique `join_code` for student self-enrolment; `module_code` remains an academic identifier only.
- Add quiz `title` and optional `closes_at`; the service rejects starts and submissions after the close time with HTTP 409.
- Mini-scope is a short per-topic revision summary from one resource. Analysis is lecturer-facing and receives only aggregate topic statistics; no student names, emails, or IDs are sent to AI.
- The original catalog used `flashcards`, `speed_round`, and `match_pairs`; the 2026-10-27 Stage 0 decision below supersedes the latter two. Games remain practice-only and reuse quiz questions. Competitive games are gated until the student's scored attempt is complete; lecturers always have access.
- Game mechanics remain disabled until their named feature stage passes. Adding or enabling a catalogued type is a data change. The implemented rule is: lecturers can access games, while students can access games for a competitive quiz only after their own scored attempt is completed. The earlier database test name suggesting that all competitive games were forbidden was corrected; the service policy is the authoritative access boundary.
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

- Infected is the only enabled playable game. The later Stage 0 decision removes the superseded `speed_round` and `match_pairs` rows; every replacement game remains disabled until its own gate passes.
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

## 2026-10-27 — FR-23–FR-27 Stage 0 game platform

- Persist question difficulty as `DifficultyLevel` 1–5. The one shared `tierOf(level)` mapping is 1–2 Easy, 3 Medium, and 4–5 Hard. Infected keeps its approved Easy/Medium/Hard behavior by deriving those labels and transitions from the numeric level.
- AI quiz output must contain `difficulty_level` from 1 through 5. Missing, fractional, or out-of-range levels are invalid AI output under INV-11 and are never persisted. The deterministic MockProvider cycles through all five levels.
- `speed_round` and `match_pairs` are superseded and removed from the catalog. `flashcards` remains disabled. `memory_match`, `timer_trivia`, `boss_battle`, and `pixel_racer` are seeded disabled and may be enabled only after their own stage is green.
- Infected retains its dedicated session tables. New solo games use versioned JSONB state in `game_plays` plus append-only `game_play_moves`; each game owns a strict Zod state schema so mechanics can evolve without changing the shared storage shape.
- Generic play moves store the accepted move payload and resulting versioned state. The ordered move log is the rebuild source; terminal plays reject later moves at the database boundary.
- A lecturer’s shared game-progress view returns only game type, play count, and completion count for modules they own. It never returns user identity, state, questions, or options.
- The demo competitive quiz now has 40 questions distributed across five topics and all five levels so all approved solo games can share one stable fixture.

## 2026-10-27 — FR-28 Island Escape solo mode

- All Island Escape numbers are centralized in `backend/src/games/island_escape/config.js`: 30 minimum questions, three phases of ten, 10 base points, a three-answer streak threshold, two-times points while active, five wrong answers per setback, and three retries before the fourth setback ends the play.
- The first three consecutive correct answers score 10 each. Doubling starts on the next question, continues while answers remain correct, and affects points only. A wrong answer resets the streak and doubling.
- Phase 1 setbacks discard that attempt's materials and restart Phase 1. Phase 2 setbacks discard boat parts and restart Phase 2. Phase 3 setbacks discard the boat and return to Phase 2 while preserving Phase 1 materials. Earned score is never removed.
- Question selection prefers levels 1–2 in Phase 1, level 3 in Phase 2, and levels 4–5 in Phase 3, filling shortages from the nearest level. It uses never-asked questions first; after a setback exhausts that pool, it recycles least-recently asked questions. A question cannot repeat within one phase attempt.
- Island Escape uses the shared versioned `game_plays` and append-only `game_play_moves` records. One in-progress solo play per student/game/quiz resumes on start; terminal plays may be replayed. Personal best is stored separately per student and quiz.
- The existing `canAccessGame` rule applies unchanged. Island Escape is practice-only, and its score, state, setbacks, and personal best never affect scored attempts, leaderboards, or analytics.
- Public start/refresh responses contain the current question and options but no correctness. The correct option and explanation appear only in the answer response. There is no game free text.

## 2026-10-27 — npm audit remediation

- Non-breaking `npm audit fix` updates were applied in commit `544bd3d`: body-parser, ip-address, multer, qs, undici, and zod. The audit changed from 12 findings (5 moderate, 5 high, 2 critical) to 6 (3 moderate, 1 high, 2 critical).
- The remaining findings are dev-only: `@vitest/mocker` (moderate, transitive via Vitest; path traversal/arbitrary file read and unauthenticated manual-mock code injection), `esbuild` (moderate, transitive via Vite; dev-server cross-origin request/response exposure), `tinypool` (critical, transitive via Vitest; prototype-pollution-to-RCE worker gadget), `vite` (high, direct dev dependency; dev-server path traversal, Windows launch-editor/command and file disclosure issues), `vite-node` (moderate, transitive via Vitest/Vite; inherited Vite exposure), and `vitest` (critical, direct dev dependency; UI-server arbitrary file read/execute and related mock issues).
- These packages are not in the production backend/frontend runtime bundle. The vulnerable paths are reachable only when a developer runs local Vite/Vitest tooling, not through the deployed EduQuest API or built frontend. Mitigation: keep dev servers localhost-only and never enable Vitest UI for untrusted users.
- A deliberate patched major toolchain attempt (`vitest@5.0.5`, `vite@8.3.5`) was not retained: Vitest 5 removed the existing `describe.sequential` API and transformed the authorization-matrix guard so its required executable-assertion check failed. The compatibility failure was verified in the full suite and reverted without changing tests. Remaining findings require a coordinated test-toolchain migration; no `npm audit fix --force` was used.
- `pip-audit` was attempted but is not installed in the environment. Python dependency audit evidence remains pending installation of that tool.
