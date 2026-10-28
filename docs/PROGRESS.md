# EduQuest progress

## FR-28 — Island Escape solo — 2026-10-27

- Built the pure deterministic three-phase engine, centralized configuration, strict versioned state schema, difficulty-ramped question selection, setback/recycling rules, personal-best tracking, and replayable append-only moves.
- Added migration 008 with the enabled catalog type, Island move references, option/question scope FK, per-attempt no-repeat index, personal best table, and state/score/terminal triggers.
- Added strict start/resume, owner refresh, and row-locked idempotent answer APIs under `/api/v1/games/island-escape`, using the shared `canAccessGame` policy and pre-answer correctness boundary.
- Built the responsive accessible Island screen with original SVG art, phase/inventory/boat/sailing states, textual wrong/streak/retry/score indicators, feedback, setback, terminal, replay, loading, empty, and error states.
- Updated the seed to 40 questions across five topics and levels so Island Escape is playable after `npm run seed`.
- Gate: 177 JavaScript tests, 4 Python tests, and 24 Chromium/Firefox browser tests passed with zero skips. Lint, formatting, type-check, and production frontend build passed. FR-28 solo is done and tested; game output remains isolated from scored attempts, rankings, and analytics.

## FR-23–FR-27 Stage 0 — Shared game foundation — 2026-10-27

- Replaced three-value question difficulty storage with checked levels 1–5 and one shared Easy/Medium/Hard tier mapper. Infected behavior remains unchanged through that mapper.
- Added versioned generic `game_plays` state, append-only `game_play_moves`, active-play uniqueness, terminal guards, module-scope enforcement, per-game Zod state registration, and aggregate-only lecturer progress.
- Removed superseded catalog placeholders and added Memory Match, Timer Trivia, Boss Battle, and Pixel Car Racer as disabled rows. No new game mechanics are enabled yet.
- Updated AI contracts, worker validation, lecturer draft editing, seed data, authorization inventory, ERD, invariants, status, and traceability.
- Gate: 141 JavaScript tests, 4 Python tests, and 18 Chromium/Firefox browser tests passed with zero skips. Lint, formatting, type-check, and production frontend build passed. The dev migration and seed completed; the demo competitive quiz has 25 questions across five topics and all five levels.

## FR-22 Stage 1 — Infected solo — 2026-10-27

- Built the deterministic practice-only engine, persisted solo sessions/turns/cards, transactional and idempotent API, access checks, aggregate lecturer activity, AI difficulty/explanation contract, editable lecturer draft fields, seeded playable quiz, and responsive accessible UI.
- Enforced INV-16 through INV-22 in database constraints/triggers, service serialization, and isolated game persistence. Infected scores never enter attempts, leaderboards, or analytics.
- Verification: 131 JavaScript tests, 4 AI-service tests, and 18 Playwright/axe tests passed; 0 skipped. Lint, formatting, type-check, and production frontend build passed.
- Browser evidence covers Chromium and Firefox at 390, 768, and 1280 pixels. PGlite still cannot establish real multi-connection row-lock behavior; that remains assigned to `npm run test:db:real`.
- Group mode is deliberately not started. Stage 2 rules require approval at the Stage 1 gate.

## Local run verification — 2026-10-09

Fixed Vite API forwarding, strict login payloads, development cookie configuration,
AI worker startup, student quiz navigation, accessible navigation names, mobile
navigation labels, and document language/title/viewport metadata. Database startup
now preserves existing .env settings and removes stale PID files only when the
recorded process no longer exists. Recovered the local daemons without deleting data.

Verified 89 JavaScript tests and 4 Python tests with no skips. Added a real browser
smoke test for lecturer login, session persistence after reload, generated draft,
publishing and logout. It requires the seeded demo accounts and running local stack.
The authentication axe test covers only the login screen, not the whole product.
Final browser results: 6 Chromium tests passed and 6 Firefox tests passed, zero skips,
covering widths 390, 768 and 1280. Lint, formatting, type-check and frontend build pass.

The earlier authorization completion claim was overstated; STATUS and TRACEABILITY
now identify the missing strict validation and cross-owner evidence. Native
PostgreSQL concurrency/backup and complete screen accessibility remain outstanding.

## Milestone 1 — Foundation

- Built PostgreSQL-compatible PGlite dev/test socket servers, persistent `.pgdata`, environment generation, setup checks, migrations, schema triggers, indexes, seed tooling, and raw SQL invariant tests.
- PGlite does not provide `citext`; the approved lowercased-email/`lower(email)` unique-index fallback is active.
- Tests: 7 database invariant tests and 25 profanity tests passed; 0 skipped.

## Milestone 2 — Auth/RBAC

- Built session-cookie authentication, student-only registration, lecturer role middleware, password hashing, request validation, rate limiting, and error handling in `backend/src/app.js`.
- Verification: 13 direct API tests pass; the complete per-route authorization matrix is still pending.

## Milestone 3 — Modules/resources/groups

