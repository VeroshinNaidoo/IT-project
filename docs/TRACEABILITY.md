# EduQuest traceability

Status reflects the current local implementation. PGlite evidence is explicitly not equivalent to real PostgreSQL concurrency evidence.

## Profanity field coverage

| User-visible field                | Backend authority                  | Evidence                                                                          |
| --------------------------------- | ---------------------------------- | --------------------------------------------------------------------------------- |
| Full name at registration/profile | `nameSchema` / `noProfanity()`     | `backend/tests/profanity.test.js`; direct registration and profile-edit API tests |
| Module and study-group names      | `moduleSchema` / `groupSchema`     | API tests; profanity suite                                                        |
| Resource and quiz titles          | upload and quiz handlers           | API upload tests; profanity suite                                                 |
| Quiz questions/options and topics | quiz schema and AI worker re-check | direct API field matrix; worker integration tests                                 |

The backend never echoes the matched term or logs offending text. The filter has documented limits and requires periodic custom-list review.

| ID             | Implementation                                                    | Evidence/status                                                                                                                               |
| -------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-01          | `backend/src/app.js` registration                                 | API path implemented; route tests pending                                                                                                     |
| FR-02          | `backend/src/app.js` login/logout/session cookie                  | API path implemented; route tests pending                                                                                                     |
| FR-03          | `requireRole` and session role                                    | API path implemented; route tests pending                                                                                                     |
| FR-04          | Module creation endpoint                                          | API path implemented; route tests pending                                                                                                     |
| FR-05          | Enrollment and module listing                                     | API path implemented; route tests pending                                                                                                     |
| FR-06          | Resource upload endpoint                                          | API path implemented; upload matrix pending                                                                                                   |
| FR-07          | Resource authorization                                            | automated: ownership and role API tests                                                                                                       |
| FR-08          | Study group create/join endpoints                                 | API path implemented; route tests pending                                                                                                     |
| FR-09          | Group resource visibility                                         | automated: group visibility API test                                                                                                          |
| FR-10          | AI service contracts                                              | `ai-service/app.py` implemented                                                                                                               |
| FR-11          | Quiz persistence and AI job integration                           | automated: `backend/tests/ai-worker.test.js`, `frontend/src/main.test.jsx`; games partial, pending team decision                              |
| FR-12          | Attempt start question delivery                                   | automated: `backend/tests/api.test.js`                                                                                                        |
| FR-13          | Answer persistence                                                | automated: `backend/tests/api.test.js`                                                                                                        |
| FR-14          | Server-side scoring                                               | automated: `backend/tests/api.test.js`                                                                                                        |
| FR-15          | Competitive attempt guard                                         | automated: DB invariant and API suites                                                                                                        |
| FR-16          | Derived leaderboard                                               | automated: ranking and module/group scope API test                                                                                            |
| FR-17          | Student leaderboard authorization                                 | automated: student scope and role boundary API test                                                                                           |
| FR-18          | Individual analytics                                              | automated: `/api/v1/me/analytics` API test                                                                                                    |
| FR-19          | Group analytics                                                   | automated: group average API test                                                                                                             |
| FR-20          | Module/topic analytics                                            | automated: lecturer weak-topic API test                                                                                                       |
| FR-21          | `backend/src/profanity/` and visible-text schemas                 | automated: field matrix API tests and worker re-checks                                                                                        |
| FR-22          | Infected solo engine, persistent sessions, API, and responsive UI | automated: engine property tests, DB invariants, API win/loss/exhaustion/access tests, frontend flow tests, Playwright/axe flow               |
| FR-23          | Memory Match                                                      | not started; disabled catalog row and generic storage foundation only                                                                         |
| FR-24          | Timer Trivia                                                      | not started; disabled catalog row and generic storage foundation only                                                                         |
| FR-25          | Boss Battle                                                       | not started; disabled catalog row and generic storage foundation only                                                                         |
| FR-26          | Pixel Car Racer                                                   | not started; disabled catalog row and generic storage foundation only                                                                         |
| FR-27          | Multiplayer room layer                                            | not started; no room persistence, SSE, or multiplayer behavior                                                                                |
| NFR01          | Async AI job architecture                                         | automated: `backend/tests/ai-worker.test.js`                                                                                                  |
| NFR02          | bcrypt and secure session cookies                                 | API implementation present                                                                                                                    |
| NFR03          | RBAC middleware                                                   | API implementation present                                                                                                                    |
| NFR04          | React design system                                               | automated: login axe passes in six browser/viewports; manual and remaining screens pending                                                    |
| NFR05          | Responsive CSS                                                    | automated: generation smoke passes at 390/768/1280 in both browsers; full-screen manual review pending                                        |
| NFR06          | Transactional submission                                          | API transaction path; real concurrency pending                                                                                                |
| NFR07          | Database constraints/triggers                                     | 10 DB invariant tests passed                                                                                                                  |
| NFR08          | Zod/Pydantic validation                                           | Current API/AI schemas implemented                                                                                                            |
| NFR09          | Upload size limit                                                 | Size limit implemented; magic-byte tests pending                                                                                              |
| NFR10          | Browser compatibility                                             | automated: 18 browser tests pass (9 Chromium, 9 Firefox), zero skips at 390/768/1280; complete product coverage pending                       |
| NFR11          | Separate frontend/backend/AI modules                              | Implemented                                                                                                                                   |
| NFR12          | Indexes and query paths                                           | Foundation indexes present                                                                                                                    |
| NFR13          | Backup/recovery                                                   | Native `npm run backup:pg`/`restore:pg` against real PostgreSQL; JSON fallback is separately tested and does not satisfy native-dump evidence |
| NFR14          | Resource-level authorization                                      | Partial automated coverage: matrix enumerates 26 routes but needs real cross-owner fixtures, exact 422 assertions and response schemas        |
| NFR15          | Strict AI schemas                                                 | automated: Pydantic and worker tests for difficulty/explanation shape, instruction text, length, profanity, and non-persistence               |
| NFR16          | Generic error responses                                           | API error handler implemented                                                                                                                 |
| NFR17          | Profanity, generic rejection, cooldown                            | 25 profanity tests passed; API/AI integration pending                                                                                         |
| INV-01, INV-13 | Competitive uniqueness and atomic submission                      | PGlite passes; `npm run test:db:real` required for full row-lock verification                                                                 |

