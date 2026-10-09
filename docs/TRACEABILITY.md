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

| ID             | Implementation                                    | Evidence/status                                                                    |
| -------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------- |
| FR-01          | `backend/src/app.js` registration                 | API path implemented; route tests pending                                          |
| FR-02          | `backend/src/app.js` login/logout/session cookie  | API path implemented; route tests pending                                          |
| FR-03          | `requireRole` and session role                    | API path implemented; route tests pending                                          |
| FR-04          | Module creation endpoint                          | API path implemented; route tests pending                                          |
| FR-05          | Enrollment and module listing                     | API path implemented; route tests pending                                          |
| FR-06          | Resource upload endpoint                          | API path implemented; upload matrix pending                                        |
| FR-07          | Resource authorization                            | automated: ownership and role API tests                                            |
| FR-08          | Study group create/join endpoints                 | API path implemented; route tests pending                                          |
| FR-09          | Group resource visibility                         | automated: group visibility API test                                               |
| FR-10          | AI service contracts                              | `ai-service/app.py` implemented                                                    |
| FR-11          | Quiz persistence and AI job integration           | automated: `backend/tests/ai-worker.test.js`; games partial, pending team decision |
| FR-12          | Attempt start question delivery                   | automated: `backend/tests/api.test.js`                                             |
| FR-13          | Answer persistence                                | automated: `backend/tests/api.test.js`                                             |
| FR-14          | Server-side scoring                               | automated: `backend/tests/api.test.js`                                             |
| FR-15          | Competitive attempt guard                         | automated: DB invariant and API suites                                             |
| FR-16          | Derived leaderboard                               | automated: ranking and module/group scope API test                                 |
| FR-17          | Student leaderboard authorization                 | automated: student scope and role boundary API test                                |
| FR-18          | Individual analytics                              | automated: `/api/v1/me/analytics` API test                                         |
| FR-19          | Group analytics                                   | automated: group average API test                                                  |
| FR-20          | Module/topic analytics                            | automated: lecturer weak-topic API test                                            |
| FR-21          | `backend/src/profanity/` and visible-text schemas | automated: field matrix API tests and worker re-checks                             |
| NFR01          | Async AI job architecture                         | automated: `backend/tests/ai-worker.test.js`                                       |
| NFR02          | bcrypt and secure session cookies                 | API implementation present                                                         |
| NFR03          | RBAC middleware                                   | API implementation present                                                         |
| NFR04          | React design system                               | automated: `frontend/src/main.test.jsx`; axe tests pending                         |
| NFR05          | Responsive CSS                                    | automated: frontend tests; viewport tests pending                                  |
| NFR06          | Transactional submission                          | API transaction path; real concurrency pending                                     |
| NFR07          | Database constraints/triggers                     | 7 DB invariant tests passed                                                        |
| NFR08          | Zod/Pydantic validation                           | Current API/AI schemas implemented                                                 |
| NFR09          | Upload size limit                                 | Size limit implemented; magic-byte tests pending                                   |
| NFR10          | Browser compatibility                             | Manual/browser tests pending                                                       |
| NFR11          | Separate frontend/backend/AI modules              | Implemented                                                                        |
| NFR12          | Indexes and query paths                           | Foundation indexes present                                                         |
| NFR13          | Backup/recovery                                   | automated: `npm run test:backup`                                                   |
| NFR14          | Resource-level authorization                      | Partial; full matrix pending                                                       |
| NFR15          | Strict AI schemas                                 | Pydantic MockProvider implemented                                                  |
| NFR16          | Generic error responses                           | API error handler implemented                                                      |
| NFR17          | Profanity, generic rejection, cooldown            | 25 profanity tests passed; API/AI integration pending                              |
| INV-01, INV-13 | Competitive uniqueness and atomic submission      | PGlite passes; `npm run test:db:real` required for full row-lock verification      |

Game mechanics are intentionally frozen. The three catalog entries are disabled placeholders; no playable game UI, game logic, or game scoring is implemented.

Automated axe/Playwright and the manual checklist remain required before NFR04/NFR05/NFR10 can be marked done. `npm run test:db:real` fails loudly unless `REAL_TEST_DATABASE_URL` is supplied; concurrency evidence is therefore marked “needs real PostgreSQL” under PGlite.

The route inventory guard is `backend/tests/authorization-matrix.test.js`; it derives registered Express routes and fails when `backend/src/authorization-matrix.js` has no entry. Behavioral 401/403/owner/validation/success cases are covered incrementally in `backend/tests/api.test.js`; exhaustive per-route fixture coverage remains pending.