- Built module creation, join-code enrolment, study-group create/join, and validated resource upload endpoints.
- Verification: upload magic-byte, group-visibility, ownership and role tests pass; exhaustive matrix remains pending.

## Milestone 4 — AI/quiz generation

- Added deterministic FastAPI MockProvider endpoints with strict Pydantic quiz, mini-scope, and aggregate-analysis schemas.
- Verification: 4 pytest contract/security tests pass; persistent queue/status/worker wiring is present, integration tests remain pending.

## Milestone 5 — Quiz engine/scoring

- Built attempt start/submit transaction paths, server scoring, unanswered count, close-time checks, idempotent completed-result response, and database uniqueness guard.
- PGlite cannot fully prove row-locking concurrency; use `npm run test:db:real` with `REAL_TEST_DATABASE_URL`.

## Milestone 6 — Leaderboard/analytics

- Built derived leaderboard and lecturer weakest-topic analytics endpoints.
- Verification: endpoint exists; individual/group analytics and edge-case tests remain pending.

## Milestone 7 — Frontend

- Built responsive React shell implementing the DESIGN.md palette, sidebar navigation, dashboard, modules, leaderboard, analytics, and competitive-quiz warning views.
- Verification: production build passes; API-backed screen completion and axe/Playwright tests remain pending.

## Milestone 8 — Delivery

- Local run/test scripts and README foundation are present.
- Seed now creates demo lecturer/students, module, groups, resource, competitive/practice quizzes, and completed attempts. Remaining hardening includes backup/restore scripts, dependency audit remediation, clean-clone validation, and complete traceability evidence.
- Backup/restore scripts and a test-database round-trip check are now present. Browser/axe verification remains environment-dependent and not yet automated.

## Memory Match implementation — partial, 2026-10-28

Built and tested the deterministic Memory Match engine foundation: configurable eligible-pair card construction, kind-aware flips, pair resolution, scoring, terminal completion, and rejection of invalid flip sequences. The focused engine suite passes 4/4.

The backend start/resume and owner-scoped GET slice is implemented with the registered versioned Zod state and generic `game_plays` persistence. The behavioral authorization matrix covers both routes. Nine dedicated integration tests now prove start, same-play resume, eligibility minimum, enrolment and competitive access, lecturer ownership, whole-response answer secrecy, owner-only refresh, and isolation from attempts, leaderboards, and analytics.

Gate complete: the dedicated Memory Match suite passes 9/9 and the authorization matrix passes 39/39. The PGlite failure was test infrastructure: API test files left their shared `pg` pools open, while `npm test` relied on a long-lived daemon that was not owned by test setup/teardown. The recorded test PID remained alive after its listener disappeared, and reset failed with `read ECONNRESET`; dev and test already used separate ports/directories and Vitest file parallelism was already disabled.

The corrected runner keeps pure tests parallel, runs database files serially with one worker and a pool maximum of four, closes and leak-checks each file's pool, starts every database gate from a fresh isolated `.pgdata/test-suite`, waits for `select 1`, logs server termination, and tears the server down. A reporter makes any skipped test fail the gate. Three consecutive ordinary runs and one file-order-shuffled run each passed 192/192 tests with 0 skipped (83 pure/frontend and 109 DB/API per run).

Commits: Memory Match integration coverage `943b813`; PGlite lifecycle fix `4d2a936`. The authorization-matrix entries were already committed with the route slice in `f02bf47` before this gate and were not rewritten.

At that gate, the flip API, frontend screen, seed fixture, Playwright/axe flow, invariant/traceability/manual-test updates, and catalog enablement still remained. The engine remains frozen at commits `d0f4adc` and `7275051`. Timer Trivia, Boss Battle, and Pixel Car Racer were not started. Multiplayer was not started.

## FR-23 Memory Match — flip API slice — 2026-10-28

- Added the owner-scoped `POST /api/v1/games/memory-match/plays/:id/flip` endpoint with strict unknown-field rejection, a play row lock, frozen-engine application through a route-local state adapter, append-only moves, and atomic play-state/score/status updates.
- Duplicate delivery of the latest identical flip returns its stored response without appending or scoring twice. New moves against terminal plays, matched cards, face-up cards, same-kind pairs, and unknown cards return the standard 409/422 error shape.
- Mismatched cards remain face up for feedback; the next distinct flip atomically turns them down before beginning the next pair. Refresh returns only currently face-up or matched text, never an unflipped card's text.
- Added the flip route to the executable authorization matrix and added separately named integration coverage for full clear, mismatch recovery and clear, refresh, same-kind rejection, rapid duplicate serialization, replay, terminal rejection, text secrecy, and isolation from attempts/leaderboards/analytics.
- Gate: 202 JavaScript tests passed with 0 skipped (83 pure/frontend and 119 DB/API). Memory Match API passed 18/18 and the authorization matrix passed 40/40. Lint, formatting, and type-check passed. The frozen engine and PGlite infrastructure were not modified.

Remaining before FR-23 can be marked done: frontend screen, seed fixture, Playwright/axe flow, invariant/traceability/manual-test updates, and production catalog enablement. No other game or multiplayer work was started.
