# EduQuest requirement status

Strict status as of 2026-10-09. “Done and tested” requires a passing automated test; implementation alone is not enough.

| ID    | Status                          | Implementation                                                                                  | Passing test/evidence                                                   |
| ----- | ------------------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| FR-01 | done and tested                 | `backend/src/app.js`                                                                            | `backend/tests/api.test.js`                                             |
| FR-02 | done and tested                 | `backend/src/app.js`                                                                            | `backend/tests/api.test.js`                                             |
| FR-03 | done and tested                 | `backend/src/app.js`                                                                            | `backend/tests/api.test.js`                                             |
| FR-04 | done and tested                 | `backend/src/app.js`                                                                            | `backend/tests/api.test.js`                                             |
| FR-05 | done and tested                 | `backend/src/app.js`                                                                            | `backend/tests/api.test.js`                                             |
| FR-06 | done and tested                 | `backend/src/app.js`                                                                            | `backend/tests/api.test.js`                                             |
| FR-07 | not started                     | —                                                                                               | None                                                                    |
| FR-08 | done and tested                 | `backend/src/app.js`                                                                            | `backend/tests/api.test.js`                                             |
| FR-09 | not started                     | —                                                                                               | None                                                                    |
| FR-10 | done and tested                 | `ai-service/app.py`                                                                             | `ai-service/test_app.py`                                                |
| FR-11 | done and tested                 | `backend/src/app.js`, `backend/scripts/ai-worker.js`, `db/migrations/004_game_type_catalog.sql` | `backend/tests/ai-worker.test.js`; games partial, pending team decision |
| FR-12 | done and tested                 | `backend/src/app.js`                                                                            | `backend/tests/api.test.js` start-attempt test                          |
| FR-13 | done and tested                 | `backend/src/app.js`                                                                            | `backend/tests/api.test.js` answer persistence test                     |
| FR-14 | done and tested                 | `backend/src/app.js`                                                                            | `backend/tests/api.test.js` server-scoring test                         |
| FR-15 | done and tested                 | `db/migrations/003_invariants.sql`, `backend/src/app.js`                                        | DB invariant and API second-attempt tests                               |
| FR-16 | done and tested                 | `backend/src/app.js`                                                                            | `backend/tests/api.test.js` ranking/scope test                          |
| FR-17 | done and tested                 | `backend/src/app.js`                                                                            | `backend/tests/api.test.js` student authorization test                  |
| FR-18 | done and tested                 | `backend/src/app.js`                                                                            | `backend/tests/api.test.js` individual analytics test                   |
| FR-19 | done and tested                 | `backend/src/app.js`                                                                            | `backend/tests/api.test.js` group analytics test                        |
| FR-20 | done and tested                 | `backend/src/app.js`                                                                            | `backend/tests/api.test.js` module/topic analytics test                 |
| FR-21 | done and tested                 | `backend/src/profanity/`, `backend/src/app.js`                                                  | `backend/tests/profanity.test.js`, `backend/tests/api.test.js`          |
| NFR01 | done and tested                 | `ai-service/app.py`, `backend/scripts/ai-worker.js`, `ai_generation_jobs` schema                | `backend/tests/ai-worker.test.js`                                       |
| NFR02 | done and tested                 | `backend/src/app.js`                                                                            | `backend/tests/api.test.js`                                             |
| NFR03 | done and tested                 | `backend/src/app.js`                                                                            | `backend/tests/api.test.js`                                             |
| NFR04 | implemented, untested           | `frontend/src/`, `frontend/src/main.test.jsx`                                                   | UI tests pass; axe evidence pending                                     |
| NFR05 | implemented, untested           | `frontend/src/styles.css`, `frontend/src/main.test.jsx`                                         | Responsive CSS/UI tests pass; viewport evidence pending                 |
| NFR06 | done and tested                 | `backend/src/app.js`                                                                            | `backend/tests/api.test.js` transaction/idempotency tests               |
| NFR07 | done and tested                 | `db/migrations/`                                                                                | 8 DB invariant tests                                                    |
| NFR08 | done and tested at schema level | `backend/src/app.js`, `ai-service/app.py`                                                       | `profanity.test.js`, `test_app.py`                                      |
| NFR09 | done and tested                 | `backend/src/app.js`                                                                            | `backend/tests/api.test.js`                                             |
| NFR10 | not started                     | —                                                                                               | None                                                                    |
| NFR11 | done and tested                 | `frontend/`, `backend/`, `ai-service/`                                                          | frontend build, frontend tests, pytest                                  |
| NFR12 | implemented, untested           | `db/migrations/003_invariants.sql`                                                              | None                                                                    |
| NFR13 | done and tested                 | `scripts/db-backup.mjs`, `scripts/db-restore.mjs`                                               | `npm run test:backup`                                                   |
| NFR14 | implemented, untested           | `backend/src/app.js`, `backend/src/authorization-matrix.js`                                     | Route inventory guard passes; exhaustive behavior matrix pending        |
| NFR15 | done and tested                 | `ai-service/app.py`                                                                             | `test_app.py`                                                           |
| NFR16 | done and tested                 | `backend/src/app.js`                                                                            | `backend/tests/api.test.js`                                             |
| NFR17 | done and tested                 | `backend/src/profanity/`                                                                        | `backend/tests/profanity.test.js`, `backend/tests/api.test.js`          |

Current passing baseline: 32 JavaScript tests, 2 AI tests, zero skipped database tests. Real PostgreSQL concurrency remains explicitly unverified under PGlite.
