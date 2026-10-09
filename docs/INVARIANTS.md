# Invariant register

| ID     | Rule                                                | Milestone 1 enforcement                                           | Proof                   |
| ------ | --------------------------------------------------- | ----------------------------------------------------------------- | ----------------------- |
| INV-01 | One scored attempt per student per competitive quiz | Partial unique index; service transaction in Milestone 5          | Raw SQL constraint test |
| INV-02 | At most one correct option per question             | Partial unique index                                              | Raw SQL constraint test |
| INV-03 | Scores/correctness are server-owned                 | Schema does not accept client score logic; service in Milestone 5 | Milestone 5 API test    |
| INV-04 | Correct answers are not exposed                     | Service/API in Milestone 5                                        | Milestone 5 API test    |
| INV-05 | Students cannot access lecturer functions/data      | Service in Milestone 2 onward                                     | Authorization tests     |
| INV-06 | Lecturers manage only their modules                 | Quiz ownership trigger plus service checks                        | Raw SQL and API tests   |
| INV-07 | Group members are enrolled students                 | Role and membership triggers                                      | Raw SQL constraint test |
| INV-08 | Group resources match module scope                  | Resource trigger                                                  | Raw SQL constraint test |
| INV-09 | Leaderboard uses completed scored attempts          | Query in Milestone 6                                              | Analytics test          |
| INV-10 | Passwords are never plain text                      | Auth implementation in Milestone 2                                | Auth test               |
| INV-11 | Invalid AI output is not persisted                  | AI implementation in Milestone 4                                  | AI integration test     |
| INV-12 | Upload type/size restrictions                       | Resource implementation in Milestone 3                            | Upload tests            |
| INV-13 | Submission is atomic/idempotent                     | Transaction in Milestone 5                                        | Concurrency test        |
| INV-14 | Emails are case-insensitively unique                | `citext` unique constraint                                        | Raw SQL constraint test |