Infected remains enabled and practice-only. Flashcards and the four new game catalog entries stay disabled until their individual gates pass; `speed_round` and `match_pairs` are removed. All game results remain isolated from quiz attempts, leaderboards, and scored analytics.

Automated axe/Playwright and the manual checklist remain required before NFR04/NFR05/NFR10 can be marked done. `npm run test:db:real` fails loudly unless `REAL_TEST_DATABASE_URL` is supplied; concurrency evidence is therefore marked “needs real PostgreSQL” under PGlite.

The matrix derives 32 Express routes and executes shared assertions, including all five Infected routes and the aggregate generic-game activity route. Dedicated Infected integration fixtures additionally prove real session ownership, module ownership, exact 422 unknown-field rejection, pre-answer response secrecy, and success shapes. The generic activity response is asserted to contain no student, state, question, or option data. Older routes retain the limitations documented by their existing matrix assertions, so NFR14 remains partial overall.

## Infected invariant evidence

| Invariant | Enforcement                                         | Automated evidence                                       |
| --------- | --------------------------------------------------- | -------------------------------------------------------- |
| INV-16    | Cure check plus engine clamp                        | `database.invariants.test.js`, `infected-engine.test.js` |
| INV-17    | Hearts check plus engine clamp                      | `database.invariants.test.js`, `infected-engine.test.js` |
| INV-18    | Answer trigger and transition table                 | DB raw SQL, API loss run                                 |
| INV-19    | Immutable answered turn, terminal engine/API guards | raw SQL, terminal/replay API tests                       |
| INV-20    | Unique session/question cards                       | raw SQL, card selection and exhaustion tests             |
| INV-21    | Dedicated pre-answer serializers                    | API disclosure assertions and frontend tests             |
| INV-22    | Separate game persistence                           | leaderboard/attempt isolation API test                   |
| INV-23    | Catalog lookup and enabled flag                     | raw SQL catalog assertion                                |

## Shared game-platform foundation evidence

| Invariant | Enforcement                                           | Automated evidence                                      |
| --------- | ----------------------------------------------------- | ------------------------------------------------------- |
| INV-24    | Difficulty level check and shared tier mapping        | DB, API, AI worker, and `game-foundation.test.js`       |
| INV-25    | Versioned JSONB plus game-owned Zod state schema      | DB and `game-foundation.test.js`                        |
| INV-26    | One in-progress solo play per game/user/quiz          | DB partial-unique test                                  |
| INV-27    | Uniquely ordered append-only move log                 | DB trigger/constraint test                              |
| INV-28    | Terminal generic plays reject moves                   | DB trigger test                                         |
| INV-29    | Lecturer progress is owned-module aggregate data only | Authorization-matrix ownership and response-shape tests |

FR-22 Stage 1 gate evidence: 131 JavaScript tests, 4 Python tests, and 18 browser tests passed with zero skips. Lint, Prettier, TypeScript, and the production frontend build also pass. Earlier assertion totals were manually estimated and are not treated as verified behavioral evidence.

FR-23–FR-27 Stage 0 gate evidence: 141 JavaScript tests, 4 Python tests, and 18 Chromium/Firefox browser tests passed with zero skips. Lint, Prettier, TypeScript, and the production frontend build pass. The four solo game features and multiplayer room layer remain not started.
