# Verification run — 2026-10-27

Variable names were checked without printing values. Present names: `DATABASE_URL`, `TEST_DATABASE_URL`, `PGLITE_DEV_PORT`, `PGLITE_TEST_PORT`. Missing names: `REAL_TEST_DATABASE_URL`, `ANTHROPIC_API_KEY`. Chromium and Firefox Playwright browsers are installed.

| Step                                               | Result                            | Evidence                                                                                                                                                                                                                                              |
| -------------------------------------------------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Prerequisites and repository checks             | passed                            | Environment-name check, Playwright 1.64.0, Chromium and Firefox detected                                                                                                                                                                              |
| 2. Local stack, migrations, seed and reset         | passed                            | `db:status`, setup check, two idempotent `db:migrate` runs, `seed`, and `db:test:reset`                                                                                                                                                               |
| 3. Real PostgreSQL/concurrency verification        | blocked: `REAL_TEST_DATABASE_URL` | Set `REAL_TEST_DATABASE_URL` to a disposable real PostgreSQL test database, then run `npm run test:db:real`. Do not use the PGlite URLs.                                                                                                              |
| 4. Real Anthropic verification                     | blocked: `ANTHROPIC_API_KEY`      | Set `ANTHROPIC_API_KEY`, then run `npm run test:ai:real` after the Anthropic provider fixture is configured. The offline MockProvider tests remain runnable.                                                                                          |
| 5. Built-game student play-throughs                | passed for built games            | Infected: `backend/tests/infected-api.test.js`, frontend component tests, and Playwright flow. Island Escape: `backend/tests/island-escape-api.test.js`, frontend component tests, and Playwright flow. Manual scripts are in `docs/MANUAL_TESTS.md`. |
| 6. Automated quality and full offline suite        | passed                            | 177 JavaScript tests, 4 Python tests, zero skipped; lint, Prettier, TypeScript, and frontend production build passed.                                                                                                                                 |
| 7. Browser accessibility and viewport verification | passed                            | 24 Playwright tests, Chromium/Firefox at 390/768/1280, including axe checks and Infected/Island flows                                                                                                                                                 |
| 8. Backup, traceability and delivery review        | passed with caveat                | JSON backup round-trip and documentation are present; native PostgreSQL dump evidence remains dependent on real PostgreSQL/client binaries.                                                                                                           |

## Built games

- Infected — built and tested. Evidence: 14 engine tests, 15 API tests, DB invariants, component tests, and Playwright/axe flow.
- Island Escape — built and tested. Evidence: 14 engine/property tests, 11 API tests, DB invariants, component tests, and Playwright/axe flow.

## Not verified

- Real PostgreSQL row-locking/concurrency: requires `REAL_TEST_DATABASE_URL` and `npm run test:db:real`.
- Anthropic live-provider behavior: requires `ANTHROPIC_API_KEY` and `npm run test:ai:real`.
- Native PostgreSQL backup/restore: requires `pg_dump`/`pg_restore` against real PostgreSQL.
- Memory Match, Timer Trivia, Boss Battle, and Pixel Car Racer: not built; no verification is claimed.
- Multiplayer rooms and all multiplayer modes: not built and explicitly out of scope.

## Verdict

Ready with caveats: the local PGlite-backed application and the two built solo games pass the offline, API, database, frontend, accessibility, and browser gates. It is not ready for a claim of complete production verification until real PostgreSQL concurrency, live Anthropic behavior, and native dump/restore are run.
