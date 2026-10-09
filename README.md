# EduQuest

## Local development

Requirements: Node.js 22+ and Python 3.11+. PostgreSQL-compatible PGlite runs locally through the normal `pg` driver; no system database installation is required.

```powershell
npm install
npm run db:start
npm run db:migrate
npm run seed
npm test
npm run test:backup
```

`db:start` creates `.pgdata/dev` and `.pgdata/test`, writes `.env`, starts the two local socket servers, and waits for both to accept connections. `npm run db:stop` stops them and `npm run db:status` checks them.

Run the API, MockProvider AI service, and React frontend together with:

```powershell
npm run dev
```

`npm test` requires `TEST_DATABASE_URL` (or `DATABASE_URL`) in the EduQuest `.env`, resets the test database schema, reapplies all migrations, and then runs the raw SQL invariant tests. To explicitly opt out, set `EDUQUEST_SKIP_DB_TESTS=true`; this prints a warning and is not a passing database gate.

To reset the test database manually:

```powershell
npm run db:test:reset
```

This drops and recreates only the `public` schema in the configured test database, then runs all migrations. Do not point `TEST_DATABASE_URL` at a production database.

The database uses UUIDs, server-side opaque sessions, persistent AI jobs, module join codes, topic-linked questions, and database-enforced academic invariants. See `docs/DECISIONS.md` and `docs/INVARIANTS.md`.

Create and restore an application-level JSON backup with `npm run db:backup -- backups/eduquest.json` and `npm run db:restore -- backups/eduquest.json`. Restore is explicit and should target only a known EduQuest database. `npm run test:backup` verifies a round trip against `TEST_DATABASE_URL`.

For full row-locking and concurrency evidence, provide a real PostgreSQL URL through `REAL_TEST_DATABASE_URL` and run `npm run test:db:real`. PGlite intentionally cannot certify that part of the gate.

The seed prints the demo credentials. Defaults are:

- Lecturer: `demo-lecturer@example.com` / `EduQuestDemo123!`
- Students: `demo-student-1@example.com` through `demo-student-5@example.com` / `EduQuestDemo123!`
- Module: `DEMO101`, JoinCode `DEMOJOIN2026`
