# Decisions

## 2026-10-09 — Milestone 1 foundation

- Use UUID primary keys throughout; `group_members` uses a composite `(group_id, student_id)` primary key.
- Use opaque random session tokens stored only as hashes in `sessions`; cookies are httpOnly and JWTs are not used. Logout revokes the server-side session.
- Add `ai_generation_jobs` for persistent asynchronous generation and status polling.
- Modules use a random unique `join_code` for student self-enrolment; `module_code` remains an academic identifier only.
- Add quiz `title` and optional `closes_at`; the service rejects starts and submissions after the close time with HTTP 409.
- Mini-scope is a short per-topic revision summary from one resource. Analysis is lecturer-facing and receives only aggregate topic statistics; no student names, emails, or IDs are sent to AI.
- Allowed game types are `flashcards`, `speed_round`, and `match_pairs`. Games are practice-only and reuse quiz questions. Competitive games are gated until the student's scored attempt is complete; lecturers always have access.
- Unanswered questions score zero and do not create `student_answers` rows. Results report the unanswered count.
- Upload maximum defaults to 20 MiB and is configurable through environment configuration.
- `COOKIE_SECURE` defaults to true. It may be false only in development; production startup must reject that configuration.
- Leaderboards use standard competition ranking (`1, 1, 3`), ordered by score descending and earlier completion time. Equal rank requires identical score and completion time.
- NFR04, NFR05, and NFR10 use automated axe and Playwright viewport/browser checks plus a manual checklist documented in `docs/MANUAL_TESTS.md`.
- Deletion policy: academic records use `RESTRICT`; owned children such as options, answers, group membership, games, and questions cascade where safe.
