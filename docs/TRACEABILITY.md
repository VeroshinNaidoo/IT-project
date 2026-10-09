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

| ID             | Implementation                                    | Evidence/status                                                                                                                                         |
| -------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-01          | `backend/src/app.js` registration                 | API path implemented; route tests pending                                                                                                               |
| FR-02          | `backend/src/app.js` login/logout/session cookie  | API path implemented; route tests pending                                                                                                               |
| FR-03          | `requireRole` and session role                    | API path implemented; route tests pending                                                                                                               |
| FR-04          | Module creation endpoint                          | API path implemented; route tests pending                                                                                                               |
| FR-05          | Enrollment and module listing                     | API path implemented; route tests pending                                                                                                               |
| FR-06          | Resource upload endpoint                          | API path implemented; upload matrix pending                                                                                                             |
| FR-07          | Resource authorization                            | automated: ownership and role API tests                                                                                                                 |
| FR-08          | Study group create/join endpoints                 | API path implemented; route tests pending                                                                                                               |
| FR-09          | Group resource visibility                         | automated: group visibility API test                                                                                                                    |
| FR-10          | AI service contracts                              | `ai-service/app.py` implemented                                                                                                                         |
| FR-11          | Quiz persistence and AI job integration           | automated: `backend/tests/ai-worker.test.js`, `frontend/src/main.test.jsx`; games partial, pending team decision                                        |
| FR-12          | Attempt start question delivery                   | automated: `backend/tests/api.test.js`                                                                                                                  |
| FR-13          | Answer persistence                                | automated: `backend/tests/api.test.js`                                                                                                                  |
| FR-14          | Server-side scoring                               | automated: `backend/tests/api.test.js`                                                                                                                  |
| FR-15          | Competitive attempt guard                         | automated: DB invariant and API suites                                                                                                                  |
| FR-16          | Derived leaderboard                               | automated: ranking and module/group scope API test                                                                                                      |
| FR-17          | Student leaderboard authorization                 | automated: student scope and role boundary API test                                                                                                     |
| FR-18          | Individual analytics                              | automated: `/api/v1/me/analytics` API test                                                                                                              |
| FR-19          | Group analytics                                   | automated: group average API test                                                                                                                       |
| FR-20          | Module/topic analytics                            | automated: lecturer weak-topic API test                                                                                                                 |
| FR-21          | `backend/src/profanity/` and visible-text schemas | automated: field matrix API tests and worker re-checks                                                                                                  |
| NFR01          | Async AI job architecture                         | automated: `backend/tests/ai-worker.test.js`                                                                                                            |
| NFR02          | bcrypt and secure session cookies                 | API implementation present                                                                                                                              |
| NFR03          | RBAC middleware                                   | API implementation present                                                                                                                              |
| NFR04          | React design system                               | automated UI tests; axe suite present but browser executables unavailable in this run                                                                   |
| NFR05          | Responsive CSS                                    | automated frontend tests; six viewport projects present, execution pending                                                                              |
| NFR06          | Transactional submission                          | API transaction path; real concurrency pending                                                                                                          |
| NFR07          | Database constraints/triggers                     | 7 DB invariant tests passed                                                                                                                             |
| NFR08          | Zod/Pydantic validation                           | Current API/AI schemas implemented                                                                                                                      |
| NFR09          | Upload size limit                                 | Size limit implemented; magic-byte tests pending                                                                                                        |
| NFR10          | Browser compatibility                             | Playwright Chromium/Firefox projects present; execution blocked by missing browser binaries                                                             |
| NFR11          | Separate frontend/backend/AI modules              | Implemented                                                                                                                                             |
| NFR12          | Indexes and query paths                           | Foundation indexes present                                                                                                                              |
| NFR13          | Backup/recovery                                   | Native `npm run backup:pg`/`restore:pg` against real PostgreSQL; JSON fallback is separately tested and does not satisfy native-dump evidence           |
| NFR14          | Resource-level authorization                      | automated: `backend/tests/authorization-matrix.test.js`; 26 routes with executable session/role/owner/validation/success and sensitive-field assertions |
| NFR15          | Strict AI schemas                                 | Pydantic MockProvider implemented                                                                                                                       |
| NFR16          | Generic error responses                           | API error handler implemented                                                                                                                           |
| NFR17          | Profanity, generic rejection, cooldown            | 25 profanity tests passed; API/AI integration pending                                                                                                   |
| INV-01, INV-13 | Competitive uniqueness and atomic submission      | PGlite passes; `npm run test:db:real` required for full row-lock verification                                                                           |

Game mechanics are intentionally frozen. The three catalog entries are disabled placeholders; no playable game UI, game logic, or game scoring is implemented.

Automated axe/Playwright and the manual checklist remain required before NFR04/NFR05/NFR10 can be marked done. `npm run test:db:real` fails loudly unless `REAL_TEST_DATABASE_URL` is supplied; concurrency evidence is therefore marked “needs real PostgreSQL” under PGlite.

The route authorization guard is `backend/tests/authorization-matrix.test.js`; it derives 26 registered Express routes, requires a concrete case function for every route, and executes real fixtures. The matrix includes 23 protected routes with unauthenticated and revoked-session assertions; restricted-role assertions cover 7 lecturer-only and 3 student-only routes; owner-sensitive paths use unrelated UUIDs; all routes have validation and success-shape assertions. Responses are checked for password hashes and pre-submission correctness leakage.

Matrix assertion accounting: public routes (3) execute 15 direct case assertions; protected routes (23) execute 186 direct case assertions, including 23 unauthenticated, 23 revoked-session, 10 restricted-role, 15 owner, 23 validation, and 92 success/sensitive-field assertions. The inventory and game-policy guards add 3 assertions.
