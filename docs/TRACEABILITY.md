# EduQuest traceability

Status reflects the current local implementation. PGlite evidence is explicitly not equivalent to real PostgreSQL concurrency evidence.

| ID             | Implementation                                    | Evidence/status                                                               |
| -------------- | ------------------------------------------------- | ----------------------------------------------------------------------------- |
| FR-01          | `backend/src/app.js` registration                 | API path implemented; route tests pending                                     |
| FR-02          | `backend/src/app.js` login/logout/session cookie  | API path implemented; route tests pending                                     |
| FR-03          | `requireRole` and session role                    | API path implemented; route tests pending                                     |
| FR-04          | Module creation endpoint                          | API path implemented; route tests pending                                     |
| FR-05          | Enrollment and module listing                     | API path implemented; route tests pending                                     |
| FR-06          | Resource upload endpoint                          | API path implemented; upload matrix pending                                   |
| FR-07          | Resource authorization                            | Service work pending                                                          |
| FR-08          | Study group create/join endpoints                 | API path implemented; route tests pending                                     |
| FR-09          | Group resource visibility                         | Service work pending                                                          |
| FR-10          | AI service contracts                              | `ai-service/app.py` implemented                                               |
| FR-11          | Quiz persistence and AI job integration           | Quiz endpoint implemented; async job worker pending                           |
| FR-12          | Attempt start question delivery                   | API path implemented                                                          |
| FR-13          | Answer persistence                                | API path implemented                                                          |
| FR-14          | Server-side scoring                               | API path implemented                                                          |
| FR-15          | Competitive attempt guard                         | DB partial unique index plus service path                                     |
| FR-16          | Derived leaderboard                               | API path implemented                                                          |
| FR-17          | Student leaderboard authorization                 | Service hardening pending                                                     |
| FR-18          | Individual analytics                              | Analytics expansion pending                                                   |
| FR-19          | Group analytics                                   | Analytics expansion pending                                                   |
| FR-20          | Module/topic analytics                            | Weak-topic API path implemented                                               |
| FR-21          | `backend/src/profanity/` and visible-text schemas | 25 profanity tests passed                                                     |
| NFR01          | Async AI job architecture                         | Job table present; worker pending                                             |
| NFR02          | bcrypt and secure session cookies                 | API implementation present                                                    |
| NFR03          | RBAC middleware                                   | API implementation present                                                    |
| NFR04          | React design system                               | Frontend shell; axe tests pending                                             |
| NFR05          | Responsive CSS                                    | Mobile layout; viewport tests pending                                         |
| NFR06          | Transactional submission                          | API transaction path; real concurrency pending                                |
| NFR07          | Database constraints/triggers                     | 7 DB invariant tests passed                                                   |
| NFR08          | Zod/Pydantic validation                           | Current API/AI schemas implemented                                            |
| NFR09          | Upload size limit                                 | Size limit implemented; magic-byte tests pending                              |
| NFR10          | Browser compatibility                             | Manual/browser tests pending                                                  |
| NFR11          | Separate frontend/backend/AI modules              | Implemented                                                                   |
| NFR12          | Indexes and query paths                           | Foundation indexes present                                                    |
| NFR13          | Backup/recovery                                   | Pending hardening                                                             |
| NFR14          | Resource-level authorization                      | Partial; full matrix pending                                                  |
| NFR15          | Strict AI schemas                                 | Pydantic MockProvider implemented                                             |
| NFR16          | Generic error responses                           | API error handler implemented                                                 |
| NFR17          | Profanity, generic rejection, cooldown            | 25 profanity tests passed; API/AI integration pending                         |
| INV-01, INV-13 | Competitive uniqueness and atomic submission      | PGlite passes; `npm run test:db:real` required for full row-lock verification |
