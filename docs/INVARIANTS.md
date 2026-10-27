# Invariant register

| ID     | Rule                                                                         | Milestone 1 enforcement                                    | Proof                                                           |
| ------ | ---------------------------------------------------------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------- |
| INV-01 | One scored attempt per student per competitive quiz                          | Partial unique index; locked service transaction           | Raw SQL and API second-attempt tests                            |
| INV-02 | At most one correct option per question                                      | Partial unique index                                       | Raw SQL constraint test                                         |
| INV-03 | Scores/correctness are server-owned                                          | Strict submit schema and server scoring                    | API forged-score and scoring tests                              |
| INV-04 | Correct answers are not exposed                                              | Attempt response excludes correctness flags                | API start-attempt test                                          |
| INV-05 | Students cannot access lecturer functions/data                               | Service in Milestone 2 onward                              | Authorization tests                                             |
| INV-06 | Lecturers manage only their modules                                          | Quiz ownership trigger plus service checks                 | Raw SQL and API tests                                           |
| INV-07 | Group members are enrolled students                                          | Role and membership triggers                               | Raw SQL constraint test                                         |
| INV-08 | Group resources match module scope                                           | Resource trigger                                           | Raw SQL constraint test                                         |
| INV-09 | Leaderboard uses completed scored attempts                                   | Query in Milestone 6                                       | Analytics test                                                  |
| INV-10 | Passwords are never plain text                                               | Auth implementation in Milestone 2                         | Auth test                                                       |
| INV-11 | Invalid AI output is not persisted                                           | Worker validates shape/profanity before transaction        | `backend/tests/ai-worker.test.js`                               |
| INV-12 | Upload type/size restrictions                                                | Resource implementation in Milestone 3                     | Upload tests                                                    |
| INV-13 | Submission is atomic/idempotent                                              | Row lock, transaction, and completed-attempt replay        | API replay test; real PostgreSQL concurrency pending            |
| INV-14 | Emails are case-insensitively unique                                         | `citext` unique constraint                                 | Raw SQL constraint test                                         |
| INV-15 | User-visible and AI-generated text contains no profanity                     | Shared backend profanity module, schemas, and AI re-check  | `backend/tests/profanity.test.js` plus later API/AI tests       |
| INV-16 | Infected cure always remains within 0..100                                   | DB checks and pure-engine clamp                            | Raw SQL and property-based engine tests                         |
| INV-17 | Infected hearts always remain within 0..3                                    | DB checks and pure-engine clamp                            | Raw SQL and property-based engine tests                         |
| INV-18 | Every wrong Infected answer costs exactly one heart                          | DB trigger and pure transition table                       | Raw SQL, transition-table, and API loss-run tests               |
| INV-19 | Terminal Infected sessions accept no new moves and answered turns apply once | Status checks, immutable-answer trigger, locked API update | Raw SQL, engine terminal, double-answer, and terminal API tests |
| INV-20 | An Infected question is never offered twice in one session                   | Unique `(session_id, question_id)` card constraint         | Raw SQL and card-selection/API exhaustion tests                 |
| INV-21 | Infected correctness is never exposed before answer submission               | Card/question response serializers omit correctness        | API and frontend pre-answer disclosure tests                    |
| INV-22 | Infected results never affect scored attempts, leaderboards, or analytics    | Separate game tables and practice-only service             | API isolation test                                              |
| INV-23 | Game types are catalogued data; unapproved game types remain disabled        | `game_types` FK and enabled flag                           | Raw SQL catalog test                                            |

Game access policy is centralized in `canAccessGame`: lecturers always have access; students on competitive quizzes require their own completed scored attempt. The three seeded game types are disabled placeholders only.
