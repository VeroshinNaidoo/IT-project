# EduQuest progress

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
