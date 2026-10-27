# EduQuest progress

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
