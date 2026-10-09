# EduQuest

## Milestone 1 foundation

Requirements: Node.js 22+, Docker Desktop.

```powershell
Copy-Item .env.example .env
npm install
docker compose up -d postgres
npm run db:migrate
npm test
```

`npm test` requires `TEST_DATABASE_URL` (or `DATABASE_URL`) in the EduQuest `.env`, resets the test database schema, reapplies all migrations, and then runs the raw SQL invariant tests. To explicitly opt out, set `EDUQUEST_SKIP_DB_TESTS=true`; this prints a warning and is not a passing database gate.

To reset the test database manually:

```powershell
npm run db:test:reset
```

This drops and recreates only the `public` schema in the configured test database, then runs all migrations. Do not point `TEST_DATABASE_URL` at a production database.

The database uses UUIDs, server-side opaque sessions, persistent AI jobs, module join codes, topic-linked questions, and database-enforced academic invariants. See `docs/DECISIONS.md` and `docs/INVARIANTS.md`.
