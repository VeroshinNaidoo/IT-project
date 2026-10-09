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
- FR-21/NFR17 use the maintained `obscenity` library plus editable custom and allow JSON lists. Matching normalizes accents, leetspeak, separators, and repeated letters, then uses token boundaries and an allow-list to reduce false positives. The backend re-checks all user-visible fields and AI output; frontend checks are advisory only. Offending text is never logged or echoed, and ten violations within ten minutes trigger a temporary cooldown without an automatic ban. The confident custom terms currently included are `fok`, `kak`, `poes`, and `isifebe`; uncertain regional terms are intentionally not guessed. No filter is perfect, determined users can invent spellings, and the custom list needs periodic review.
- Deletion policy: academic records use `RESTRICT`; owned children such as options, answers, group membership, games, and questions cascade where safe.
- The requested PGlite local database is an approved local-development deviation. PGlite does not provide the `citext` contrib extension, so emails are stored lowercased with a `lower(email)` unique index and a database check. The application lowercases emails before persistence. PGlite's socket server serializes query execution; it cannot fully prove row-locking/concurrency behavior. The concurrency tests remain in the suite and are marked for real PostgreSQL verification through `REAL_TEST_DATABASE_URL`.
- PGlite also does not expose the `pgcrypto` extension, but its PostgreSQL-compatible engine provides `gen_random_uuid()` as a built-in function, so the extension request was removed without changing UUID defaults or constraints.
