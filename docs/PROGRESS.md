# EduQuest progress

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
- Remaining hardening includes backup/restore scripts, dependency audit remediation, clean-clone validation, and complete traceability evidence.
