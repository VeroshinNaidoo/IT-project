# EduQuest requirement status

Strict status as of 2026-10-09. “Done and tested” requires a passing automated test; implementation alone is not enough.

| ID    | Status                          | Implementation                                       | Passing test/evidence                                          |
| ----- | ------------------------------- | ---------------------------------------------------- | -------------------------------------------------------------- |
| FR-01 | done and tested                 | `backend/src/app.js`                                 | `backend/tests/api.test.js`                                    |
| FR-02 | done and tested                 | `backend/src/app.js`                                 | `backend/tests/api.test.js`                                    |
| FR-03 | done and tested                 | `backend/src/app.js`                                 | `backend/tests/api.test.js`                                    |
| FR-04 | done and tested                 | `backend/src/app.js`                                 | `backend/tests/api.test.js`                                    |
| FR-05 | done and tested                 | `backend/src/app.js`                                 | `backend/tests/api.test.js`                                    |
| FR-06 | done and tested                 | `backend/src/app.js`                                 | `backend/tests/api.test.js`                                    |
| FR-07 | not started                     | —                                                    | None                                                           |
| FR-08 | done and tested                 | `backend/src/app.js`                                 | `backend/tests/api.test.js`                                    |
| FR-09 | not started                     | —                                                    | None                                                           |
| FR-10 | done and tested                 | `ai-service/app.py`                                  | `ai-service/test_app.py`                                       |
| FR-11 | implemented, untested           | `backend/src/app.js`, `backend/scripts/ai-worker.js` | API queue/status test; worker integration pending              |
| FR-12 | implemented, untested           | `backend/src/app.js`                                 | None                                                           |
| FR-13 | implemented, untested           | `backend/src/app.js`                                 | None                                                           |
| FR-14 | implemented, untested           | `backend/src/app.js`                                 | None                                                           |
| FR-15 | done and tested at DB level     | `db/migrations/003_invariants.sql`                   | `database.invariants.test.js`                                  |
| FR-16 | implemented, untested           | `backend/src/app.js`                                 | None                                                           |
| FR-17 | not started                     | —                                                    | None                                                           |
| FR-18 | not started                     | —                                                    | None                                                           |
| FR-19 | not started                     | —                                                    | None                                                           |
| FR-20 | implemented, untested           | `backend/src/app.js`                                 | None                                                           |
| FR-21 | done and tested                 | `backend/src/profanity/`                             | `backend/tests/profanity.test.js`, `backend/tests/api.test.js` |
| NFR01 | implemented, untested           | `ai-service/app.py`, `ai_generation_jobs` schema     | None                                                           |
| NFR02 | done and tested                 | `backend/src/app.js`                                 | `backend/tests/api.test.js`                                    |
| NFR03 | done and tested                 | `backend/src/app.js`                                 | `backend/tests/api.test.js`                                    |
| NFR04 | implemented, untested           | `frontend/src/`                                      | None                                                           |
| NFR05 | implemented, untested           | `frontend/src/styles.css`                            | None                                                           |
| NFR06 | implemented, untested           | `backend/src/app.js`                                 | None                                                           |
| NFR07 | done and tested                 | `db/migrations/`                                     | 7 DB invariant tests                                           |
| NFR08 | done and tested at schema level | `backend/src/app.js`, `ai-service/app.py`            | `profanity.test.js`, `test_app.py`                             |
| NFR09 | done and tested                 | `backend/src/app.js`                                 | `backend/tests/api.test.js`                                    |
| NFR10 | not started                     | —                                                    | None                                                           |
| NFR11 | done and tested by build        | `frontend/`, `backend/`, `ai-service/`               | frontend build, pytest                                         |
| NFR12 | implemented, untested           | `db/migrations/003_invariants.sql`                   | None                                                           |
| NFR13 | not started                     | —                                                    | None                                                           |
| NFR14 | done and tested                 | `backend/src/app.js`                                 | `backend/tests/api.test.js`                                    |
| NFR15 | done and tested                 | `ai-service/app.py`                                  | `test_app.py`                                                  |
| NFR16 | done and tested                 | `backend/src/app.js`                                 | `backend/tests/api.test.js`                                    |
| NFR17 | done and tested                 | `backend/src/profanity/`                             | `backend/tests/profanity.test.js`, `backend/tests/api.test.js` |

Current passing baseline: 32 JavaScript tests, 2 AI tests, zero skipped database tests. Real PostgreSQL concurrency remains explicitly unverified under PGlite.
