# Traceability

Milestone 1 establishes the database foundation. Detailed file/test mappings will be expanded at each milestone gate.

| Requirement                                     | Implementation/evidence                                      | Verification                                                   |
| ----------------------------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------- |
| FR-01–FR-20                                     | Scheduled across Milestones 2–7                              | Added before each gate                                         |
| NFR02, NFR03, NFR07, NFR08, NFR11, NFR12, NFR14 | `db/migrations/002_schema.sql`, `003_invariants.sql`         | `backend/tests/database.invariants.test.js`                    |
| NFR04, NFR05, NFR10                             | `docs/MANUAL_TESTS.md`; frontend test plan                   | Automated + manual in Milestone 7                              |
| NFR15                                           | `docs/API.md`; AI service in Milestone 4                     | AI schema tests in Milestone 4                                 |
| FR-21                                           | `backend/src/profanity/`; user-visible text schemas/services | `backend/tests/profanity.test.js`; later API/AI/frontend tests |
| NFR17                                           | `backend/src/profanity/`, `rate-limit.js`; backend authority | `backend/tests/profanity.test.js`; later API/AI/frontend tests |
